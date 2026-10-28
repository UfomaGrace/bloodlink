// MockControls: mock-only tools for trying every action against Prism.
//
//   <MockControls simulation={{ value: simulated, onChange: setSimulated }} />
//   <MockControls />   // "Force response" only
//
// - Renders nothing unless IS_MOCK is true, so it can never appear on the live service.
// - "Simulate state" changes only what the page shows (lib/mockSimulation). Write calls still
//   go to Prism as they are.
// - "Force response" asks Prism for that status on every write (`Prefer: code=409`), so the
//   refusal paths can be tried. Reads are left alone, so the reload after a refusal still works.
//   It is reset when the screen closes, so it never lingers on a screen without this control.
// - A banner says what is simulated or forced, and is announced when it changes.

import { useEffect, useState } from "react";
import { IS_MOCK, setForcedMockCode } from "../api/client";
import { isKeyOf } from "../lib/labels";
import { SIMULATED_STATE_LABELS, type SimulatedState } from "../lib/mockSimulation";
import { cn } from "../shared/cn";
import { FormField } from "../shared/ui/form-field";

const FORCED_CODES = [409, 403, 404, 422] as const;

const selectClasses = cn(
  "h-11 w-full rounded-[var(--radius-md)] border border-(--color-border-input) bg-(--color-surface) px-3 text-sm",
  "text-(--color-text) font-[family-name:var(--font-sans)]",
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)",
);

export type MockControlsProps = {
  /** Omit on screens with nothing to simulate; only "Force response" shows then. */
  simulation?: { value: SimulatedState | null; onChange: (next: SimulatedState | null) => void };
  className?: string;
};

export function MockControls(props: MockControlsProps) {
  if (!IS_MOCK) return null;
  return <MockControlsPanel {...props} />;
}

function MockControlsPanel({ simulation, className }: MockControlsProps) {
  const [forced, setForced] = useState<number | null>(null);

  useEffect(() => () => setForcedMockCode(null), []);

  function changeForced(value: string) {
    const code = FORCED_CODES.find((c) => String(c) === value) ?? null;
    setForced(code);
    setForcedMockCode(code);
  }

  const banner = [
    simulation?.value ? `Simulated: ${SIMULATED_STATE_LABELS[simulation.value]}.` : "",
    forced ? `Every write gets ${forced} from the mock.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-labelledby="mock-controls-heading"
      className={cn("rounded-md border border-dashed border-input p-3", className)}
    >
      <h2 id="mock-controls-heading" className="text-sm font-semibold">
        Mock server tools
      </h2>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {simulation && (
          <FormField label="Simulate state" hint="Changes only what this page shows.">
            {(control) => (
              <select
                {...control}
                className={selectClasses}
                value={simulation.value ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  simulation.onChange(isKeyOf(SIMULATED_STATE_LABELS, next) ? next : null);
                }}
              >
                <option value="">As the mock sends it</option>
                {Object.entries(SIMULATED_STATE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}
        <FormField label="Force response" hint="Status the mock returns for every write.">
          {(control) => (
            <select
              {...control}
              className={selectClasses}
              value={forced ? String(forced) : ""}
              onChange={(event) => changeForced(event.target.value)}
            >
              <option value="">None (normal answer)</option>
              {FORCED_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      {/* Always rendered, so a change of text is announced. */}
      <p
        role="status"
        className={cn(
          "text-sm font-semibold",
          banner && "mt-3 rounded-sm border-l-4 border-l-(--color-warning) bg-(--color-surface-sunken) px-3 py-2",
        )}
      >
        {banner}
      </p>
    </section>
  );
}
