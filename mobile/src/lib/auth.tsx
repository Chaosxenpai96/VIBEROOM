import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, defaultServerUrl, makeApi, normalizeServerUrl, type Api } from "./api";
import type { User } from "./types";

interface AuthState {
  ready: boolean; user: User | null; token: string | null; serverUrl: string; api: Api;
  setServerUrl: (u: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (p: { displayName?: string; bio?: string; avatarColor?: string }) => Promise<void>;
  resolveUrl: (path: string | null | undefined) => string | null;
}
const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error("AuthProvider missing"); return c; };

const K_TOKEN = "vr_token", K_SERVER = "vr_server";
const safeGet = (k: string) => SecureStore.getItemAsync(k).catch(() => null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState(defaultServerUrl());
  const tokenRef = useRef<string | null>(null);
  const serverRef = useRef(serverUrl);
  tokenRef.current = token; serverRef.current = serverUrl;
  const api = useMemo(() => makeApi(() => serverRef.current, () => tokenRef.current), []);

  useEffect(() => {
    (async () => {
      const [t, s] = await Promise.all([safeGet(K_TOKEN), safeGet(K_SERVER)]);
      if (s) { serverRef.current = s; setServerUrlState(s); }
      if (t) {
        tokenRef.current = t;
        try {
          const me = await api.get<{ user: User }>("/auth/me");
          setToken(t); setUser(me.user);
        } catch (e) {
          // Only a rejected session logs the user out; being offline keeps the stored session.
          if (e instanceof ApiError && e.status === 401) { tokenRef.current = null; await SecureStore.deleteItemAsync(K_TOKEN).catch(() => {}); }
          else { setToken(t); }
        }
      }
      setReady(true);
    })();
  }, [api]);

  const finish = useCallback(async (r: { token: string; user: User }) => {
    tokenRef.current = r.token; setToken(r.token); setUser(r.user);
    await SecureStore.setItemAsync(K_TOKEN, r.token).catch(() => {});
  }, []);

  const value: AuthState = {
    ready, user, token, serverUrl, api,
    setServerUrl: async (u) => {
      const n = normalizeServerUrl(u);
      serverRef.current = n; setServerUrlState(n);
      await SecureStore.setItemAsync(K_SERVER, n).catch(() => {});
    },
    signIn: async (email, password) => finish(await api.post("/auth/login", { email, password })),
    signUp: async (email, password, displayName) => finish(await api.post("/auth/register", { email, password, displayName })),
    signOut: async () => {
      try { await api.post("/auth/logout"); } catch { /* token may already be invalid */ }
      tokenRef.current = null; setToken(null); setUser(null);
      await SecureStore.deleteItemAsync(K_TOKEN).catch(() => {});
    },
    updateProfile: async (p) => { const r = await api.patch<{ user: User }>("/auth/me", p); setUser(r.user); },
    resolveUrl: (p) => (!p ? null : /^https?:\/\//.test(p) ? p : `${serverUrl}${p}`),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
