import type { CompanySize, Industry } from "./onboarding";

const ACCESS_TOKEN_KEY = "lb_access_token";
const REFRESH_TOKEN_KEY = "lb_refresh_token";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  is_active: boolean;
  must_change_password?: boolean;
}

export function storeTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Impersonation tokens (issued by the admin panel) are access-only and
// short-lived by design — no refresh token, so any stale one is cleared
// rather than left around to silently extend the session.
export function storeImpersonationAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function extractError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export interface SignupInput {
  email: string;
  password: string;
  orgName: string;
  language: "bn" | "en";
  phone: string;
  industry: Industry;
  companySize: CompanySize;
  website?: string;
}

export interface SignupResponse {
  verification_required: boolean;
  email: string;
  access_token?: string | null;
  refresh_token?: string | null;
}

export async function signup(input: SignupInput): Promise<SignupResponse> {
  const res = await fetch("/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      org_name: input.orgName,
      language: input.language,
      phone: input.phone,
      industry: input.industry,
      company_size: input.companySize,
      website: input.website || null,
    }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Signup failed"));
  }
  return res.json();
}

export async function verifyOtp(email: string, code: string): Promise<TokenPair> {
  const res = await fetch("/api/v1/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Verification failed"));
  }
  return res.json();
}

export async function resendOtp(email: string): Promise<void> {
  const res = await fetch("/api/v1/auth/resend-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Could not resend the code"));
  }
}

export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch("/api/v1/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Could not send the reset code"));
  }
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<TokenPair> {
  const res = await fetch("/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Could not reset the password"));
  }
  return res.json();
}

export async function acceptInvite(token: string, password: string): Promise<TokenPair> {
  const res = await fetch("/api/v1/auth/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Invite link is invalid or expired"));
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, "Login failed"));
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const token = getAccessToken();
  const res = await fetch("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error("Not authenticated");
  }
  return res.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch("/api/v1/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const d = body.detail;
    throw new Error(Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg ?? "").join(" ") : d ?? "Could not change the password");
  }
}
