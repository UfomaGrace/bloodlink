// Every path the interface calls. Each one is in contract/openapi.yaml; add nothing that is not.
import { apiFetch } from './client';
import type {
  Availability,
  AvailabilityQuery,
  BloodRequest,
  BloodRequestCreate,
  BloodRequestPage,
  Declination,
  Organisation,
  OrganisationQuery,
  RequestQuery,
  Session,
  SessionCreate,
  Unit,
  UnitCreate,
  UnitPage,
  UnitQuery,
} from './types';

export const api = {
  /** POST /sessions (sign in). */
  createSession: (body: SessionCreate) =>
    apiFetch<Session>('/sessions', { method: 'POST', body, auth: false, mockPreferCode: 201 }),

  /** GET /actuator/health. Also wakes a sleeping free-tier service before the demo. */
  health: () => apiFetch<{ status: 'UP' | 'DOWN' }>('/actuator/health', { auth: false, timeoutMs: 60_000 }),

  listOrganisations: (query: OrganisationQuery, signal?: AbortSignal) =>
    apiFetch<{ items: Organisation[] }>('/organisations', { query, signal }),

  listUnits: (query: UnitQuery, signal?: AbortSignal) => apiFetch<UnitPage>('/units', { query, signal }),

  /** POST /units. Not idempotent: a repeated reference comes back as 409 DUPLICATE_UNIT_REFERENCE. */
  recordUnit: (body: UnitCreate) => apiFetch<Unit>('/units', { method: 'POST', body, mockPreferCode: 201 }),

  searchAvailability: (query: AvailabilityQuery, signal?: AbortSignal) =>
    apiFetch<Availability>('/availability', { query, signal }),

  listRequests: (query: RequestQuery, signal?: AbortSignal) =>
    apiFetch<BloodRequestPage>('/requests', { query, signal }),

  /** POST /requests. Safe to repeat with the same Idempotency-Key: 201 first time, 200 on a replay. */
  createRequest: (body: BloodRequestCreate, idempotencyKey: string) =>
    apiFetch<BloodRequest>('/requests', { method: 'POST', body, idempotencyKey, mockPreferCode: 201 }),

  getRequest: (requestId: string, signal?: AbortSignal) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}`, { signal }),

  /** POST /requests/{id}/approval. Reserves units; 409 UNITS_NO_LONGER_AVAILABLE when another took them. */
  approveRequest: (requestId: string) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/approval`, {
      method: 'POST',
      mockPreferCode: 201,
    }),

  /** POST /requests/{id}/declination. */
  declineRequest: (requestId: string, body: Declination) =>
    apiFetch<BloodRequest>(`/requests/${encodeURIComponent(requestId)}/declination`, {
      method: 'POST',
      body,
      mockPreferCode: 201,
    }),
};
