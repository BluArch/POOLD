import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import type { User } from "@poold/contracts";
import { api, post, restoreSession, saveSession } from "./api";
type Session = {
  user: User | null;
  loading: boolean;
  error: string;
  demoEnabled: boolean;
  refresh: () => Promise<void>;
  login: (path: string, body: object) => Promise<{ message?: string }>;
  logout: () => Promise<void>;
};
const Context = createContext<Session>(null!);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [demoEnabled, setDemo] = useState(false);
  const refresh = async () => {
    const r = await api<{ user: User | null; demoEnabled: boolean }>(
      "/session",
    );
    setUser(r.user);
    setDemo(r.demoEnabled);
    setError("");
  };
  useEffect(() => {
    restoreSession()
      .then(refresh)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const login = async (path: string, body: object) => {
    const r = await post<{ user: User; token?: string; message?: string }>(
      path,
      {
        ...body,
        native: Platform.OS !== "web",
      },
    );
    if (r.token) await saveSession(r.token);
    setUser(r.user);
    setError("");
    return { message: r.message };
  };
  const logout = async () => {
    await post("/auth/logout");
    await saveSession(null);
    setUser(null);
  };
  return (
    <Context.Provider
      value={{ user, loading, error, demoEnabled, refresh, login, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
