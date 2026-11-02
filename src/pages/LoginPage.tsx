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
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import * as Yup from "yup";
import { ApiError, IS_MOCK, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Organisation, Role, Session, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AuthPageShell } from "../components/auth/AuthPageShell";
import { FormikField } from "../components/form/FormikField";
import { ServiceStatusPill } from "../components/ServiceStatusPill";
import { useServiceStatus } from "../hooks/useServiceStatus";
import { Button } from "../shared/ui/button";
import { FormField } from "../shared/ui/form-field";
import { Select, type SelectOption } from "../shared/ui/select";

type LoginValues = { email: string; password: string };

// Seeded on the real service (see README). Demonstration accounts only.
const DEMO_ACCOUNTS = [
  { label: "Bank staff", email: "staff@lagos-central.bank.demo", password: "Demo-Password-1" },
  { label: "Hospital staff", email: "staff@yaba.hospital.demo", password: "Demo-Password-1" },
] as const satisfies readonly ({ label: string } & LoginValues)[];

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
  const [searchParams] = useSearchParams();
  const initialValues: LoginValues = { email: searchParams.get("email") ?? "", password: "" };
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
    <AuthPageShell
      title="Sign in"
      topRight={!IS_MOCK ? <ServiceStatusPill status={serviceStatus} /> : undefined}
      footer={
        <div className="flex flex-col gap-4">
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
          <p className="text-center text-sm">
            <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
              Giving blood? Create a donor account
            </Link>
          </p>
        </div>
      }
    >
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
    </AuthPageShell>
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
