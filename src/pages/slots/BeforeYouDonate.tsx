// BeforeYouDonate: four short reminders beside the slots on large screens, below them on phones.
//
// - Below sm it can be collapsed (starts open): a chevron button beside the heading, named by the
//   heading itself (aria-labelledby), with aria-expanded. Its tap area covers the whole heading row.
//   The heading text exists once, so screen readers never hear it twice. From sm the button is
//   hidden and the list always shows.

import { ChevronDown, CircleAlert, GlassWater, IdCard, ShieldCheck, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../../shared/cn";

const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

const ITEMS: readonly { icon: LucideIcon; text: string }[] = [
  { icon: GlassWater, text: "Eat a proper meal and drink water first." },
  { icon: IdCard, text: "Bring a photo ID." },
  { icon: CircleAlert, text: "Unwell, or donated recently? Ask the bank before booking." },
  { icon: ShieldCheck, text: "The bank checks you're able to donate when you arrive." },
];

const HEADING_ID = "before-you-donate-heading";

export function BeforeYouDonate({ className }: { className?: string }) {
  const [open, setOpen] = useState(true);
  const listId = useId();

  return (
    <aside aria-labelledby={HEADING_ID} className={className}>
      <div className="rounded-md border border-border bg-surface p-5 max-sm:px-4 max-sm:py-0">
        <div className="relative flex items-center justify-between gap-3 max-sm:min-h-12">
          <h2 id={HEADING_ID} className="font-semibold">
            Before you donate
          </h2>
          <button
            type="button"
            aria-labelledby={HEADING_ID}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((shown) => !shown)}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground sm:hidden",
              // The whole heading row is the target.
              "before:absolute before:inset-0 before:content-['']",
              focusRing,
            )}
          >
            <ChevronDown aria-hidden="true" className={cn("size-5 motion-safe:transition-transform", open && "rotate-180")} />
          </button>
        </div>
        <ul id={listId} className={cn("mt-4 flex flex-col gap-4 max-sm:mt-1 max-sm:pb-4", !open && "max-sm:hidden")}>
          {ITEMS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <span
                aria-hidden="true"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-(--color-surface-sunken) text-primary"
              >
                <Icon className="size-4" />
              </span>
              <span className="pt-1.5">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
