import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import type { Role } from "./api/types";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Layout, { HomeRedirect, RequireRole } from "./components/layout/Layout";
import LoginPage from "./pages/LoginPage";
import { Skeleton } from "./shared/ui/skeleton";

// Each signed-in page is its own chunk, fetched the first time it is opened. LoginPage and
// Layout stay in the main bundle, so the first screen and the frame never wait on a chunk.
const AvailabilityPage = lazy(() => import("./pages/AvailabilityPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NewRequestPage = lazy(() => import("./pages/NewRequestPage"));
const RecordUnitPage = lazy(() => import("./pages/RecordUnitPage"));
const RequestDetailPage = lazy(() => import("./pages/RequestDetailPage"));
const RequestsPage = lazy(() => import("./pages/RequestsPage"));
const SlotsPage = lazy(() => import("./pages/SlotsPage"));
const UnitDetailPage = lazy(() => import("./pages/UnitDetailPage"));
const UnitsPage = lazy(() => import("./pages/UnitsPage"));

// Who can open each screen. The nav in Layout shows the same set.
const ALL_STAFF: readonly Role[] = ["BANK_STAFF", "HOSPITAL_STAFF", "ADMIN"];
const BANK_AND_ADMIN: readonly Role[] = ["BANK_STAFF", "ADMIN"];
const BANK_ONLY: readonly Role[] = ["BANK_STAFF"];
const HOSPITAL_ONLY: readonly Role[] = ["HOSPITAL_STAFF"];
const DONOR_BANK_AND_ADMIN: readonly Role[] = ["DONOR", "BANK_STAFF", "ADMIN"];

// Signed out → /login. Wraps every route except /login.
function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Wraps the lazy page routes inside Layout, so the header and nav stay up while a page's chunk loads.
function PageSuspense() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm font-medium">
            Loading…
          </p>
          <Skeleton lines={6} />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
}

function NotFoundPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted-foreground">Check the address, or use the links above.</p>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<HomeRedirect />} />
            <Route element={<PageSuspense />}>
              <Route
                path="dashboard"
                element={
                  <RequireRole roles={BANK_AND_ADMIN}>
                    <DashboardPage />
                  </RequireRole>
                }
              />
              <Route
                path="units"
                element={
                  <RequireRole roles={BANK_AND_ADMIN}>
                    <UnitsPage />
                  </RequireRole>
                }
              />
              <Route
                path="units/new"
                element={
                  <RequireRole roles={BANK_ONLY}>
                    <RecordUnitPage />
                  </RequireRole>
                }
              />
              <Route
                path="units/:unitId"
                element={
                  <RequireRole roles={BANK_AND_ADMIN}>
                    <UnitDetailPage />
                  </RequireRole>
                }
              />
              <Route
                path="availability"
                element={
                  <RequireRole roles={ALL_STAFF}>
                    <AvailabilityPage />
                  </RequireRole>
                }
              />
              <Route
                path="requests"
                element={
                  <RequireRole roles={ALL_STAFF}>
                    <RequestsPage />
                  </RequireRole>
                }
              />
              <Route
                path="requests/new"
                element={
                  <RequireRole roles={HOSPITAL_ONLY}>
                    <NewRequestPage />
                  </RequireRole>
                }
              />
              <Route
                path="requests/:requestId"
                element={
                  <RequireRole roles={ALL_STAFF}>
                    <RequestDetailPage />
                  </RequireRole>
                }
              />
              <Route
                path="slots"
                element={
                  <RequireRole roles={DONOR_BANK_AND_ADMIN}>
                    <SlotsPage />
                  </RequireRole>
                }
              />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
