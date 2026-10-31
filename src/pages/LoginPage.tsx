// LoginPage: sign in with a demonstration account.
//
// - Formik + Yup check the fields before anything is sent.
// - POST /sessions → signIn(session) → home. Already signed in → straight to home.
// - VALIDATION_FAILED puts each detail on its field; any other failure shows a
//   role="alert" box with the service's message and "Reference: <requestId>".
// - Layout: a dark panel (brand, headline, who it's for) beside the form from lg up; below lg
//   the panel is a top band with the logo and headline only. Its network background is
//   decorative only: aria-hidden, no pointer events, no animation.
// - Mock only (IS_MOCK): "Sign in as" swaps the mock session's role and organisation,
//   because Prism always returns the same bank staff example.
// - Real service only (!IS_MOCK): a role="status" pill says whether the service is awake
//   (it never blocks the form), and "Try a demo" pills fill the form with a seeded login
//   (no submit), clear any error and move focus to Sign in.

import { Form, Formik, useFormikContext, type FormikHelpers, type FormikProps } from "formik";
import { ArrowRight, Droplet, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Navigate, useNavigate } from "react-router";
import * as Yup from "yup";
import { ApiError, IS_MOCK, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Organisation, Role, Session, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { FormikField } from "../components/form/FormikField";
import { ServiceStatusPill } from "../components/ServiceStatusPill";
import { useServiceStatus } from "../hooks/useServiceStatus";
import { Button } from "../shared/ui/button";
import { Card, CardBody, CardHeader } from "../shared/ui/card";
import { FormField } from "../shared/ui/form-field";
import { Select, type SelectOption } from "../shared/ui/select";

type LoginValues = { email: string; password: string };

// Seeded on the real service (see README). Demonstration accounts only.
const DEMO_ACCOUNTS = [
  { label: "Bank staff", email: "staff@lagos-central.bank.demo", password: "Demo-Password-1" },
  { label: "Hospital staff", email: "staff@yaba.hospital.demo", password: "Demo-Password-1" },
] as const satisfies readonly ({ label: string } & LoginValues)[];

// Who BloodLink is for, along the foot of the dark panel (lg and up).
const AUDIENCES = [
  { role: "Hospitals", action: "Request units" },
  { role: "Blood banks", action: "Manage stock" },
  { role: "Donors", action: "Book a slot" },
] as const;

type MockRole = Role;

const MOCK_ROLE_OPTIONS = [
  { value: "BANK_STAFF", label: "Bank staff" },
  { value: "HOSPITAL_STAFF", label: "Hospital staff" },
  { value: "DONOR", label: "Donor" },
  { value: "ADMIN", label: "Administrator" },
] as const satisfies readonly (SelectOption & { value: MockRole })[];

const MOCK_HOSPITAL: Organisation = {
  id: "6e7f8a9b-0c1d-4e2f-9a3b-4c5d6e7f8a9b",
  name: "Yaba General Hospital (demo)",
  type: "HOSPITAL",
  area: "Yaba",
};

function isMockRole(value: string | undefined): value is MockRole {
  return MOCK_ROLE_OPTIONS.some((o) => o.value === value);
}

// Donors and the administrator work for no organisation (User.organisation is null for both).
const MOCK_USERS: Record<Exclude<MockRole, "BANK_STAFF">, Pick<User, "displayName" | "organisation">> = {
  HOSPITAL_STAFF: { displayName: "Tunde Bello (demo)", organisation: MOCK_HOSPITAL },
  DONOR: { displayName: "Ngozi Adeyemi (demo)", organisation: null },
  ADMIN: { displayName: "Kemi Adebayo (demo)", organisation: null },
};

/** Mock only: turn Prism's bank staff session into the chosen role. Bank staff is unchanged. */
function withMockRole(session: Session, role: MockRole): Session {
  if (role === "BANK_STAFF") return session;
  return { ...session, user: { ...session.user, role, ...MOCK_USERS[role] } };
}

const LOGIN_FIELDS = ["email", "password"] as const satisfies readonly (keyof LoginValues)[];

const initialValues: LoginValues = { email: "", password: "" };

const loginSchema = Yup.object({
  email: Yup.string()
    .trim()
    .email("Enter a valid email address, like name@example.com.")
    .required("Enter your email address."),
  password: Yup.string()
    .min(8, "Your password has at least 8 characters.")
    .required("Enter your password."),
});

function isLoginField(field: string): field is keyof LoginValues {
  return (LOGIN_FIELDS as readonly string[]).includes(field);
}

export default function LoginPage() {
  const { session, signIn, notice } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mockRole, setMockRole] = useState<MockRole>("BANK_STAFF");
  const formRef = useRef<HTMLFormElement>(null);
  const formikRef = useRef<FormikProps<LoginValues>>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const serviceStatus = useServiceStatus();

  // The submit button is disabled during the request, which drops keyboard focus.
  // Put it on the alert so keyboard and screen reader users land on the problem.
  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(values: LoginValues, helpers: FormikHelpers<LoginValues>) {
    setFormError(null);
    try {
      const res = await api.createSession({ email: values.email.trim(), password: values.password });
      signIn(IS_MOCK ? withMockRole(res.data, mockRole) : res.data);
      navigate("/", { replace: true });
    } catch (e) {
      const error = toApiError(e);
      switch (error.code) {
        case "VALIDATION_FAILED": {
          const issues = error.details.filter((d) => isLoginField(d.field));
          if (issues.length === 0) {
            // Nothing we can pin to a field (e.g. the mock's own 422): show it in the box.
            setFormError(error);
            return;
          }
          for (const issue of issues) helpers.setFieldError(issue.field, issue.issue);
          return;
        }
        default:
          // INVALID_CREDENTIALS, NETWORK_ERROR, TIMEOUT, INTERNAL_ERROR, …:
          // the message is written for users, so show it as is.
          setFormError(error);
      }
    }
  }

  /** Fill the form with a demo login without submitting; focus Sign in so Enter signs in. */
  function fillDemoAccount({ email, password }: LoginValues) {
    setFormError(null);
    void formikRef.current?.setValues({ email, password });
    submitRef.current?.focus();
  }

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
          {/* 14ch plus the nowrap span: it can only break as "Every unit, / accounted for." */}
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
        {!IS_MOCK && (
          <div className="flex w-full max-w-104 justify-end lg:absolute lg:top-6 lg:right-8 lg:w-auto">
            <ServiceStatusPill status={serviceStatus} />
          </div>
        )}

        <div className="flex w-full max-w-104 min-w-0 flex-col gap-4">
          {/* Card always draws an image placeholder when no image is given; hide it here. */}
          <Card className="w-full shadow-sm [&>div:first-child]:hidden">
            <div className="p-2 sm:p-3">
              <CardHeader className="mb-5">
                <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              </CardHeader>

              <CardBody>
                {notice && !formError && (
                  <div
                    role="status"
                    className="mb-4 rounded-md border border-input border-l-4 border-l-primary bg-surface p-3 text-sm"
                  >
                    {notice}
                  </div>
                )}

                {formError && (
                  <div
                    ref={alertRef}
                    role="alert"
                    tabIndex={-1}
                    className="mb-4 rounded-md border border-error border-l-4 bg-surface p-3 text-sm focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)"
                  >
                    <p className="font-medium text-error">
                      <span aria-hidden="true">! </span>
                      {formError.message}
                    </p>
                    <p className="mt-1 break-all text-muted-foreground">Reference: {formError.requestId}</p>
                  </div>
                )}

                <Formik<LoginValues>
                  innerRef={formikRef}
                  initialValues={initialValues}
                  validationSchema={loginSchema}
                  onSubmit={handleSubmit}
                >
                  {({ isSubmitting, isValidating }) => {
                    // Only disable while the request is in flight, not during the quick
                    // validation pass, so a failed validation doesn't steal focus.
                    const busy = isSubmitting && !isValidating;
                    return (
                      <Form ref={formRef} noValidate className="flex flex-col gap-4">
                        <FocusFirstError formRef={formRef} />

                        <FormikField name="email" label="Email" type="email" autoComplete="email" required />

                        <FormikField
                          name="password"
                          label="Password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          endAdornment={
                            <Button
                              variant="ghost"
                              iconOnly
                              aria-label="Show password"
                              aria-pressed={showPassword}
                              onClick={() => setShowPassword((v) => !v)}
                            >
                              {showPassword ? (
                                <EyeOff aria-hidden="true" className="size-5" />
                              ) : (
                                <Eye aria-hidden="true" className="size-5" />
                              )}
                            </Button>
                          }
                        />

                        {IS_MOCK && (
                          <div className="rounded-md border border-dashed border-warning bg-surface p-3">
                            <p className="mb-2 text-sm font-semibold text-foreground">
                              Mock server only — simulated sign-in
                            </p>
                            <FormField label="Sign in as" hint="Not shown when connected to the real service.">
                              {(field) => (
                                <Select
                                  {...field}
                                  className="min-h-11"
                                  options={[...MOCK_ROLE_OPTIONS]}
                                  value={mockRole}
                                  onValueChange={(next) => {
                                    if (isMockRole(next)) setMockRole(next);
                                  }}
                                />
                              )}
                            </FormField>
                          </div>
                        )}

                        <Button ref={submitRef} type="submit" size="lg" disabled={busy} aria-busy={busy || undefined} className="mt-1 w-full">
                          {busy ? (
                            "Signing in…"
                          ) : (
                            <>
                              Sign in
                              <ArrowRight aria-hidden="true" className="size-4" />
                            </>
                          )}
                        </Button>
                      </Form>
                    );
                  }}
                </Formik>
              </CardBody>

            </div>
          </Card>

          {!IS_MOCK && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <p className="text-muted-foreground">Try a demo:</p>
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  variant="secondary"
                  size="sm"
                  className="min-h-11 rounded-full px-4"
                  aria-label={`${account.label} (${account.email})`}
                  onClick={() => fillDemoAccount(account)}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** After each submit attempt (client or server errors), move focus to the first invalid field. */
function FocusFirstError({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const { submitCount, isSubmitting, errors } = useFormikContext<LoginValues>();
  const handledCount = useRef(0);

  useEffect(() => {
    if (isSubmitting || submitCount === handledCount.current) return;
    handledCount.current = submitCount;
    const first = LOGIN_FIELDS.find((f) => errors[f]);
    const el = first ? formRef.current?.elements.namedItem(first) : null;
    if (el instanceof HTMLElement) el.focus();
  }, [submitCount, isSubmitting, errors, formRef]);

  return null;
}

// Network of banks and hospitals: a dot at every line vertex inside the 640×800 viewBox, except
// the red drop at (520,140). Vertices on two lines get the larger dot. The second drop sits off
// the lines near the right edge, clear of the panel's text and columns.
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

// lucide's Droplet (the logo), on its 24×24 grid.
const DROP_PATH =
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z";

/**
 * Decorative network behind the dark panel: faint lines and dots, two red drops. Static.
 * Held at its 640×800 size in the panel's top-right corner, so it never grows on wide screens;
 * smaller panels crop it from the left and bottom. Lines and dots fade out along the left and
 * bottom edges so the network never ends in a hard line; the drops are not faded.
 */
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
          {/* Mask luminance, not visible colours: black hides, white shows. */}
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

        {/* Nested so the two fades multiply: the bottom-left corner fades on both edges. */}
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
