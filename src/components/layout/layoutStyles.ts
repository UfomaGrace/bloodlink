// Shared by Layout and the staff shell (StaffTopBar, StaffSidebar).

import type { Role } from "../../api/types";

export const ROLE_LABELS: Record<Role, string> = {
  BANK_STAFF: "Blood bank staff",
  HOSPITAL_STAFF: "Hospital staff",
  ADMIN: "Administrator",
  DONOR: "Donor",
};

export const focusRing =
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)";

// The sticky header's height, set once on the layout root: the 60px bar (h-15) + the 3px brand
// stripe. The staff sidebar sticks just below it with top-(--header-h).
export const headerHeight = "[--header-h:63px]";

// Teal on the dark header and sidebar is too faint for a focus ring, so it turns white in there.
export const onDarkFocus = "[--color-focus:var(--color-on-secondary)]";
