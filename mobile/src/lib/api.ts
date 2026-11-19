import Constants from "expo-constants";
import { Platform } from "react-native";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

/** On a phone running Expo Go the dev machine's LAN address is already known from Metro, so reuse it. */
export function defaultServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (env) return env;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
}

export const normalizeServerUrl = (u: string) => {
  let s = u.trim().replace(/\/+$/, "");
  if (s && !/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s;
};

export function makeApi(getBase: () => string, getToken: () => string | null) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${getBase()}/api${path}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError("NETWORK", `Can't reach the server at ${getBase()}. Check the address and that you're on the same Wi-Fi.`);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(json?.error?.code ?? "ERROR", json?.error?.message ?? `Request failed (${res.status})`, res.status);
    return json as T;
  }
  return {
    get: <T,>(p: string) => request<T>("GET", p),
    post: <T,>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
    put: <T,>(p: string, b?: unknown) => request<T>("PUT", p, b ?? {}),
    patch: <T,>(p: string, b?: unknown) => request<T>("PATCH", p, b ?? {}),
    del: <T,>(p: string) => request<T>("DELETE", p),
  };
}
export type Api = ReturnType<typeof makeApi>;
