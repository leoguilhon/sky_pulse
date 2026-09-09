import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Login } from "./login";
import { Workspace } from "./workspace";
import { useAuth } from "./use-auth";
import "./styles.css";

function App() {
  const auth = useAuth();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    if (auth.status !== "authenticated" && auth.status !== "anonymous") return;
    const syncPath = () =>
      window.history.replaceState(
        null,
        "",
        auth.status === "authenticated" ? "/app" : "/login",
      );
    syncPath();
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, [auth.status]);
  async function logout() {
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await auth.logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setLogoutBusy(false);
    }
  }
  return (
    <div
      className={
        auth.status === "authenticated" ? "shell explorer-shell" : "shell"
      }
    >
      <header>
        <a className="brand" href="/" aria-label="SkyPulse home">
          <span className="brand-icon">✳</span> SkyPulse
        </a>
        {auth.session ? (
          <div className="account">
            <span>{auth.session.user.email}</span>
            <button
              className="logout"
              onClick={() => {
                void logout();
              }}
              disabled={logoutBusy}
            >
              {logoutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : (
          <span className="phase">EXPLORE. CONNECT. DISCOVER.</span>
        )}
      </header>
      <main>
        {auth.status !== "authenticated" && (
          <>
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
              Your perspective starts here.
            </p>
          </>
        )}
        {auth.status === "loading" && (
          <section className="status-panel">
            <p role="status">Restoring your session…</p>
          </section>
        )}
        {auth.status === "error" && (
          <section className="status-panel">
            <p className="error" role="alert">
              {auth.notice}
            </p>
            <button
              onClick={() => {
                void auth.restore();
              }}
            >
              Try again
            </button>
          </section>
        )}
        {auth.status === "anonymous" && (
          <Login login={auth.login} notice={auth.notice} />
        )}
        {auth.status === "authenticated" && (
          <>
            <Workspace expire={auth.expire} />
            {logoutError && (
              <p className="error logout-error" role="alert">
                {logoutError}
              </p>
            )}
          </>
        )}
      </main>
      {auth.status !== "authenticated" && (
        <>
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
            <span>A world of movement. One perspective.</span>
          </footer>
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
