import { useState, type FormEvent } from "react";

export function Login({
  login,
  notice,
}: {
  login: (email: string, password: string) => Promise<void>;
  notice: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  return (
    <section
      className="status-panel login-panel"
      aria-labelledby="login-heading"
    >
      <div className="panel-top">
        <h2 id="login-heading">Welcome to SkyPulse</h2>
        <span className="badge">MEMBER ACCESS</span>
      </div>
      <p>Sign in to access your global air traffic workspace.</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p className="error" id="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p className="access-note">
        Access is by invitation. Contact your SkyPulse administrator for an
        account.
      </p>
    </section>
  );
}
