"use client";

import { useEffect } from "react";
import { ClientExceptionSurface } from "@/components/client-exception-surface";
import { formatBoundaryException } from "@/lib/client-exception";

type AppErrorProps = Readonly<{
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}>;

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="client-exception-page-shell">
      <ClientExceptionSurface
        actions={[
          {
            kind: "primary",
            label: "Try again",
            onPress: reset,
          },
        ]}
        details={formatBoundaryException(error, "route")}
        variant="page"
      />
    </main>
  );
}
