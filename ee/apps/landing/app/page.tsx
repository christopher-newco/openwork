import { LandingHome } from "../components/landing-home";
import { SoapboxSignIn } from "../components/soapbox-signin";
import { getGithubData } from "../lib/github";
import { headers } from "next/headers";
import { StructuredData } from "../components/structured-data";
import { baseOpenGraph } from "../lib/seo";

export const metadata = {
  alternates: {
    canonical: "/"
  },
  openGraph: {
    ...baseOpenGraph,
    url: "https://openworklabs.com"
  }
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OpenWork",
  description:
    "Open source Claude Cowork alternative. Desktop app that lets teams use 50+ LLMs, bring their own provider keys, and ship reusable agent setups with guardrails.",
  url: "https://openworklabs.com",
  applicationCategory: "BusinessApplication",
  operatingSystem: "macOS, Windows, Linux",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    url: "https://openworklabs.com/pricing"
  },
  publisher: {
    "@type": "Organization",
    name: "OpenWork",
    url: "https://openworklabs.com"
  }
};

// Detect if this is the Soapbox deployment (admin.soapbox.build)
const isSoapboxDeployment = () => {
  return process.env.NEXT_PUBLIC_SOAPBOX_MODE === "true" ||
         process.env.VERCEL_URL?.includes("soapbox");
};

export default async function Home() {
  // If this is Soapbox deployment, show the simplified sign-in page
  if (isSoapboxDeployment()) {
    return <SoapboxSignIn loginUrl="https://app.openworklabs.com" />;
  }

  // Otherwise, show the full OpenWork landing page
  const github = await getGithubData();
  const cal = process.env.NEXT_PUBLIC_CAL_URL || "/enterprise#book";
  const userAgent = headers().get("user-agent")?.toLowerCase() || "";
  const isMobileVisitor = /android|iphone|ipad|ipod|mobile/.test(userAgent);

  return (
    <>
      <StructuredData data={softwareApplicationSchema} />
      <LandingHome
        stars={github.stars}
        downloadHref={github.downloads.macos}
        callHref={cal}
        isMobileVisitor={isMobileVisitor}
      />
    </>
  );
}
