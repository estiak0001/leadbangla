export interface PlatformStatusItem {
  category: string;
  name: string;
  status: "live" | "sandbox" | "disabled";
  note: string | null;
}

export async function fetchPlatformStatus(): Promise<PlatformStatusItem[]> {
  const res = await fetch("/api/v1/platform/status");
  if (!res.ok) {
    throw new Error("Failed to load platform status");
  }
  return res.json();
}
