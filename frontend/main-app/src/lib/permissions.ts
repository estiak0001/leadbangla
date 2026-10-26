import { useEffect, useState } from "react";
import { getAccessToken } from "./auth";
import { fetchOrganizationProfile, type OrganizationProfile } from "./organization";

let cache: { token: string | null; promise: Promise<OrganizationProfile> } | null = null;

/** The signed-in person's role and access, fetched once per login. */
export function getMe(): Promise<OrganizationProfile> {
  const token = getAccessToken();
  if (!cache || cache.token !== token) {
    const promise = fetchOrganizationProfile();
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
    cache = { token, promise };
  }
  return cache.promise;
}
export const forgetMe = () => { cache = null; };

export function useMe() {
  const [me, setMe] = useState<OrganizationProfile | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    // A person with no company yet (new signup, just-approved payment) gets a 403 here. That still ends the
    // loading state, otherwise the page spinner never goes away and they never reach onboarding.
    getMe().then((m) => live && setMe(m)).catch(() => undefined).finally(() => live && setDone(true));
    return () => { live = false; };
  }, []);
  // While loading (or if the profile call fails) don't hide anything — the server still enforces access.
  const can = (perm?: string) => !perm || !me || me.my_permissions.includes(perm);
  return { me, can, loading: !done };
}

/** Which permission each page needs (longest matching prefix wins). */
export const ROUTE_PERMISSION: [string, string][] = [
  ["/dashboard", "analytics"], ["/analytics", "analytics"],
  ["/contacts", "contacts"], ["/segments", "contacts"],
  ["/crm", "crm"],
  ["/campaigns", "email"], ["/email-domains", "email"], ["/email-setup", "email"], ["/mail", "email"],
  ["/sms", "sms"], ["/whatsapp", "whatsapp"],
  ["/workflows", "workflows"], ["/landing-pages", "landing_pages"],
  ["/push", "growth"], ["/social", "growth"], ["/paid-ads", "growth"], ["/affiliate", "growth"],
  ["/influencers", "growth"], ["/events", "growth"], ["/seo", "growth"],
  ["/team", "team"],
];

export function firstAllowedRoute(can: (p?: string) => boolean): string {
  for (const [path, perm] of [["/crm", "crm"], ["/contacts", "contacts"], ["/sms", "sms"], ["/campaigns", "email"], ["/profile", undefined]] as const) {
    if (can(perm)) return path;
  }
  return "/profile";
}
