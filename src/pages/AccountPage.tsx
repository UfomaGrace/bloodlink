// AccountPage: the signed-in user's details, read-only, for every role.
//
// - Everything comes from the session (the contract has no GET /me), so there is nothing to load.
// - Name, Email, Role, and for staff the Organisation ("Name · Area", or "Administration · All banks"
//   for the administrator, as in the top bar's chip). Donors have no organisation row.
// - One muted line says who to contact for changes; there are no edit, password or preference controls.
// - Sign out calls the same signOut() as the header; RequireAuth then sends the user to /login.

import { Navigate } from "react-router";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SignOutButton } from "../components/layout/HeaderParts";
import { ROLE_LABELS } from "../components/layout/layoutStyles";
import { organisationLabel } from "../components/layout/StaffTopBar";

const CONTACT_LINES: Record<Role, string> = {
  DONOR: "To update your details, contact the blood bank where you donate.",
  BANK_STAFF: "To update your details, contact your BloodLink administrator.",
  HOSPITAL_STAFF: "To update your details, contact your BloodLink administrator.",
  ADMIN: "Account changes are made by the BloodLink service team.",
};

export default function AccountPage() {
  const { session, role, signOut } = useAuth();
  // RequireAuth normally catches this first; kept so `session` is non-null below.
  if (!session || !role) return <Navigate to="/login" replace />;

  const { user } = session;
  const details = [
    { term: "Name", value: user.displayName },
    { term: "Email", value: user.email },
    { term: "Role", value: ROLE_LABELS[role] },
    ...(role === "DONOR" ? [] : [{ term: "Organisation", value: organisationLabel(role, user) }]),
  ];

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>

      <section aria-label="Account details" className="mt-6 rounded-md border border-border bg-surface">
        <dl className="divide-y divide-border text-sm">
          {details.map(({ term, value }) => (
            <div key={term} className="grid grid-cols-[8rem_1fr] gap-x-4 px-4 py-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="min-w-0 wrap-break-word font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-4 text-sm text-muted-foreground">{CONTACT_LINES[role]}</p>

      <SignOutButton onClick={() => signOut()} className="-ml-2 mt-4" />
    </div>
  );
}
