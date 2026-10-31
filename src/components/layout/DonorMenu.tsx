// DonorMenu: the donor's account menu on phones (below sm), in place of the user block and Sign out.
//
// - The button is the donor's initials in a 44px circle, styled like the desktop avatar, named
//   "Account menu, <name>", with aria-expanded and aria-controls.
// - A disclosure, not role="menu": the panel holds "<name> · Donor", the Account link and Sign out,
//   and is only rendered while open.
// - Closes on Escape (focus goes back to the button), a tap outside, choosing an item, and a route change.

import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import type { User } from "../../api/types";
import { cn } from "../../shared/cn";
import { initialsOf } from "./HeaderParts";
import { focusRing, ROLE_LABELS } from "./layoutStyles";

const panelItem = cn(
  "flex min-h-11 w-full items-center px-4 text-left text-sm font-medium transition-colors hover:bg-(--color-surface-hover)",
  focusRing,
);

export function DonorMenu({ user, onSignOut, className }: { user: User; onSignOut: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // A route change closes it; set during render, not in an effect.
  const { pathname } = useLocation();
  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Account menu, ${user.displayName}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((shown) => !shown)}
        className={cn(
          "flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-on-secondary",
          focusRing,
        )}
      >
        <span aria-hidden="true">{initialsOf(user.displayName)}</span>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-surface py-1 text-foreground shadow-lg"
        >
          <p className="truncate border-b border-border px-4 py-3 text-sm">
            <span className="font-medium">{user.displayName}</span>
            <span className="text-muted-foreground"> · {ROLE_LABELS.DONOR}</span>
          </p>
          <NavLink to="/account" end className={panelItem} onClick={() => setOpen(false)}>
            Account
          </NavLink>
          <button
            type="button"
            className={panelItem}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
