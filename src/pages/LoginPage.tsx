// LoginPage: sign in with a demonstration account.
//
// - Formik + Yup check the fields before anything is sent.
// - POST /sessions → signIn(session) → home. Already signed in → straight to home.
// - VALIDATION_FAILED puts each detail on its field; any other failure shows a
//   role="alert" box with the service's message and "Reference: <requestId>".
// - The background is decorative only: aria-hidden, no pointer events, no animation.
// - Mock only (IS_MOCK): "Sign in as" swaps the mock session's role and organisation,
//   because Prism always returns the same bank staff example.

import { Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import { ArrowRight, Droplet, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Navigate, useNavigate } from "react-router";
import * as Yup from "yup";
import { ApiError, IS_MOCK, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Organisation, Session } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { FormikField } from "../components/form/FormikField";
import { Button } from "../shared/ui/button";
import { Card, CardBody, CardHeader } from "../shared/ui/card";
import { FormField } from "../shared/ui/form-field";
import { Select, type SelectOption } from "../shared/ui/select";

type LoginValues = { email: string; password: string };

type MockRole = "BANK_STAFF" | "HOSPITAL_STAFF";

const MOCK_ROLE_OPTIONS = [
  { value: "BANK_STAFF", label: "Bank staff" },
  { value: "HOSPITAL_STAFF", label: "Hospital staff" },
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

/** Mock only: turn Prism's bank staff session into the chosen role. Bank staff is unchanged. */
function withMockRole(session: Session, role: MockRole): Session {
  if (role === "BANK_STAFF") return session;
  return {
    ...session,
    user: {
      ...session.user,
      role: "HOSPITAL_STAFF",
      displayName: "Tunde Bello (demo)",
      organisation: MOCK_HOSPITAL,
    },
  };
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
  const alertRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground [--font-sans:Jost,system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] font-sans">
      {/* React 19 hoists these into <head>. Falls back to system fonts offline. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap"
        precedence="default"
      />

      <CareBackground />

      <header className="mx-auto flex w-full max-w-6xl items-center px-4 pt-6 sm:px-8 sm:pt-8">
        <p className="flex items-center gap-2 text-lg font-semibold tracking-wide text-primary">
          <Droplet aria-hidden="true" className="size-5 fill-brand-accent text-brand-accent" />
          BLOODLINK
        </p>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:py-16">
        <section aria-labelledby="hero-heading" className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary sm:text-sm">
            Blood supply coordination
          </p>
          <h1
            id="hero-heading"
            className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight wrap-break-word sm:text-5xl lg:text-6xl"
          >
            Every unit, accounted for.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Track blood stock and requests between banks and hospitals from one clear workspace.
          </p>
        </section>

        {/* Card always draws an image placeholder when no image is given; hide it here. */}
        <Card className="w-full shadow-sm [&>div:first-child]:hidden">
          <div className="p-2 sm:p-4">
            <CardHeader className="mb-6">
              <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
              <p className="mt-3 text-base text-muted-foreground">
                Sign in to manage blood stock and requests.
              </p>
            </CardHeader>

            <CardBody>
              {notice && !formError && (
                <div
                  role="status"
                  className="mb-5 rounded-md border border-input border-l-4 border-l-primary bg-surface p-3 text-sm"
                >
                  {notice}
                </div>
              )}

              {formError && (
                <div
                  ref={alertRef}
                  role="alert"
                  tabIndex={-1}
                  className="mb-5 rounded-md border border-error border-l-4 bg-surface p-3 text-sm focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus)] focus-visible:outline-offset-(--focus-ring-offset)"
                >
                  <p className="font-medium text-error">
                    <span aria-hidden="true">! </span>
                    {formError.message}
                  </p>
                  <p className="mt-1 break-all text-muted-foreground">Reference: {formError.requestId}</p>
                </div>
              )}

              <Formik<LoginValues> initialValues={initialValues} validationSchema={loginSchema} onSubmit={handleSubmit}>
                {({ isSubmitting, isValidating }) => {
                  // Only disable while the request is in flight, not during the quick
                  // validation pass, so a failed validation doesn't steal focus.
                  const busy = isSubmitting && !isValidating;
                  return (
                    <Form ref={formRef} noValidate className="flex flex-col gap-5">
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

                      <Button type="submit" size="lg" disabled={busy} aria-busy={busy || undefined} className="mt-1 w-full">
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

/**
 * Calm, decorative care-themed background: soft shapes, faint plus signs,
 * a blood-drop outline and a heartbeat line. Static, muted, low opacity.
 */
function CareBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <defs>
          <pattern id="bl-plus" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M28 22v12M22 28h12" className="stroke-muted-foreground" strokeWidth="1.5" strokeLinecap="round" />
          </pattern>
          {/* Mask luminance, not a visible colour: white keeps the pattern, transparent hides it. */}
          <radialGradient id="bl-fade" cx="30%" cy="35%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="bl-plus-mask">
            <rect width="1440" height="900" fill="url(#bl-fade)" />
          </mask>
        </defs>

        {/* Faint plus signs, fading out toward the card */}
        <rect width="1440" height="900" fill="url(#bl-plus)" opacity="0.12" mask="url(#bl-plus-mask)" />

        {/* Blood-drop outline */}
        <path
          d="M0 -150 C 50 -75 100 -25 100 38 A 100 100 0 0 1 -100 38 C -100 -25 -50 -75 0 -150 Z"
          transform="translate(1290 330)"
          fill="none"
          className="stroke-brand-accent"
          strokeWidth="2"
          opacity="0.12"
        />

        {/* Heartbeat line */}
        <path
          d="M0 780 H460 L490 780 L512 742 L540 830 L570 690 L598 800 L616 780 H900 L922 780 L938 760 L956 800 L972 780 H1440"
          fill="none"
          className="stroke-brand-accent"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.14"
        />
      </svg>
    </div>
  );
}
