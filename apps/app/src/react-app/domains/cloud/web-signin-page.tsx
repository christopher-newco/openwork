/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { readDenSettings } from "../../../app/lib/den";
import { isWebDeployment } from "../../../app/lib/openwork-deployment";

/**
 * Simple web-based sign-in page for multi-tenant deployments.
 *
 * Shows a "Sign in with GitHub" button that redirects to Den API OAuth,
 * which enforces org membership and redirects back with a session cookie.
 */
export function WebSigninPage() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Only show this page for web deployments
    if (!isWebDeployment()) {
      navigate("/session", { replace: true });
      return;
    }

    // Check if user already has a session
    const checkSession = async () => {
      const settings = readDenSettings();
      const apiBaseUrl = settings.apiBaseUrl;

      if (!apiBaseUrl) {
        setIsChecking(false);
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/v1/me`, {
          credentials: "include",
        });

        if (response.ok) {
          // User is already signed in, redirect to connect
          navigate("/connect", { replace: true });
        } else {
          setIsChecking(false);
        }
      } catch (error) {
        console.error("[WebSigninPage] Session check failed:", error);
        setIsChecking(false);
      }
    };

    checkSession();
  }, [navigate]);

  const handleSignIn = () => {
    const settings = readDenSettings();
    const apiBaseUrl = settings.apiBaseUrl;

    if (!apiBaseUrl) {
      alert("Den API URL not configured");
      return;
    }

    // Redirect to Den API GitHub OAuth
    const callbackUrl = `${window.location.origin}/connect`;
    const oauthUrl = `${apiBaseUrl}/api/auth/github?callbackUrl=${encodeURIComponent(callbackUrl)}`;

    window.location.href = oauthUrl;
  };

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-sm text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <img
            src="/openwork-mark.svg"
            alt="OpenWork"
            className="mx-auto h-16 w-16"
          />
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Welcome to OpenWork
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access your workspace
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={handleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="h-5 w-5"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Sign in with GitHub
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          Only authorized organization members can sign in
        </p>
      </div>
    </div>
  );
}
