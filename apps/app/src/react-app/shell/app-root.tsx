/** @jsxImportSource react */

import React, { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { readDenBootstrapConfig, readDenSettings, PREDEFINED_WORKER_ID, createDenClient, normalizeDenBaseUrl, writeDenSettings } from "../../app/lib/den";
import { denSettingsChangedEvent, denSessionUpdatedEvent, dispatchDenSessionUpdated } from "../../app/lib/den-session-events";
import { useDenAuth } from "../domains/cloud/den-auth-provider";
import { ForcedSigninPage } from "../domains/cloud/forced-signin-page";
import { WebSigninPage } from "../domains/cloud/web-signin-page";
import { OrgOnboardingPage } from "../domains/cloud/org-onboarding-page";
import { PredefinedWorkerConnect } from "../domains/cloud/predefined-worker-connect";
import { NewProvidersToast } from "./new-providers-toast";
import { useDesktopFontZoomBehavior } from "./font-zoom";
import { LoadingOverlay } from "./loading-overlay";
import { DevProfiler, DevProfilerOverlay } from "./dev-profiler";
import { ReactRenderWatchdogOverlay } from "./react-render-watchdog-overlay";
import { AppMenuProvider } from "./app-menu";
import { OpenworkControlProvider, OpenworkRouteControlActions } from "./control/control-provider";
import { SessionRoute } from "./session-route";
import { SettingsRoute } from "./settings-route";
import { ShellConfigProvider } from "./shell-config";
import { WelcomeRoute } from "./welcome-route";


/**
 * Auth callback route for web deployments.
 * Receives a handoff grant from admin.soapbox.build, exchanges it for an auth token,
 * and then navigates to the connect/onboarding page.
 */
function AuthCallbackRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = React.useState("Processing...");
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    const grant = searchParams.get("grant");
    const denBaseUrl = searchParams.get("denBaseUrl");

    if (!grant) {
      setError("Missing authentication grant");
      setTimeout(() => navigate("/signin", { replace: true }), 2000);
      return;
    }

    const baseUrl = normalizeDenBaseUrl(denBaseUrl || "") || readDenSettings().baseUrl;
    const currentSettings = readDenSettings();
    const apiBaseUrl = currentSettings.apiBaseUrl || readDenBootstrapConfig().apiBaseUrl;

    setStatus("Completing sign-in...");

    createDenClient({ baseUrl, apiBaseUrl })
      .exchangeDesktopHandoff(grant)
      .then((result) => {
        if (!result.token) {
          throw new Error("Failed to obtain authentication token");
        }

        writeDenSettings({
          baseUrl,
          authToken: result.token,
          activeOrgId: null,
          activeOrgSlug: null,
          activeOrgName: null,
        });

        dispatchDenSessionUpdated({
          status: "success",
          baseUrl,
          token: result.token,
          user: result.user,
          email: result.user?.email ?? null,
        });

        setStatus("Sign-in successful! Redirecting...");
        setTimeout(() => {
          navigate(PREDEFINED_WORKER_ID ? "/connect" : "/session", { replace: true });
        }, 500);
      })
      .catch((err) => {
        console.error("[auth-callback] Error:", err);
        setError(err instanceof Error ? err.message : "Authentication failed");
        setTimeout(() => navigate("/signin", { replace: true }), 3000);
      });
  }, [navigate, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          </div>
          <h2 className="text-center text-xl font-semibold text-gray-900">
            {error ? "Authentication Error" : "Signing In"}
          </h2>
          {error ? (
            <p className="text-center text-sm text-red-600">{error}</p>
          ) : (
            <p className="text-center text-sm text-gray-600">{status}</p>
          )}
        </div>
      </div>
    </div>
  );
}

type DenSigninGateProps = {
  children: ReactNode;
};

const readRequireSigninSnapshot = () => readDenBootstrapConfig().requireSignin;

const subscribeToRequireSignin = (onStoreChange: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(denSettingsChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener(denSettingsChangedEvent, onStoreChange);
  };
};

/**
 * Forced-signin gate ported from the Solid shell.
 *
 * When the desktop bootstrap config has `requireSignin: true` (persisted by
 * the Tauri shell via `desktop-bootstrap.json`), the UI is held at `/signin`
 * until the user authenticates with Den. When sign-in is NOT required, we
 * never let users land on `/signin` — redirect them to `/session` instead.
 *
 * While we're still checking the Den session AND sign-in is required, we
 * render nothing so the transcript/settings never flash behind the gate.
 */
function DenSigninGate({ children }: DenSigninGateProps) {
  const denAuth = useDenAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requireSignin = useSyncExternalStore(
    subscribeToRequireSignin,
    readRequireSigninSnapshot,
    readRequireSigninSnapshot,
  );

  useEffect(() => {
    // Wait for the first auth check so we don't bounce the user between
    // `/session` and `/signin` every navigation while we figure out if
    // their cached token is still valid.
    if (denAuth.status === "checking") return;

    const path = location.pathname.toLowerCase();
    const onSignin = path === "/signin" || path.startsWith("/signin/");
    const onAuthCallback = path === "/auth-callback" || path.startsWith("/auth-callback/");
    const onOnboarding = path === "/onboarding" || path.startsWith("/onboarding/");

    if (requireSignin) {
      if (!denAuth.isSignedIn && !onSignin && !onAuthCallback) {
        navigate("/signin", { replace: true });
      } else if (denAuth.isSignedIn && onSignin) {
        // Signed in — route to predefined worker connect if configured, otherwise onboarding
        if (PREDEFINED_WORKER_ID) {
          navigate("/connect", { replace: true });
        } else {
          navigate("/onboarding", { replace: true });
        }
      }
    } else if (onSignin) {
      navigate("/session", { replace: true });
    }

    // If on /onboarding but not signed in, bounce to signin or session
    if (onOnboarding && !denAuth.isSignedIn) {
      navigate(requireSignin ? "/signin" : "/session", { replace: true });
    }
  }, [
    denAuth.isSignedIn,
    denAuth.status,
    location,
    navigate,
    requireSignin,
  ]);

  // After a fresh sign-in, navigate to the connect or onboarding page.
  // Poll for activeOrgId (set asynchronously by refreshOrgs) rather
  // than using a fixed delay — handles both fast and slow org lookups.
  useEffect(() => {
    const handler = (event: WindowEventMap[typeof denSessionUpdatedEvent]) => {
      if (event.detail?.status !== "success") return;
      let attempts = 0;
      const check = () => {
        attempts++;
        const settings = readDenSettings();
        if (settings.authToken?.trim() && settings.activeOrgId?.trim()) {
          // Navigate to connect page if predefined worker is configured
          navigate(PREDEFINED_WORKER_ID ? "/connect" : "/onboarding", { replace: true });
        } else if (attempts < 10) {
          // Org not selected yet — retry (max ~5 seconds)
          setTimeout(check, 500);
        }
      };
      // First check after a short delay for the auth to settle
      setTimeout(check, 500);
    };
    window.addEventListener(denSessionUpdatedEvent, handler);
    return () => window.removeEventListener(denSessionUpdatedEvent, handler);
  }, [navigate]);

  if (requireSignin && denAuth.status === "checking") {
    return <ForcedSigninPage developerMode={false} />;
  }

  return <>{children}</>;
}

export function AppRoot() {
  useDesktopFontZoomBehavior();

  return (
    <>
      <DevProfiler id="AppRoot">
        <ShellConfigProvider>
        <AppMenuProvider>
        <OpenworkControlProvider>
          <OpenworkRouteControlActions />
          <DenSigninGate>
            <Routes>
              <Route
                path="/web-signin"
                element={
                  <DevProfiler id="WebSigninRoute">
                    <WebSigninPage />
                  </DevProfiler>
                }
              />
              <Route
                path="/auth-callback"
                element={
                  <DevProfiler id="AuthCallback">
                    <AuthCallbackRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/signin"
                element={
                  <DevProfiler id="SigninRoute">
                    <ForcedSigninPage developerMode={false} />
                  </DevProfiler>
                }
              />
              <Route
                path="/connect"
                element={
                  <DevProfiler id="PredefinedWorkerConnect">
                    <PredefinedWorkerConnect />
                  </DevProfiler>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <DevProfiler id="OrgOnboarding">
                    <OrgOnboardingPage />
                  </DevProfiler>
                }
              />
              <Route
                path="/welcome"
                element={
                  <DevProfiler id="WelcomeRoute">
                    <WelcomeRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/session/:sessionId"
                element={
                  <DevProfiler id="SessionRoute">
                    <SessionRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/workspace/:workspaceId/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <SettingsRoute />
                  </DevProfiler>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <DevProfiler id="SettingsRoute">
                    <SettingsRoute />
                  </DevProfiler>
                }
              />
              {/* Default + fallback: land on the session view or connect for predefined worker. */}
              <Route
                path="/"
                element={<Navigate to={PREDEFINED_WORKER_ID ? "/connect" : "/session"} replace />}
              />
              <Route
                path="*"
                element={<Navigate to={PREDEFINED_WORKER_ID ? "/connect" : "/session"} replace />}
              />
            </Routes>
          </DenSigninGate>
        </OpenworkControlProvider>
        </AppMenuProvider>
        </ShellConfigProvider>
        <LoadingOverlay />
      </DevProfiler>
      {/*
        DevProfilerOverlay sits OUTSIDE the AppRoot <Profiler> zone on
        purpose. The overlay re-renders on every emit() to refresh its
        table, and any commit inside a <Profiler> is recorded as a
        commit on that zone. Mounting the overlay inside AppRoot would
        inflate AppRoot's commit count by hundreds of overlay
        self-renders for every real user-visible commit, masking the
        true app-level signal.
      */}
      <NewProvidersToast />
      <DevProfilerOverlay />
      <ReactRenderWatchdogOverlay />
    </>
  );
}
