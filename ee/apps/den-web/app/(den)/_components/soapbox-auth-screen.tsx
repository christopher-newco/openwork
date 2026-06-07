"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isSamePathname } from "../_lib/client-route";
import { getMcpOAuthSelectOrganizationRoute } from "../_lib/mcp-oauth-route";
import { useDenFlow } from "../_providers/den-flow-provider";
import { AuthPanel } from "./auth-panel";

/**
 * Soapbox-branded authentication screen
 * Simplified version for Soapbox deployment
 * Isolated from OpenWork to avoid merge conflicts
 */
export function SoapboxAuthScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const routingRef = useRef(false);
  const { user, sessionHydrated, desktopAuthRequested, resolveUserLandingRoute } = useDenFlow();
  const hasResolvedSession = sessionHydrated && Boolean(user) && !desktopAuthRequested;

  // Store redirect_to parameter in sessionStorage before OAuth
  useEffect(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const redirectTo = searchParams.get("redirect_to");

    if (redirectTo) {
      window.sessionStorage.setItem("pending_redirect_to", redirectTo);
    }
  }, []);

  useEffect(() => {
    if (!hasResolvedSession || routingRef.current) {
      return;
    }

    const oauthRoute = typeof window === "undefined" ? null : getMcpOAuthSelectOrganizationRoute(window.location.search);
    if (oauthRoute && !isSamePathname(pathname, oauthRoute)) {
      router.replace(oauthRoute);
      return;
    }

    const storedRedirectTo = typeof window === "undefined" ? null : window.sessionStorage.getItem("pending_redirect_to");
    if (storedRedirectTo === "workspace") {
      window.sessionStorage.removeItem("pending_redirect_to");
      routingRef.current = true;
      router.replace("/workspace");
      return;
    }

    routingRef.current = true;
    void resolveUserLandingRoute()
      .then((target) => {
        if (target && !isSamePathname(pathname, target)) {
          router.replace(target);
        }
      })
      .finally(() => {
        routingRef.current = false;
      });
  }, [hasResolvedSession, pathname, resolveUserLandingRoute, router]);

  return (
    <section className="den-page flex w-full items-center justify-center py-8">
      <div className="w-full max-w-md">
        {/* Simple header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--dls-text-primary)]">
            Soapbox
          </h1>
          <p className="mt-2 text-sm text-[var(--dls-text-secondary)]">
            Sign in to your workspace
          </p>
        </div>

        {/* Auth panel - simplified for Soapbox */}
        <AuthPanel
          initialMode="sign-in"
          eyebrow=""
          signInContent={{
            title: "Soapbox.",
            copy: "Build your platform.",
            submitLabel: "Sign in",
            togglePrompt: "Need an account?",
            toggleActionLabel: "Create one",
          }}
          signUpContent={{
            title: "Soapbox.",
            copy: "Build your platform.",
            submitLabel: "Create account",
            togglePrompt: "Have an account?",
            toggleActionLabel: "Sign in",
          }}
        />
      </div>
    </section>
  );
}
