import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
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

const SYSTEM_SANS_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const rootFontStyle: CSSProperties = {
  ["--font-sans" as string]: SYSTEM_SANS_STACK,
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" style={rootFontStyle}>
      <body>
        <ClientExceptionReporter />
        {children}
      </body>
    </html>
  );
}
