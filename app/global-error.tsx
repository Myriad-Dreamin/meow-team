"use client";

import { useEffect } from "react";
import { ClientExceptionSurface } from "@/components/client-exception-surface";
import exceptionStyles from "@/components/client-exception-surface.module.css";
import { formatBoundaryException } from "@/lib/client-exception";
import "codemirror/lib/codemirror.css";
import "codemirror/addon/hint/show-hint.css";
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
        <main className={exceptionStyles["client-exception-page-shell"]}>
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
