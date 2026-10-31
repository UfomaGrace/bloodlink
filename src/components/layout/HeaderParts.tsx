// HeaderParts: the pieces both top bars share (TopNavHeader in Layout, and StaffTopBar), so every
// role gets the same stripe, logo, user block and Sign out.
//
// - BrandStripe: the 3px primary stripe along the header's top edge. Decorative, so aria-hidden.
// - UserBlock: initials, name, and the role label. Hospital staff also see their organisation
//   ("Hospital staff · Ikeja General Hospital"); long text truncates. The whole block links to
//   /account, named "Your account, <name>", with aria-current="page" while there.
// - All of it sits on the white bar, so the default (primary) focus ring applies.

import { Droplet } from "lucide-react";
import { Link, NavLink } from "react-router";
import type { Role, User } from "../../api/types";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/button";
import { focusRing, ROLE_LABELS } from "./layoutStyles";

export function BrandStripe() {
  return <div aria-hidden="true" data-testid="brand-stripe" className="h-[3px] shrink-0 bg-primary" />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-lg font-semibold tracking-tight text-foreground",
        focusRing,
        className,
      )}
    >
      <Droplet aria-hidden="true" className="size-5 fill-brand-accent text-brand-accent" />
      BloodLink
    </Link>
  );
}

// First letters of the first and last words: "Ada Obi" → "AO", "Ada" → "A".
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function userSubtitle(role: Role, user: User): string {
  const organisation = user.organisation?.name;
  return role === "HOSPITAL_STAFF" && organisation ? `${ROLE_LABELS[role]} · ${organisation}` : ROLE_LABELS[role];
}

export function UserBlock({ role, user, className }: { role: Role; user: User; className?: string }) {
  return (
    <NavLink
      to="/account"
      end
      aria-label={`Your account, ${user.displayName}`}
      data-testid="user-block"
      className={cn(
        "-mx-2 flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 transition-colors hover:bg-(--color-surface-hover)",
        focusRing,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-on-secondary"
      >
        {initialsOf(user.displayName)}
      </span>
      <p className="min-w-0 max-w-48 text-sm leading-tight">
        <span className="block truncate font-medium">{user.displayName}</span>
        <span className="block truncate text-muted-foreground">{userSubtitle(role, user)}</span>
      </p>
    </NavLink>
  );
}

// RequireAuth sees the cleared session and redirects to /login.
export function SignOutButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "min-h-10 shrink-0 px-2 text-muted-foreground underline underline-offset-4 hover:bg-transparent hover:text-foreground",
        className,
      )}
      onClick={onClick}
    >
      Sign out
    </Button>
  );
}
