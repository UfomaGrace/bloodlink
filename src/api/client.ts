// One place where every call to the service is made. It adds the agreed headers:
//   Authorization: Bearer <token>   from POST /sessions
//   X-Request-Id: <uuid>            new per user action, shown in errors as "Reference: ..."
//   Idempotency-Key: <uuid>         only when the caller passes one (POST /requests)
// and turns every failure into an ApiError the screens can switch on (error.code).

import type { ApiErrorCode, FieldIssue } from "./types";


export type ClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly requestId: string;
  readonly details: FieldIssue[];

  constructor(init: {
    status: number;
    code: ClientErrorCode;
    message: string;
    requestId: string;
    details?: FieldIssue[];
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details ?? [];
  }

  /** True when we could not tell whether the service received the request. */
  get isConnectionProblem(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError({
    status: 0,
    code: 'INTERNAL_ERROR',
    message: 'Something unexpected happened in the app. Please try again.',
    requestId: '—',
  });
}

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** True when pointing at the Prism mock. Enables the mock-only controls; never true in production. */
export const IS_MOCK = import.meta.env.VITE_MOCK === 'true';

let authToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;
let forcedMockCode: number | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

/** Mock only: ask Prism for this status code on every call (`Prefer: code=409`). */
export function setForcedMockCode(code: number | null): void {
  forcedMockCode = code;
}

export function getForcedMockCode(): number | null {
  return forcedMockCode;
}

export function newId(): string {
  return crypto.randomUUID();
}

type QueryValue = string | number | undefined | null;
export type QueryMap = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: QueryMap;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Send the token (default true). */
  auth?: boolean;
  /** Mock only: status Prism should return when no code is forced. */
  mockPreferCode?: number;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  requestId: string;
  headers: Headers;
}

function isErrorBody(
  value: unknown,
): value is { code: ApiErrorCode; message: string; requestId?: string; details?: FieldIssue[] } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.message === 'string';
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Sign in to continue.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'We could not find that.';
  if (status === 409) return 'This changed while you were looking at it. Refresh and try again.';
  if (status === 422) return 'Some fields need attention.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return 'The request could not be completed.';
}

function fallbackCode(status: number): ClientErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'MALFORMED_REQUEST';
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const requestId = newId();
  const url = new URL(BASE_URL + path, window.location.origin);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers = new Headers({ Accept: 'application/json', 'X-Request-Id': requestId });
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.auth !== false && authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);
  if (IS_MOCK) {
    const code = forcedMockCode ?? opts.mockPreferCode;
    if (code) headers.set('Prefer', `code=${code}`);
  }

  // Our own timeout, plus the caller's signal (a screen that unmounts cancels its reads).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  const outer = opts.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (outer?.aborted) throw e; // cancelled by the screen; nobody is waiting for an answer
    const timedOut = controller.signal.aborted;
    throw new ApiError({
      status: 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut
        ? 'The service took too long to answer. Check your connection and try again.'
        : 'Could not reach the BloodLink service. Check your connection and try again.',
      requestId,
    });
  }
  clearTimeout(timer);

  const echoedId = res.headers.get('X-Request-Id') ?? requestId;
  const text = await res.text().catch(() => '');
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok) {
    const body = isErrorBody(json) ? json : null;
    const error = new ApiError({
      status: res.status,
      code: body?.code ?? fallbackCode(res.status),
      message: body?.message ?? fallbackMessage(res.status),
      requestId: body?.requestId ?? echoedId,
      details: body?.details ?? [],
    });
    if (error.code === 'UNAUTHENTICATED' && opts.auth !== false) onUnauthenticated?.();
    throw error;
  }

  return { data: json as T, status: res.status, requestId: echoedId, headers: res.headers };
}
