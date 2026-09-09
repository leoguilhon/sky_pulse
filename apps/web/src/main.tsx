import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
type Status = "checking" | "ready" | "unavailable" | "network-error";
function App() {
  const [status, setStatus] = useState<Status>("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let active = true;
    setStatus("checking");
    fetch("/api/health/ready", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return "unavailable" as const;
        const data: unknown = await response.json();
        return typeof data === "object" &&
          data !== null &&
          "status" in data &&
          data.status === "ok"
          ? ("ready" as const)
          : ("unavailable" as const);
      })
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch(() => {
        if (active) setStatus("network-error");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);
  const labels: Record<Status, string> = {
    checking: "Checking services",
    ready: "All systems ready",
    unavailable: "Service unavailable",
    "network-error": "Unable to reach the server",
  };
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/" aria-label="SkyPulse home">
          <span className="brand-icon">✳</span> SkyPulse
        </a>
        <span className="phase">PHASE 01 / FOUNDATION</span>
      </header>
      <main>
        <div className="eyebrow">
          <span /> A NEW PERSPECTIVE ON AVIATION
        </div>
        <h1>
          The world in motion.
          <br />
          <em>A clearer view.</em>
        </h1>
        <p className="intro">
          Explore the world’s air traffic in real time.
          <br />
          The journey starts with a connected foundation.
        </p>
        <section className="status-panel" aria-labelledby="status-heading">
          <div className="panel-top">
            <h2 id="status-heading">Environment status</h2>
            <span className="badge">DEVELOPMENT</span>
          </div>
          <div className={`connection ${status}`} role="status">
            <span className="indicator" />
            {labels[status]}
          </div>
          <p>
            {status === "ready"
              ? "The web application, API, and database are connected."
              : status === "checking"
                ? "Connecting to the API and checking the database."
                : "Check the Docker services, then try connecting again."}
          </p>
          <button
            onClick={() => setAttempt((value) => value + 1)}
            disabled={status === "checking"}
          >
            Check connection <span aria-hidden="true">↗</span>
          </button>
        </section>
        <p className="next">
          UP NEXT <span>Secure access → Interactive Earth → Live aircraft</span>
        </p>
      </main>
      <div className="orbital-art" aria-hidden="true">
        <div className="orbit" />
        <div className="planet">
          <div className="meridian" />
          <div className="equator" />
        </div>
        <span className="orbital-point" />
      </div>
      <footer>
        <span>SKYPULSE / GLOBAL AIR TRAFFIC</span>
        <span>Foundation first. Exploration ahead.</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
