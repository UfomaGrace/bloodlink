// useIdempotencyKey: one Idempotency-Key per submission, for POST /requests.
//
//   const idempotency = useIdempotencyKey();
//   const res = await api.createRequest(body, idempotency.keyFor(body));
//   idempotency.renew(); // after a success, or after 422 IDEMPOTENCY_KEY_REUSED
//
// - keyFor(body) returns the same key for the same body, so every retry of one submission
//   (after a timeout, a dropped connection or a 5xx) is a safe replay: the service answers
//   200 with the request it already created instead of recording a second one.
// - A different body (the user changed the form) gets a new key, so the service never sees
//   one key with two bodies.
// - renew() forgets the key: the next keyFor() starts a new submission even for the same body.
// - Lives in a ref: changing the key never re-renders the screen.

import { useCallback, useMemo, useRef } from "react";
import { newId } from "../api/client";

export type IdempotencyKey = {
  /** The key for this body: the current one if the body is unchanged, otherwise a new one. */
  keyFor: (body: unknown) => string;
  /** Start a new submission next time. */
  renew: () => void;
};

export function useIdempotencyKey(): IdempotencyKey {
  const current = useRef<{ key: string; fingerprint: string } | null>(null);

  const keyFor = useCallback((body: unknown) => {
    // The body is built field by field in a fixed order, so the same values give the same JSON.
    const fingerprint = JSON.stringify(body);
    if (current.current?.fingerprint !== fingerprint) current.current = { key: newId(), fingerprint };
    return current.current.key;
  }, []);

  const renew = useCallback(() => {
    current.current = null;
  }, []);

  return useMemo(() => ({ keyFor, renew }), [keyFor, renew]);
}
