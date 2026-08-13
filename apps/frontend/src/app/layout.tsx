import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NLPearl Orchestrator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <strong>NLPearl Orchestrator</strong>
          <Link href="/flow-runs">Records</Link>
          <Link href="/flow-config">Flow Config</Link>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
