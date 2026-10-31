// HeroNetwork: the faint static network behind the donor's dark bands (/slots hero, /bookings band).
// aria-hidden, pointer-events none, no animation.

// The sign-in panel's network, trimmed to a band: lines and dots, one red drop on a vertex.
const NETWORK_LINES = [
  "M-20 60 L120 30 L280 90 L440 40 L600 110 L760 60 L900 100",
  "M-20 220 L150 180 L300 240 L470 190 L620 250 L780 200 L900 230",
  "M120 30 L150 180 L110 330",
  "M440 40 L470 190 L430 330",
  "M600 110 L620 250",
  "M760 60 L780 200 L740 330",
];

const NETWORK_NODES: readonly (readonly [x: number, y: number, r: number])[] = [
  [120, 30, 5], [280, 90, 4], [440, 40, 5], [760, 60, 5],
  [150, 180, 5], [300, 240, 4], [470, 190, 5], [620, 250, 4], [780, 200, 5],
];

const NETWORK_DROP: readonly [x: number, y: number] = [600, 110];

// lucide's Droplet (the logo), on its 24×24 grid.
const DROP_PATH =
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z";

/** Decorative and static. Anchored to the band's right edge; narrow screens crop it from the left. */
export function HeroNetwork() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full max-w-225 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 900 330"
        preserveAspectRatio="xMaxYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <g fill="none" className="stroke-on-secondary" strokeWidth="1.2" strokeOpacity="0.10">
          {NETWORK_LINES.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g className="fill-on-secondary" fillOpacity="0.18">
          {NETWORK_NODES.map(([x, y, r]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
        <g transform={`translate(${NETWORK_DROP[0]} ${NETWORK_DROP[1]})`}>
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
      </svg>
    </div>
  );
}
