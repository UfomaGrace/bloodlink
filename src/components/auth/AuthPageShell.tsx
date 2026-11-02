import { Droplet } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "../../shared/ui/card";

type AuthPageShellProps = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  topRight?: ReactNode;
};

const AUDIENCES = [
  { role: "Hospitals", action: "Request units" },
  { role: "Blood banks", action: "Manage stock" },
  { role: "Donors", action: "Book a slot" },
] as const;

const NETWORK_LINES = [
  "M-20 40 L40 60 L200 130 L360 50 L520 140 L620 60 L680 90",
  "M-20 300 L90 280 L260 240 L430 300 L600 250 L680 280",
  "M-20 470 L40 460 L210 420 L380 480 L560 430 L680 460",
  "M-20 640 L120 620 L300 600 L470 660 L610 580 L680 600",
  "M40 60 L90 280 L40 460 L120 620",
  "M200 130 L260 240 L210 420 L300 600",
  "M520 140 L600 250 L560 430 L610 580",
  "M430 300 L380 480 L470 660",
];

const NETWORK_NODES: readonly (readonly [x: number, y: number, r: number])[] = [
  [40, 60, 5], [200, 130, 5], [360, 50, 4], [620, 60, 4],
  [90, 280, 5], [260, 240, 5], [430, 300, 5], [600, 250, 5],
  [40, 460, 5], [210, 420, 5], [380, 480, 5], [560, 430, 5],
  [120, 620, 5], [300, 600, 5], [470, 660, 5], [610, 580, 5],
];

const NETWORK_DROPS: readonly (readonly [x: number, y: number])[] = [
  [520, 140],
  [590, 520],
];

const DROP_PATH =
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z";

export function AuthPageShell({ title, children, footer, topRight }: AuthPageShellProps) {
  return (
    <div className="grid min-h-dvh bg-background text-foreground font-sans lg:grid-cols-2">
      <section
        aria-labelledby="hero-heading"
        className="relative isolate flex min-w-0 flex-col gap-6 overflow-hidden bg-secondary px-4 py-6 text-on-secondary [--color-focus:var(--color-on-secondary)] sm:px-8 sm:py-8 lg:justify-between lg:px-10 lg:py-10"
      >
        <NetworkBackground />

        <p className="flex w-full max-w-xl items-center gap-2 text-base font-semibold tracking-wide">
          <Droplet aria-hidden="true" className="size-4 fill-brand-accent text-brand-accent" />
          BLOODLINK
        </p>

        <div className="w-full max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-secondary-muted">
            Blood supply coordination
          </p>
          <h1
            id="hero-heading"
            className="mt-3 max-w-[14ch] text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl xl:text-5xl"
          >
            Every unit, <span className="whitespace-nowrap">accounted for.</span>
          </h1>
          <p className="mt-4 hidden text-base leading-relaxed text-on-secondary-muted lg:block xl:text-lg">
            Stock and requests between Lagos banks and hospitals, in one place.
          </p>
        </div>

        <ul className="hidden w-full max-w-xl grid-cols-3 divide-x divide-on-secondary/20 border-t border-on-secondary/20 lg:grid">
          {AUDIENCES.map(({ role, action }) => (
            <li key={role} className="px-3 pt-4 first:pl-0 last:pr-0">
              <p className="text-sm font-semibold">{role}</p>
              <p className="mt-1 text-sm text-on-secondary-muted">{action}</p>
            </li>
          ))}
        </ul>
      </section>

      <main className="relative flex min-w-0 flex-col items-center justify-center gap-6 px-4 py-10 sm:px-8 lg:py-16">
        {topRight && (
          <div className="flex w-full max-w-104 justify-end lg:absolute lg:top-6 lg:right-8 lg:w-auto">
            {topRight}
          </div>
        )}

        <div className="flex w-full max-w-104 min-w-0 flex-col gap-4">
          <Card className="w-full shadow-sm [&>div:first-child]:hidden">
            <div className="p-2 sm:p-3">
              <CardHeader className="mb-5">
                <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
              </CardHeader>
              <CardBody>{children}</CardBody>
            </div>
          </Card>
          {footer}
        </div>
      </main>
    </div>
  );
}

function NetworkBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 -z-10 h-full max-h-200 w-full max-w-160 overflow-hidden"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 640 800"
        preserveAspectRatio="xMaxYMin slice"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <defs>
          <linearGradient id="bl-net-fade-left" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="160" y2="0">
            <stop offset="0" stopColor="black" />
            <stop offset="1" stopColor="white" />
          </linearGradient>
          <linearGradient id="bl-net-fade-bottom" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="800">
            <stop offset="0" stopColor="white" />
            <stop offset="1" stopColor="black" />
          </linearGradient>
          <mask id="bl-net-mask-left" maskUnits="userSpaceOnUse" x="-20" y="0" width="700" height="800">
            <rect x="-20" y="0" width="700" height="800" fill="url(#bl-net-fade-left)" />
          </mask>
          <mask id="bl-net-mask-bottom" maskUnits="userSpaceOnUse" x="-20" y="0" width="700" height="800">
            <rect x="-20" y="0" width="700" height="800" fill="url(#bl-net-fade-bottom)" />
          </mask>
        </defs>
        <g mask="url(#bl-net-mask-left)">
          <g mask="url(#bl-net-mask-bottom)">
            <g fill="none" className="stroke-on-secondary" strokeWidth="1.2" strokeOpacity="0.10">
              {NETWORK_LINES.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g className="fill-on-secondary" fillOpacity="0.22">
              {NETWORK_NODES.map(([x, y, r]) => (
                <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
              ))}
            </g>
          </g>
        </g>
        {NETWORK_DROPS.map(([x, y]) => (
          <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
            <path
              d={DROP_PATH}
              transform="scale(2.2) translate(-12 -12)"
              fill="none"
              className="stroke-brand-accent"
              strokeWidth="1.5"
              opacity="0.6"
              vectorEffect="non-scaling-stroke"
            />
            <path d={DROP_PATH} transform="translate(-12 -12)" className="fill-brand-accent" />
          </g>
        ))}
      </svg>
    </div>
  );
}
