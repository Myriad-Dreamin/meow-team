"use client";

import type { ClientExceptionViewModel } from "@/lib/client-exception";
import { isClientExceptionDebugEnabled } from "@/lib/client-exception";

type ClientExceptionAction = {
  label: string;
  kind?: "primary" | "secondary";
  onPress: () => void;
};

type ClientExceptionSurfaceProps = {
  actions?: ClientExceptionAction[];
  details: ClientExceptionViewModel;
  variant: "overlay" | "page";
};

export function ClientExceptionSurface({
  actions = [],
  details,
  variant,
}: ClientExceptionSurfaceProps) {
  const metadata = [
    details.name ? `Type: ${details.name}` : null,
    details.location ? `Source: ${details.location}` : null,
    details.digest ? `Digest: ${details.digest}` : null,
  ].filter((value): value is string => value !== null);

  return (
    <section
      aria-live="assertive"
      className={`client-exception-surface client-exception-surface-${variant}`}
      role="alert"
    >
      <div className="client-exception-head">
        <p className="client-exception-badge">{details.badge}</p>
      </div>

      <div className="client-exception-copy">
        <h1>{details.title}</h1>
        <p>{details.summary}</p>
      </div>

      {metadata.length > 0 ? (
        <div className="client-exception-meta">
          {metadata.map((item) => (
            <span className="client-exception-meta-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="client-exception-actions">
          {actions.map((action) => (
            <button
              className={action.kind === "primary" ? "primary-button" : "secondary-button"}
              key={action.label}
              type="button"
              onClick={action.onPress}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {isClientExceptionDebugEnabled && (details.stack || details.debugValue) ? (
        <details className="client-exception-debug" open>
          <summary>Debug details</summary>

          {details.stack ? (
            <pre className="client-exception-debug-block">{details.stack}</pre>
          ) : null}
          {details.debugValue ? (
            <pre className="client-exception-debug-block">{details.debugValue}</pre>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
