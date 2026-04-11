"use client";

import { useEffect } from "react";
import { ClientExceptionSurface } from "@/components/client-exception-surface";
import { formatBoundaryException } from "@/lib/client-exception";
import "./globals.css";

type GlobalErrorProps = Readonly<{
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}>;

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="client-exception-page-shell">
          <ClientExceptionSurface
            actions={[
              {
                kind: "primary",
                label: "Try again",
                onPress: reset,
              },
            ]}
            details={formatBoundaryException(error, "global")}
            variant="page"
          />
        </main>
      </body>
    </html>
  );
}
