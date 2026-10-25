// useAsync: load data for a screen and track loading / error / data.
//
//   const units = useAsync((signal) => api.listUnits(query, signal).then((r) => r.data), [page, state]);
//
// - Runs `load` on mount and whenever a value in `deps` changes (like useEffect).
// - Each run gets its own AbortSignal. When deps change or the screen unmounts, the old
//   request is aborted and its result (or error) is ignored, so a slow old answer can
//   never overwrite a newer one.
// - Errors come back as ApiError, so screens can show error.message and error.requestId.
// - reload() runs it again with the same deps (the "Retry" button).

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { toApiError, type ApiError } from "../api/client";

export type AsyncResult<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
};

type AsyncState<T> = Omit<AsyncResult<T>, "reload">;

function sameDeps(a: DependencyList, b: DependencyList): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  const [prevDeps, setPrevDeps] = useState<DependencyList>(deps);

  // Deps changed: switch to loading in this same render, so the screen never
  // shows the old error or "no results" for a moment before the new request starts.
  if (!sameDeps(prevDeps, deps)) {
    setPrevDeps(deps);
    setState((s) => ({ data: s.data, error: null, loading: true }));
  }

  // Always call the latest `load` without making it a dependency
  // (it's usually a new arrow function on every render).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setState((s) => ({ data: s.data, error: toApiError(e), loading: false }));
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists the deps, as with useEffect
  }, [...deps, attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ data: s.data, error: null, loading: true }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
