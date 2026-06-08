/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  createDenClient,
  PREDEFINED_WORKER_ID,
  readDenSettings,
  type DenWorkerSummary,
  type DenWorkerTokens,
} from "@/app/lib/den";
import { workspaceBootstrap } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import { isWebDeployment } from "@/app/lib/openwork-deployment";
import {
  Page,
  PageBackground,
  PageContainer,
  PageContent,
  PageHeader,
  PageLoading,
  PageLoadingDescription,
  PageLoadingSpinner,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";

type ConnectStatus =
  | "loading_worker"
  | "fetching_credentials"
  | "connecting"
  | "error"
  | "no_predefined_worker";

// Den reports a connectable cloud worker as "healthy" (the terminal provisioning
// state); "ready" is accepted too for forward-compat. Other states
// (provisioning/failed/unknown) are not yet connectable.
function isWorkerConnectable(status: string | null | undefined): boolean {
  return status === "healthy" || status === "ready";
}

/**
 * Auto-connects to a predefined worker when VITE_PREDEFINED_WORKER_ID is set.
 *
 * Flow:
 * 1. Fetch worker details from den-api
 * 2. Get worker connection tokens
 * 3. Bootstrap workspace with the worker credentials
 * 4. Navigate to /session
 */
export function PredefinedWorkerConnect() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectStatus>("loading_worker");
  const [error, setError] = useState<string | null>(null);

  // If no predefined worker, skip to session
  useEffect(() => {
    if (!PREDEFINED_WORKER_ID) {
      setStatus("no_predefined_worker");
      navigate("/session", { replace: true });
    }
  }, [navigate]);

  // For web deployments, check session first
  useEffect(() => {
    if (!isWebDeployment() || !PREDEFINED_WORKER_ID) {
      return;
    }

    const checkSession = async () => {
      const settings = readDenSettings();
      const apiBaseUrl = settings.apiBaseUrl;

      if (!apiBaseUrl) {
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/v1/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          // No session, redirect to sign in
          navigate("/web-signin", { replace: true });
        }
      } catch (error) {
        console.error("[PredefinedWorkerConnect] Session check failed:", error);
        navigate("/web-signin", { replace: true });
      }
    };

    checkSession();
  }, [navigate]);

  const settings = readDenSettings();
  const orgId = settings.activeOrgId ?? "";
  const denClient = createDenClient({
    baseUrl: settings.baseUrl,
    apiBaseUrl: settings.apiBaseUrl,
    token: settings.authToken,
  });

  // Fetch worker details
  const {
    data: workerList,
    error: workerError,
    isPending: isLoadingWorker,
  } = useQuery({
    queryKey: ["den-worker", PREDEFINED_WORKER_ID, orgId, settings.baseUrl],
    enabled: Boolean(settings.authToken && orgId),
    queryFn: () => denClient.listWorkers(orgId),
  });

  // Fetch worker tokens
  // If PREDEFINED_WORKER_ID is set, use it. Otherwise use the first available worker for the org.
  const worker = PREDEFINED_WORKER_ID
    ? workerList?.find((w: DenWorkerSummary) => w.workerId === PREDEFINED_WORKER_ID)
    : workerList?.[0];

  const {
    data: tokens,
    error: tokensError,
    isPending: isLoadingTokens,
  } = useQuery({
    queryKey: ["den-worker-tokens", worker?.workerId, orgId, settings.baseUrl],
    enabled: Boolean(worker && isWorkerConnectable(worker.status) && orgId && worker.workerId),
    queryFn: () => denClient.getWorkerTokens(worker!.workerId, orgId),
  });

  // Handle auto-connect
  useEffect(() => {
    if (!orgId) {
      setStatus("loading_worker");
      return;
    }

    if (workerError) {
      setStatus("error");
      setError("Failed to load worker information");
      return;
    }

    if (tokensError) {
      setStatus("error");
      setError("Failed to fetch connection credentials");
      return;
    }

    if (isLoadingWorker) {
      setStatus("loading_worker");
      return;
    }

    if (!worker) {
      setStatus("error");
      setError(
        PREDEFINED_WORKER_ID
          ? `Worker ${PREDEFINED_WORKER_ID} not found`
          : "No workspace found for your organization. Please contact your administrator."
      );
      return;
    }

    if (!isWorkerConnectable(worker.status)) {
      setStatus("loading_worker");
      return;
    }

    if (isLoadingTokens) {
      setStatus("fetching_credentials");
      return;
    }

    if (!tokens?.openworkUrl || !tokens?.ownerToken) {
      setStatus("error");
      setError("Worker credentials are incomplete");
      return;
    }

    // Connect to the worker
    setStatus("connecting");

    const connectToWorker = async () => {
      try {
        if (!isDesktopRuntime()) {
          // Web deployment - just navigate to session with worker info in localStorage
          // The session route will pick it up
          localStorage.setItem("openwork.predefinedWorker", JSON.stringify({
            workerId: worker.workerId,
            workerName: worker.workerName,
            openworkUrl: tokens.openworkUrl,
            accessToken: tokens.ownerToken,
            workspaceId: tokens.workspaceId,
          }));
          navigate("/session", { replace: true });
        } else {
          // Desktop deployment - use desktop API to bootstrap workspace
          await workspaceBootstrap({
            kind: "remote",
            openworkHostUrl: tokens.openworkUrl,
            openworkToken: tokens.ownerToken,
            directory: null,
            displayName: worker.workerName,
          });
          navigate("/session", { replace: true });
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to connect to worker");
      }
    };

    void connectToWorker();
  }, [
    worker,
    tokens,
    workerError,
    tokensError,
    isLoadingWorker,
    isLoadingTokens,
    navigate,
    orgId,
  ]);

  const getStatusMessage = () => {
    switch (status) {
      case "loading_worker":
        return worker?.status === "starting"
          ? "Your workspace is starting up..."
          : "Loading workspace...";
      case "fetching_credentials":
        return "Fetching connection credentials...";
      case "connecting":
        return "Connecting to your workspace...";
      case "error":
        return "Connection Error";
      default:
        return "Loading...";
    }
  };

  if (status === "no_predefined_worker") {
    return null;
  }

  return (
    <Page>
      <PageBackground />
      <PageTitlebarRegion />
      <PageContainer>
        <PageHeader>
          <PageTitle>OpenWork</PageTitle>
        </PageHeader>
        <PageContent>
          {error ? (
            <div className="flex flex-col items-center gap-4 p-8">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 max-w-md">
                <h3 className="font-semibold text-red-900 mb-2">{getStatusMessage()}</h3>
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <button
                onClick={() => navigate("/session", { replace: true })}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Continue to Session
              </button>
            </div>
          ) : (
            <PageLoading>
              <PageLoadingSpinner />
              <PageLoadingDescription>{getStatusMessage()}</PageLoadingDescription>
            </PageLoading>
          )}
        </PageContent>
      </PageContainer>
    </Page>
  );
}
