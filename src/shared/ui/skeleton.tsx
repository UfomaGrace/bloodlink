// Loading skeleton
// Owner: Ufoma
//
// Done when:
// - [x] Shapes for text lines, cards, images
// - [x] Hidden from screen readers (aria-hidden)
// - [x] Animation off with prefers-reduced-motion
// - [x] Keyboard-only test passed, screen reader checked once
// - [x] Typed props, no `any`, colours from tokens.css
// - [ ] Reviewed by one other interface engineer
//
// - shape="text" (default): `lines` bars, the last one shorter like a real paragraph.
// - shape="image": a 16:9 block, the same ratio Card uses for its image.
// - shape="card": image block plus a title and two text lines, laid out like Card.
// - Always aria-hidden, so screen readers skip it. Tell them something is loading
//   on the container instead, e.g. aria-busy="true" on the region being filled.
// - Pulses gently; the animation is switched off under prefers-reduced-motion.
// - Fills the width of its container and never sets a fixed width, so it fits 360px.

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../cn";

type Shape = "text" | "card" | "image";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  shape?: Shape;
  // Number of bars for shape="text". Ignored by the other shapes.
  lines?: number;
};

// --color-border, not --color-surface: surface is invisible on a Card background.
const block = "bg-[var(--color-border)] motion-safe:animate-pulse motion-reduce:animate-none";

// Guards against bad runtime values: NaN, 0 or negatives give 1 line, decimals
// round down, and Infinity or huge numbers are capped instead of crashing.
const MAX_LINES = 20;

function clampLines(lines: number): number {
  if (!Number.isFinite(lines)) return 1;
  return Math.min(MAX_LINES, Math.max(1, Math.floor(lines)));
}

function TextLines({ lines }: { lines: number }) {
  const count = clampLines(lines);
  return (
    <div className="grid gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-4 rounded-[var(--radius-sm)]",
            block,
            count > 1 && i === count - 1 ? "w-3/5" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { shape = "text", lines = 1, className, ...rest },
  ref,
) {
  if (shape === "image") {
    return (
      <div
        ref={ref}
        className={cn("aspect-video w-full rounded-[var(--radius-md)]", block, className)}
        {...rest}
        aria-hidden="true"
      />
    );
  }

  if (shape === "card") {
    return (
      <div
        ref={ref}
        className={cn(
          "w-full min-w-0 overflow-hidden rounded-lg border",
          "border-[var(--color-border)] bg-[var(--color-surface)]",
          className,
        )}
        {...rest}
        aria-hidden="true"
      >
        <div className={cn("aspect-video w-full", block)} />
        <div className="grid min-w-0 gap-3 p-4">
          <div className={cn("h-6 w-4/5 rounded-[var(--radius-sm)]", block)} />
          <TextLines lines={2} />
        </div>
      </div>
    );
  }

  // "text", and the fallback for any value outside Shape (e.g. from untyped JS).
  return (
    <div ref={ref} className={cn("w-full min-w-0", className)} {...rest} aria-hidden="true">
      <TextLines lines={lines} />
    </div>
  );
});

Skeleton.displayName = "Skeleton";
