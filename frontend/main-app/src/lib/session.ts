/** Keeps people signed in: access tokens last 15 minutes, so when the API answers 401 we trade the
 *  7-day refresh token for a new pair and repeat the request once. If that fails, go to login. */
import { clearTokens, getAccessToken, storeTokens } from "./auth";

const REFRESH_KEY = "lb_refresh_token";
const originalFetch = window.fetch.bind(window);
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const rt = localStorage.getItem(REFRESH_KEY);
  if (!rt) return false;
  try {
    const res = await originalFetch("/api/v1/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    storeTokens(await res.json());
    return true;
  } catch { return false; }
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await originalFetch(input, init);
  const url = urlOf(input);
  const isApi = url.includes("/api/v1/");
  const isAuthCall = /\/auth\/(login|signup|refresh|accept-invite|forgot|reset|verify)/.test(url);
  if (res.status !== 401 || !isApi || isAuthCall || !getAccessToken()) return res;

  refreshing ??= refreshTokens().finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  if (await refreshing) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("Authorization", `Bearer ${getAccessToken()}`);
    return originalFetch(input, { ...init, headers });
  }
  clearTokens();
  if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
  return res;
};
