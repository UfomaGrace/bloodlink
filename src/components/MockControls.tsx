// MockControls: mock-only tools for trying every action against Prism.
//
//   <MockControls simulation={{ value: simulated, onChange: setSimulated }} />   // request states
//   <MockControls simulation={{ value, onChange, labels: DASHBOARD_SIMULATION_LABELS }} />
//   <MockControls />   // "Force response" only
//
// - Without `labels`, "Simulate state" offers the request states (SIMULATED_STATE_LABELS), as the
//   request screens use it. With `labels`, it offers those keys instead.
// - Renders nothing unless IS_MOCK is true, so it can never appear on the live service.
// - "Simulate state" changes only what the page shows (lib/mockSimulation). Write calls still
//   go to Prism as they are.
// - "Force response" asks Prism for that status on every write (`Prefer: code=409`), so the
//   refusal paths can be tried. Reads are left alone, so the reload after a refusal still works.
//   It is reset when the screen closes, so it never lingers on a screen without this control.
// - A banner says what is simulated or forced, and is announced when it changes.

import { useEffect, useState } from "react";
import { IS_MOCK, setForcedMockCode } from "../api/client";
import { isKeyOf, keysOf } from "../lib/labels";
import { SIMULATED_STATE_LABELS, type SimulatedState } from "../lib/mockSimulation";
import { cn } from "../shared/cn";
import { FormField } from "../shared/ui/form-field";

const FORCED_CODES = [409, 403, 404, 422] as const;

const selectClasses = cn(
  "h-11 w-full rounded-[var(--radius-md)] border border-(--color-border-input) bg-(--color-surface) px-3 text-sm",
  "text-(--color-text) font-[family-name:var(--font-sans)]",
  "focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)",
);

/** A "Simulate state" choice: the current value, its setter, and every option with its label. */
export type Simulation<K extends string> = {
  value: K | null;
  onChange: (next: K | null) => void;
  labels: Record<K, string>;
};

/** The request screens' choice: labels left out means the request states (SIMULATED_STATE_LABELS). */
type RequestSimulation = Omit<Simulation<SimulatedState>, "labels"> & { labels?: undefined };

export type MockControlsProps<K extends string = SimulatedState> = {
  /** Omit on screens with nothing to simulate; only "Force response" shows then. */
  simulation?: Simulation<K> | RequestSimulation;
  className?: string;
};

export function MockControls<K extends string = SimulatedState>(props: MockControlsProps<K>) {
  if (!IS_MOCK) return null;
  return <MockControlsPanel {...props} />;
}

/** What the select and the banner need, whichever kind of simulation was passed. */
type SimulationView = {
  value: string;
  /** The current choice's label, "" when none. */
  label: string;
  options: { value: string; label: string }[];
  pick: (value: string) => void;
};

function isRequestSimulation<K extends string>(s: Simulation<K> | RequestSimulation): s is RequestSimulation {
  return s.labels === undefined;
}

function viewOf<K extends string>({ value, onChange, labels }: Simulation<K>): SimulationView {
  return {
    value: value ?? "",
    label: value ? labels[value] : "",
    options: keysOf(labels).map((key) => ({ value: key, label: labels[key] })),
    pick: (next) => onChange(isKeyOf(labels, next) ? next : null),
  };
}

function simulationView<K extends string>(simulation: Simulation<K> | RequestSimulation): SimulationView {
  return isRequestSimulation(simulation)
    ? viewOf({ ...simulation, labels: SIMULATED_STATE_LABELS })
    : viewOf(simulation);
}

function SimulationSelect({ view }: { view: SimulationView }) {
  return (
    <FormField label="Simulate state" hint="Changes only what this page shows.">
      {(control) => (
        <select
          {...control}
          className={selectClasses}
          value={view.value}
          onChange={(event) => view.pick(event.target.value)}
        >
          <option value="">As the mock sends it</option>
          {view.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

function MockControlsPanel<K extends string>({ simulation, className }: MockControlsProps<K>) {
  const view = simulation ? simulationView(simulation) : null;
  const [forced, setForced] = useState<number | null>(null);

  useEffect(() => () => setForcedMockCode(null), []);

  function changeForced(value: string) {
    const code = FORCED_CODES.find((c) => String(c) === value) ?? null;
    setForced(code);
    setForcedMockCode(code);
  }

  const banner = [
    view?.label ? `Simulated: ${view.label}.` : "",
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
        {view && <SimulationSelect view={view} />}
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
