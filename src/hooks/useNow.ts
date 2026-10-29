// useNow: the current time in milliseconds, updated every `intervalMs`.
//
//   const now = useNow(30_000);
//
// For text that depends on the clock ("2 min ago", "this slot has started"), so it stays true
// while the screen is open.

import { useEffect, useState } from "react";

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
