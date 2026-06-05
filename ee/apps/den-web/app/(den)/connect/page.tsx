"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PREDEFINED_WORKER_ID,
  OPENWORK_APP_CONNECT_BASE_URL,
  buildOpenworkAppConnectUrl,
  getWorkerStatusMeta,
} from "../_lib/den-flow";
import { useDenFlow } from "../_providers/den-flow-provider";

export default function ConnectPage() {
  const router = useRouter();
  const { user, workers, workersLoadedOnce, checkWorkerStatus, generateWorkerToken, activeWorker } = useDenFlow();
  const [status, setStatus] = useState<string>("Loading...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setStatus("Not authenticated. Redirecting to login...");
      setTimeout(() => {
        router.replace("/?mode=sign-in");
      }, 1000);
      return;
    }

    if (!PREDEFINED_WORKER_ID) {
      setError("No predefined worker configured");
      setStatus("Configuration error");
      return;
    }

    if (!workersLoadedOnce) {
      setStatus("Loading workers...");
      return;
    }

    const worker = workers.find((w) => w.workerId === PREDEFINED_WORKER_ID);
    if (!worker) {
      setError(`Worker ${PREDEFINED_WORKER_ID} not found`);
      setStatus("Worker not found");
      return;
    }

    const statusMeta = getWorkerStatusMeta(worker.status);

    if (statusMeta.bucket !== "ready") {
      setStatus(`Worker is ${statusMeta.label.toLowerCase()}. Waiting for worker to be ready...`);
      // Poll for status
      const interval = setInterval(() => {
        void checkWorkerStatus({ workerId: PREDEFINED_WORKER_ID, quiet: true });
      }, 3000);
      return () => clearInterval(interval);
    }

    setStatus("Worker is ready. Fetching connection credentials...");

    // Fetch worker tokens and connect
    const connect = async () => {
      try {
        // Generate token if needed
        if (!activeWorker?.clientToken && !activeWorker?.ownerToken) {
          setStatus("Generating access token...");
          await generateWorkerToken();
        }

        // Build connect URL
        const connectUrl = buildOpenworkAppConnectUrl(
          OPENWORK_APP_CONNECT_BASE_URL,
          activeWorker?.openworkUrl || worker.instanceUrl,
          activeWorker?.clientToken || activeWorker?.ownerToken,
          worker.workerId,
          worker.workerName,
          { autoConnect: true }
        );

        if (connectUrl) {
          setStatus("Connecting to worker...");
          // Redirect to the worker
          window.location.href = connectUrl;
        } else {
          setError("Failed to build connection URL");
          setStatus("Connection error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setStatus("Connection failed");
      }
    };

    void connect();
  }, [user, workers, workersLoadedOnce, activeWorker, checkWorkerStatus, generateWorkerToken, router]);

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
