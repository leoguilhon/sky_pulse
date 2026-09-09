import { lazy, Suspense, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { GlobeBoundary } from "./globe-boundary";
const Globe = lazy(() => import("./globe/globe"));

export function Workspace({ expire }: { expire: () => void }) {
  const [data, setData] = useState<{
    message: string;
    nextMilestone: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api<{ message: string; nextMilestone: string }>("/api/workspace")
      .then((next) => {
        if (active) setData(next);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) expire();
        else
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load your workspace.",
          );
      });
    return () => {
      active = false;
    };
  }, [expire, attempt]);
  if (data && !error)
    return (
      <GlobeBoundary>
        <Suspense
          fallback={
            <p className="workspace-loading" role="status">
              Loading Earth explorer…
            </p>
          }
        >
          <Globe />
        </Suspense>
      </GlobeBoundary>
    );
  return (
    <section
      className="status-panel workspace-loading"
      aria-labelledby="workspace-heading"
    >
      <div className="panel-top">
        <h2 id="workspace-heading">Your workspace</h2>
        <span className="badge">SIGNED IN</span>
      </div>
      {error ? (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <button onClick={() => setAttempt(attempt + 1)}>Try again</button>
        </>
      ) : (
        <p role="status">Loading your workspace…</p>
      )}
    </section>
  );
}
