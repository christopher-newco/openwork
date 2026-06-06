import { AuthScreen } from "./_components/auth-screen";
import { SoapboxAuthScreen } from "./_components/soapbox-auth-screen";

export default function HomePage() {
  // Server-side runtime check for Soapbox mode
  // Check both NEXT_PUBLIC and server-only env var
  const isSoapboxMode =
    process.env.NEXT_PUBLIC_SOAPBOX_MODE === "true" ||
    process.env.SOAPBOX_MODE === "true" ||
    process.env.RAILWAY_STATIC_URL?.includes("soapbox");

  if (isSoapboxMode) {
    return <SoapboxAuthScreen />;
  }

  // Otherwise use full OpenWork auth screen
  return <AuthScreen />;
}

// Force dynamic rendering to check env var at runtime
export const dynamic = 'force-dynamic';
