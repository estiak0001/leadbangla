import { useEffect, useState } from "react";

export type FeatureMap = Record<string, boolean>;

let cache: { at: number; promise: Promise<FeatureMap> } | null = null;
export function loadFeatures(): Promise<FeatureMap> {
  if (!cache || Date.now() - cache.at > 60000) {
    const promise = fetch("/api/v1/public/features").then((r) => (r.ok ? (r.json() as Promise<FeatureMap>) : {}));
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
    cache = { at: Date.now(), promise };
  }
  return cache.promise;
}

/** Which platform services are switched on. A service that isn't listed is treated as on. */
export function useFeatures() {
  const [features, setFeatures] = useState<FeatureMap>({});
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; loadFeatures().then((f) => live && setFeatures(f)).catch(() => undefined).finally(() => live && setReady(true)); return () => { live = false; }; }, []);
  return { features, ready, on: (code: string) => features[code] !== false };
}

/** Which service each menu page belongs to. */
export const PATH_FEATURE: Record<string, string> = {
  "/whatsapp": "whatsapp", "/sms": "sms", "/push": "push", "/social": "social", "/paid-ads": "paid_ads", "/seo": "seo",
};
