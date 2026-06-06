/** @jsxImportSource react */
import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { readDenSettings } from "../../../app/lib/den";
import { isWebDeployment } from "../../../app/lib/openwork-deployment";
import { Button } from "@/components/ui/button";

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
      <div className="flex min-h-screen items-center justify-center bg-dls-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-dls-border border-t-dls-accent"></div>
          <p className="mt-4 text-sm text-dls-secondary">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dls-background p-4">
      <div className="relative z-10 w-full max-w-md space-y-6 rounded-2xl border border-dls-border bg-dls-surface p-8 shadow-lg">
        <div className="text-center">
          <img
            src="/openwork-mark.svg"
            alt="OpenWork"
            className="mx-auto h-16 w-16"
          />
          <h2 className="mt-6 text-3xl font-bold text-dls-text">
            Welcome to OpenWork
          </h2>
          <p className="mt-2 text-sm text-dls-secondary">
            Sign in to access your workspace
          </p>
        </div>

        <form onSubmit={handleSignIn} className="relative space-y-5" style={{ pointerEvents: "auto" }}>
          {error && (
            <div className="rounded-lg border border-red-7/30 bg-red-1/40 px-3 py-2 text-sm text-red-11">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block mb-1 text-xs font-medium text-dls-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg bg-dls-surface px-3 py-2 text-sm text-dls-text placeholder:text-dls-secondary border border-dls-border shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.2)]"
              />
            </div>

            <div>
              <label htmlFor="password" className="block mb-1 text-xs font-medium text-dls-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg bg-dls-surface px-3 py-2 text-sm text-dls-text placeholder:text-dls-secondary border border-dls-border shadow-sm focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.2)]"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-dls-secondary">
          Only authorized organization members can sign in
        </p>
      </div>
    </div>
  );
}
