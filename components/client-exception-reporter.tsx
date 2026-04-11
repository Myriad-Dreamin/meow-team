"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ClientExceptionSurface } from "@/components/client-exception-surface";
import {
  formatUnhandledRejectionException,
  formatWindowErrorException,
  type ClientExceptionViewModel,
} from "@/lib/client-exception";

type CapturedClientException = {
  id: number;
  details: ClientExceptionViewModel;
};

export function ClientExceptionReporter() {
  const [capturedException, setCapturedException] = useState<CapturedClientException | null>(null);

  const captureException = useEffectEvent((details: ClientExceptionViewModel) => {
    setCapturedException({
      id: Date.now(),
      details,
    });
  });

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      captureException(formatWindowErrorException(event));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureException(formatUnhandledRejectionException(event));
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (capturedException === null) {
    return null;
  }

  return (
    <div className="client-exception-overlay">
      <ClientExceptionSurface
        actions={[
          {
            kind: "primary",
            label: "Reload page",
            onPress: () => {
              window.location.reload();
            },
          },
          {
            kind: "secondary",
            label: "Dismiss",
            onPress: () => {
              setCapturedException(null);
            },
          },
        ]}
        details={capturedException.details}
        key={capturedException.id}
        variant="overlay"
      />
    </div>
  );
}
