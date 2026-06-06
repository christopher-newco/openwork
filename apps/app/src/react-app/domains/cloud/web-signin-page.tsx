/** @jsxImportSource react */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { readDenSettings } from "../../../app/lib/den";
import { isWebDeployment } from "../../../app/lib/openwork-deployment";
import { useBootState } from "../../shell/boot-state";

/**
 * Web-based sign-in redirect page for multi-tenant deployments.
 * Redirects to admin.soapbox.build for authentication, then returns via handoff grant.
 */
export function WebSigninPage() {
  const navigate = useNavigate();
  const { markRouteReady } = useBootState();

  useEffect(() => {
    // Mark route as ready to dismiss loading overlay
    markRouteReady();
  }, [markRouteReady]);

  useEffect(() => {
    // Only show this page for web deployments
    if (!isWebDeployment()) {
      navigate("/session", { replace: true });
      return;
    }

    // Redirect to admin for authentication
    const settings = readDenSettings();
    const baseUrl = settings.baseUrl || "https://admin.soapbox.build";

    // Redirect to admin, which will create a handoff grant and redirect back
    window.location.href = `${baseUrl}/?redirect_to=workspace`;
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-dls-background">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-dls-border border-t-dls-accent"></div>
        <p className="mt-4 text-sm text-dls-secondary">Redirecting to sign in...</p>
      </div>
    </div>
  );
}
