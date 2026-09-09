import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

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
  return (
    <section className="status-panel" aria-labelledby="workspace-heading">
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
      ) : data ? (
        <>
          <div className="connection ready">
            <span className="indicator" />
            Ready for takeoff
          </div>
          <p>{data.message}</p>
          <p className="next">
            UP NEXT<span>{data.nextMilestone}</span>
          </p>
        </>
      ) : (
        <p role="status">Loading your workspace…</p>
      )}
    </section>
  );
}
