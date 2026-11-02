import { Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import * as Yup from "yup";
import { ApiError, toApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { DonorCreate } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AuthPageShell } from "../components/auth/AuthPageShell";
import { FormikField } from "../components/form/FormikField";
import { FormAlert } from "../components/form/FormAlert";
import { Button } from "../shared/ui/button";

type SignupValues = DonorCreate;

const SIGNUP_FIELDS = ["displayName", "email", "password"] as const satisfies readonly (keyof SignupValues)[];
const initialValues: SignupValues = { displayName: "", email: "", password: "" };

function trimDisplayName(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isDisplayNameBoundary(value[start], value.charCodeAt(start))) start += 1;
  while (end > start && isDisplayNameBoundary(value[end - 1], value.charCodeAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

function isDisplayNameBoundary(character: string, code: number): boolean {
  return /\s/.test(character) || code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

const signupSchema = Yup.object({
  displayName: Yup.string()
    .transform((value) => (typeof value === "string" ? trimDisplayName(value) : value))
    .min(2, "Your display name must be at least 2 characters.")
    .max(120, "Your display name must be 120 characters or fewer.")
    .required("Enter your display name."),
  email: Yup.string()
    .trim()
    .email("Enter a valid email address, like name@example.com.")
    .max(254, "Your email address must be 254 characters or fewer.")
    .required("Enter your email address."),
  password: Yup.string()
    .min(8, "Your password must be at least 8 characters.")
    .max(72, "Your password must be 72 characters or fewer.")
    .test("utf8-byte-limit", "Your password must be no more than 72 bytes in UTF-8.", (value) => (
      value === undefined || new TextEncoder().encode(value).length <= 72
    ))
    .required("Enter a password."),
});

function isSignupField(field: string): field is keyof SignupValues {
  return (SIGNUP_FIELDS as readonly string[]).includes(field);
}

export default function SignupPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | undefined>();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (session) return <Navigate to="/slots" replace />;

  async function handleSubmit(values: SignupValues, helpers: FormikHelpers<SignupValues>) {
    setFormError(null);
    setFormErrorMessage(undefined);
    setRegisteredEmail(null);
    const body: DonorCreate = {
      displayName: trimDisplayName(values.displayName),
      email: values.email.trim(),
      password: values.password,
    };

    try {
      const response = await api.createDonor(body);
      signIn(response.data);
      navigate("/slots", { replace: true });
    } catch (e) {
      const error = toApiError(e);
      if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
        // POST /donors is not idempotent: sign in with these credentials to confirm whether it succeeded.
        try {
          const response = await api.createSession({ email: body.email, password: body.password });
          signIn(response.data);
          navigate("/slots", { replace: true });
          return;
        } catch {
          setFormError(error);
          setFormErrorMessage("Your account wasn't created. Please try again.");
          return;
        }
      }

      if (error.code === "VALIDATION_FAILED") {
        const issues = error.details.filter((issue) => isSignupField(issue.field));
        if (issues.length === 0) {
          setFormError(error);
          return;
        }
        for (const issue of issues) helpers.setFieldError(issue.field, issue.issue);
        return;
      }

      if (error.code === "EMAIL_ALREADY_REGISTERED") setRegisteredEmail(body.email);
      setFormError(error);
    }
  }

  return (
    <AuthPageShell
      title="Create a donor account"
      footer={
        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Already have an account? Sign in
          </Link>
        </p>
      }
    >
      <FormAlert
        error={formError}
        message={
          formErrorMessage ??
          (formError?.code === "EMAIL_ALREADY_REGISTERED" ? "An account with this email already exists" : undefined)
        }
        className="mb-4"
      >
        {formError?.code === "EMAIL_ALREADY_REGISTERED" && (
          <p className="mt-2">
            <Link
              to={`/login?email=${encodeURIComponent(registeredEmail ?? "")}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        )}
      </FormAlert>

      <Formik<SignupValues> initialValues={initialValues} validationSchema={signupSchema} onSubmit={handleSubmit}>
        {({ isSubmitting, isValidating }) => {
          const busy = isSubmitting && !isValidating;
          return (
            <Form ref={formRef} noValidate className="flex flex-col gap-4">
              <FocusFirstError formRef={formRef} />
              <FormikField
                name="displayName"
                label="Display name"
                type="text"
                autoComplete="name"
                required
              />
              <FormikField name="email" label="Email" type="email" autoComplete="email" required />
              <FormikField
                name="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                hint="8–72 characters; no more than 72 bytes in UTF-8."
                endAdornment={
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-5" />
                    ) : (
                      <Eye aria-hidden="true" className="size-5" />
                    )}
                  </Button>
                }
              />
              <p className="text-sm text-muted-foreground">
                Demo product: no email verification or password reset.
              </p>
              <Button type="submit" size="lg" disabled={busy} aria-busy={busy || undefined} className="mt-1 w-full">
                {busy ? (
                  "Creating account…"
                ) : (
                  <>
                    Create account
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

/** After each submit attempt, move focus to the first field with a client- or server-side error. */
function FocusFirstError({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const { submitCount, isSubmitting, errors } = useFormikContext<SignupValues>();
  const handledCount = useRef(0);

  useEffect(() => {
    if (isSubmitting || submitCount === handledCount.current) return;
    handledCount.current = submitCount;
    const first = SIGNUP_FIELDS.find((field) => errors[field]);
    const element = first ? formRef.current?.elements.namedItem(first) : null;
    if (element instanceof HTMLElement) element.focus();
  }, [submitCount, isSubmitting, errors, formRef]);

  return null;
}
