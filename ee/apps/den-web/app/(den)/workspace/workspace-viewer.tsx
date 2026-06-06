"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDenFlow } from "../_providers/den-flow-provider";

const WORKSPACE_URL = "https://app.soapbox.build";

export function WorkspaceViewer() {
  const router = useRouter();
  const { user, sessionHydrated } = useDenFlow();

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    if (!user) {
      router.replace("/?mode=sign-in");
      return;
    }

    // Redirect to the workspace proxy
    window.location.href = WORKSPACE_URL;
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
              Opening Workspace
            </h1>

            <div className="rounded-lg border border-[var(--dls-border)] bg-[var(--dls-hover)]/60 p-4">
              <div className="flex items-start gap-3">
                <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--dls-accent)] opacity-30" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--dls-accent)]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--dls-text-primary)]">Redirecting to workspace...</p>
                  <p className="mt-1 text-xs text-[var(--dls-text-secondary)]">
                    Taking you to app.soapbox.build
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
