import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientExceptionReporter } from "@/components/client-exception-reporter";
import "codemirror/lib/codemirror.css";
import "codemirror/addon/hint/show-hint.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harness Team",
  description: "Continuous AgentKit engineering team with Codex as the backend model.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <ClientExceptionReporter />
        {children}
      </body>
    </html>
  );
}
