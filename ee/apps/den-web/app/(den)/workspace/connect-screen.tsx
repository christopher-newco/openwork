"use client";

// Redirect to app using desktop handoff grant flow
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OPENWORK_APP_CONNECT_BASE_URL, requestJson } from "../_lib/den-flow";
import { useDenFlow } from "../_providers/den-flow-provider";

export function ConnectScreen() {
  console.log("[connect-screen] Component rendering");
  const router = useRouter();
  const { user, sessionHydrated } = useDenFlow();
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionHydrated) {
      setStatus("Checking authentication...");
      return;
    }

    if (!user) {
      setStatus("Not authenticated. Redirecting to login...");
      setTimeout(() => {
        router.replace("/?mode=sign-in");
      }, 1000);
      return;
    }

    // Create handoff grant and redirect to app
    const connect = async () => {
      try {
        if (!OPENWORK_APP_CONNECT_BASE_URL) {
          setError("App connection URL not configured");
          setStatus("Configuration error");
          return;
        }

        setStatus("Generating handoff token...");

        // Create desktop handoff grant
        const { response, payload } = await requestJson(
          "/v1/auth/desktop-handoff",
          { method: "POST", body: JSON.stringify({}) },
          12000
        );

        if (!response.ok || !payload || typeof payload !== "object" || !("grant" in payload)) {
          console.error("[connect-screen] Handoff grant failed:", payload);
          setError("Failed to create secure handoff");
          setStatus("Handoff failed");
          return;
        }

        const grant = typeof payload.grant === "string" ? payload.grant : null;
        if (!grant) {
          setError("Invalid handoff grant");
          setStatus("Handoff failed");
          return;
        }

        // Build auth callback URL for the app
        const appUrl = new URL(OPENWORK_APP_CONNECT_BASE_URL);
        appUrl.pathname = "/auth-callback";
        appUrl.searchParams.set("grant", grant);
        appUrl.searchParams.set("denBaseUrl", window.location.origin);

        console.log("[connect-screen] Redirecting to app:", appUrl.toString());
        setStatus("Connecting to workspace...");

        // Redirect to the app, which will exchange the grant and connect to the worker
        window.location.href = appUrl.toString();
      } catch (err) {
        console.error("[connect-screen] Connection error:", err);
        setError(err instanceof Error ? err.message : "Failed to connect");
        setStatus("Connection failed");
      }
    };

    void connect();
  }, [user, sessionHydrated, router]);

  return (
    <section className="den-page flex w-full items-center justify-center py-8">
      <div className="den-frame max-w-md p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-center">
            <img src="/openwork-logo-transparent.svg" alt="OpenWork" className="h-12 w-auto" />
          </div>

          <div className="space-y-3">
            <h1 className="text-center text-2xl font-semibold text-[var(--dls-text-primary)]">
              {error ? "Connection Error" : "Connecting to OpenWork"}
            </h1>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--dls-border)] bg-[var(--dls-hover)]/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--dls-accent)] opacity-30" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--dls-accent)]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--dls-text-primary)]">{status}</p>
                    <p className="mt-1 text-xs text-[var(--dls-text-secondary)]">
                      Please wait while we prepare your workspace
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex justify-center">
              <button
                onClick={() => router.push("/")}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Return to Home
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
