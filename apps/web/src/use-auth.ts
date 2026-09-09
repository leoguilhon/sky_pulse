import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Session } from "./api";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "anonymous" | "error"
  >("loading");
  const [notice, setNotice] = useState("");
  const version = useRef(0);
  const wasAuthenticated = useRef(false);
  const expire = useCallback(() => {
    version.current++;
    wasAuthenticated.current = false;
    setSession(null);
    setStatus("anonymous");
    setNotice("Your session has ended. Please sign in again.");
  }, []);
  const restore = useCallback(async () => {
    const current = ++version.current;
    try {
      const next = await api<Session>("/api/auth/session");
      if (current !== version.current) return;
      wasAuthenticated.current = true;
      setSession(next);
      setStatus("authenticated");
      setNotice("");
    } catch (error) {
      if (current !== version.current) return;
      setSession(null);
      if (error instanceof ApiError && error.status === 401) {
        if (wasAuthenticated.current)
          setNotice("Your session has ended. Please sign in again.");
        wasAuthenticated.current = false;
        setStatus("anonymous");
      } else {
        setStatus("error");
        setNotice(
          error instanceof Error
            ? error.message
            : "Unable to restore your session.",
        );
      }
    }
  }, []);
  useEffect(() => {
    void restore();
    return () => {
      version.current++;
    };
  }, [restore]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(
      expire,
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    const onFocus = () => {
      void restore();
    };
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(onFocus, 60000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [session, expire, restore]);
  const login = async (email: string, password: string) => {
    const current = ++version.current;
    const next = await api<Session>("/api/auth/login", { email, password });
    if (current !== version.current) return;
    wasAuthenticated.current = true;
    setSession(next);
    setStatus("authenticated");
    setNotice("");
  };
  const logout = async () => {
    version.current++;
    await api<void>("/api/auth/logout", {});
    version.current++;
    wasAuthenticated.current = false;
    setSession(null);
    setStatus("anonymous");
    setNotice("You have signed out.");
  };
  return { session, status, notice, login, logout, restore, expire };
}
