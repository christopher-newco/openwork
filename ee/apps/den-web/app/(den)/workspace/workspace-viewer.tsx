"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { requestJson, type WorkerTokens } from "../_lib/den-flow";
import { useDenFlow } from "../_providers/den-flow-provider";

type WorkerData = {
  id: string;
  name: string;
  status: string;
  instanceUrl: string | null;
  tokens: WorkerTokens | null;
};

export function WorkspaceViewer() {
  const router = useRouter();
  const { user, sessionHydrated } = useDenFlow();
  const [status, setStatus] = useState<string>("Loading workspace...");
  const [error, setError] = useState<string | null>(null);
  const [worker, setWorker] = useState<WorkerData | null>(null);

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

    const loadWorker = async () => {
      try {
        setStatus("Fetching workspace...");

        // Get the org's worker
        const { response: listResponse, payload: listPayload } = await requestJson("/v1/workers", {
          method: "GET",
        });

        if (!listResponse.ok) {
          setError("Failed to fetch workspace");
          setStatus("Error loading workspace");
          return;
        }

        const workers = Array.isArray((listPayload as any)?.workers)
          ? (listPayload as any).workers
          : [];

        if (workers.length === 0) {
          setError("No workspace found for your organization");
          setStatus("No workspace available");
          return;
        }

        const firstWorker = workers[0];
        const workerId = firstWorker.id;

        setStatus("Loading workspace tokens...");

        // Get worker tokens
        const { response: tokensResponse, payload: tokensPayload } = await requestJson(
          `/v1/workers/${workerId}/tokens`,
          { method: "GET" }
        );

        if (!tokensResponse.ok) {
          setError("Failed to get workspace access");
          setStatus("Authentication error");
          return;
        }

        const tokens = (tokensPayload as any)?.tokens;
        const connect = (tokensPayload as any)?.connect;

        if (!tokens?.client) {
          setError("Workspace access token not available");
          setStatus("Configuration error");
          return;
        }

        const workerData: WorkerData = {
          id: workerId,
          name: firstWorker.name || "Workspace",
          status: firstWorker.status || "unknown",
          instanceUrl: connect?.openworkUrl || firstWorker.instance?.url || null,
          tokens: {
            clientToken: tokens.client,
            ownerToken: tokens.owner || tokens.host || null,
            hostToken: tokens.host || null,
            openworkUrl: connect?.openworkUrl || null,
            workspaceId: connect?.workspaceId || null,
          },
        };

        setWorker(workerData);

        if (!workerData.instanceUrl) {
          setError("Workspace URL not available");
          setStatus("Workspace not ready");
          return;
        }

        // Fetch workspaces from the worker to get the full URL
        setStatus("Redirecting to workspace...");

        try {
          const workspacesResponse = await fetch(`${workerData.instanceUrl}/workspaces`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${tokens.client}`,
            },
          });

          if (workspacesResponse.ok) {
            const workspacesData = await workspacesResponse.json();
            const workspaceId = workspacesData.activeId || workspacesData.items?.[0]?.id;

            if (workspaceId) {
              const fullUrl = `${workerData.instanceUrl}/w/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(tokens.client)}`;
              // Direct redirect - no iframe overhead
              window.location.href = fullUrl;
              return;
            }
          }
        } catch (err) {
          console.warn("[workspace-viewer] Failed to fetch workspaces, using base URL", err);
        }

        // Fallback to base URL with token
        const fallbackUrl = `${workerData.instanceUrl}?token=${encodeURIComponent(tokens.client)}`;
        // Direct redirect - no iframe overhead
        window.location.href = fallbackUrl;
      } catch (err) {
        console.error("[workspace-viewer] Error loading workspace:", err);
        setError(err instanceof Error ? err.message : "Failed to load workspace");
        setStatus("Connection failed");
      }
    };

    void loadWorker();
  }, [user, sessionHydrated, router]);

  if (error) {
    return (
      <section className="den-page flex w-full items-center justify-center py-8">
        <div className="den-frame max-w-md p-8">
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <img src="/openwork-logo-transparent.svg" alt="OpenWork" className="h-12 w-auto" />
            </div>

            <div className="space-y-3">
              <h1 className="text-center text-2xl font-semibold text-[var(--dls-text-primary)]">
                Workspace Error
              </h1>

              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => router.push("/")}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Show loading state while redirecting
  return (
    <section className="den-page flex w-full items-center justify-center py-8">
      <div className="den-frame max-w-md p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-center">
            <img src="/openwork-logo-transparent.svg" alt="OpenWork" className="h-12 w-auto" />
          </div>

          <div className="space-y-3">
            <h1 className="text-center text-2xl font-semibold text-[var(--dls-text-primary)]">
              Loading Workspace
            </h1>

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
          </div>
        </div>
      </div>
    </section>
  );
}
