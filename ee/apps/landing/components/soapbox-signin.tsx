"use client";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

type Props = {
  loginUrl?: string;
};

/**
 * Soapbox-branded sign-in page
 * Isolated from OpenWork landing to avoid merge conflicts
 */
export function SoapboxSignIn({ loginUrl = "https://app.openworklabs.com" }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Redirect to the cloud login (login mode, not sign-up)
    window.location.href = loginUrl;
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[30%] h-[70%] w-[60%] rounded-full bg-[radial-gradient(ellipse,rgba(14,51,217,0.03),transparent_70%)] blur-3xl" />
        <div className="absolute -bottom-[20%] -right-[10%] h-[50%] w-[50%] rounded-full bg-[radial-gradient(ellipse,rgba(255,126,46,0.03),transparent_70%)] blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Logo/Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-[#011627]">
              Soapbox
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Sign in to your workspace
            </p>
          </div>

          {/* Login Modal */}
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <a href="#" className="text-blue-600 hover:text-blue-700">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#011627] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#022d4d]"
              >
                Sign in <ArrowRight size={16} />
              </button>
            </form>
          </div>

          {/* Footer text */}
          <p className="mt-6 text-center text-xs text-gray-500">
            © 2026 Soapbox. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
