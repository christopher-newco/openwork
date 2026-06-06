import { AuthScreen } from "./_components/auth-screen";
import { SoapboxAuthScreen } from "./_components/soapbox-auth-screen";

// Detect if this is a Soapbox deployment
const isSoapboxMode = process.env.NEXT_PUBLIC_SOAPBOX_MODE === "true";

export default function HomePage() {
  // Use simplified Soapbox auth screen in Soapbox mode
  if (isSoapboxMode) {
    return <SoapboxAuthScreen />;
  }

  // Otherwise use full OpenWork auth screen
  return <AuthScreen />;
}
