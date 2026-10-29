// HistoryList: a "History" section of HistoryEntry items as a timeline (request and unit detail pages).
//
// - The service sends history oldest first. The list sorts anyway, in the order asked for, so the
//   timeline never reads backwards. Entries with the same time keep the order they came in.

import type { HistoryEntry } from "../api/types";
import { formatDateTime, historyEventLabel } from "../lib/labels";

export function HistoryList({ history, order }: { history: readonly HistoryEntry[]; order: "oldest" | "newest" }) {
  const direction = order === "oldest" ? 1 : -1;
  const entries = [...history].sort((a, b) => direction * (Date.parse(a.at) - Date.parse(b.at)));

  return (
    <section aria-labelledby="history-heading" className="mt-8">
      <h2 id="history-heading" className="text-lg font-semibold">
        History
      </h2>
      {order === "newest" && entries.length > 1 && <p className="text-sm text-muted-foreground">Newest first.</p>}
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-4 border-l-2 border-border pl-4">
          {entries.map((entry, i) => (
            <li key={`${entry.at}-${entry.event}-${i}`} className="relative text-sm">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-5.25 size-2 rounded-full bg-muted-foreground"
              />
              <p className="font-medium">{historyEventLabel(entry.event)}</p>
              <p className="text-muted-foreground">
                <time dateTime={entry.at}>{formatDateTime(entry.at)}</time> · {entry.actor}
              </p>
              {entry.note && <p className="mt-1 whitespace-pre-line wrap-break-word">{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
