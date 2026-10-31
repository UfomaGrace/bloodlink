// BeforeYouDonate: four short reminders beside the slots on large screens, below them on phones.

import { CircleAlert, GlassWater, IdCard, ShieldCheck, type LucideIcon } from "lucide-react";

const ITEMS: readonly { icon: LucideIcon; text: string }[] = [
  { icon: GlassWater, text: "Eat a proper meal and drink water first." },
  { icon: IdCard, text: "Bring a photo ID." },
  { icon: CircleAlert, text: "Unwell, or donated recently? Ask the bank before booking." },
  { icon: ShieldCheck, text: "The bank checks you're able to donate when you arrive." },
];

export function BeforeYouDonate({ className }: { className?: string }) {
  return (
    <aside aria-labelledby="before-you-donate-heading" className={className}>
      <div className="rounded-md border border-border bg-surface p-5">
        <h2 id="before-you-donate-heading" className="font-semibold">
          Before you donate
        </h2>
        <ul className="mt-4 flex flex-col gap-4">
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
