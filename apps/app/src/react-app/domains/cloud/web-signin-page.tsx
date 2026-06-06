/** @jsxImportSource react */
import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { readDenSettings } from "../../../app/lib/den";
import { isWebDeployment } from "../../../app/lib/openwork-deployment";

/**
 * Simple web-based sign-in page for multi-tenant deployments.
 * Uses email/password authentication with the Den API.
 */
export function WebSigninPage() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const settings = readDenSettings();
    const apiBaseUrl = settings.apiBaseUrl;

    if (!apiBaseUrl) {
      setError("Den API URL not configured");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Invalid email or password");
      }

      // Successfully signed in, redirect to connect
      navigate("/connect", { replace: true });
    } catch (err) {
      console.error("[WebSigninPage] Sign in failed:", err);
      setError(err instanceof Error ? err.message : "Sign in failed");
      setIsLoading(false);
    }
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

        <form onSubmit={handleSignIn} className="mt-8 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Only authorized organization members can sign in
        </p>
      </div>
    </div>
  );
}
