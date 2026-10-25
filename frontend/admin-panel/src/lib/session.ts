/** Keeps staff signed in: on a 401 trade the refresh token for a new pair and repeat the request once;
 *  if that fails, go to the login page. (Access tokens only last 15 minutes.) */
import { clearAccessToken, getAccessToken, getRefreshToken, storeAccessToken, storeRefreshToken } from "./auth";

const originalFetch = window.fetch.bind(window);
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await originalFetch("/api/v1/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const t = await res.json();
    storeAccessToken(t.access_token);
    if (t.refresh_token) storeRefreshToken(t.refresh_token);
    return true;
  } catch { return false; }
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await originalFetch(input, init);
  const url = urlOf(input);
  if (res.status !== 401 || !url.includes("/api/v1/") || /\/auth\/(login|refresh)/.test(url) || !getAccessToken()) return res;

  refreshing ??= refreshTokens().finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  if (await refreshing) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("Authorization", `Bearer ${getAccessToken()}`);
    return originalFetch(input, { ...init, headers });
  }
  clearAccessToken();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (!window.location.pathname.startsWith(`${base}/login`)) window.location.assign(`${base}/login`);
  return res;
};
