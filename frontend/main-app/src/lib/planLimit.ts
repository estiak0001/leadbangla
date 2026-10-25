export class PlanLimitError extends Error {
  resource: string;
  current: number;
  limit: number;

  constructor(resource: string, current: number, limit: number) {
    super(
      limit === 0
        ? `Your plan doesn't include ${resource.replace(/_/g, " ")}. Upgrade to use it.`
        : `Plan limit reached for ${resource.replace(/_/g, " ")} (${current}/${limit}). Upgrade to add more.`,
    );
    this.name = "PlanLimitError";
    this.resource = resource;
    this.current = current;
    this.limit = limit;
  }
}

/** Throws PlanLimitError for a 402 plan_limit_reached body, otherwise a
 * generic Error — shared by each module's apiFetch so callers can
 * `instanceof PlanLimitError` to show the upgrade prompt. */
export async function throwForFailedResponse(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 402 && body.error === "plan_limit_reached") {
    throw new PlanLimitError(body.resource, body.current, body.limit);
  }
  throw new Error(body.detail ?? `Request failed: ${res.status}`);
}
