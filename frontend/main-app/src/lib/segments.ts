import { getAccessToken } from "./auth";
import type { SegmentRule } from "./audience";

export interface FieldOption { value: string; label: string; }
export interface FieldDef {
  key: string; label: string; group: string; type: string; subtype?: string; operators: string[]; options?: (string | FieldOption)[] | null;
}
export interface SegmentMeta { fields: FieldDef[]; operators: Record<string, string>; }

export async function fetchSegmentMeta(): Promise<SegmentMeta> {
  const res = await fetch("/api/v1/segments/meta", { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw new Error("Could not load the segment fields");
  return res.json();
}

export const optValue = (o: string | FieldOption) => (typeof o === "string" ? o : o.value);
export const optLabel = (o: string | FieldOption) => (typeof o === "string" ? o : o.label);

/** What input a rule needs for its operator. */
export function inputKind(op: string, f: FieldDef): "none" | "text" | "number" | "days" | "date" | "date2" | "number2" | "list" | "pick" | "tags" {
  if (["is_set", "is_not_set", "is_true", "is_false", "never"].includes(op)) return "none";
  if (["in_last_days", "not_in_last_days", "in_next_days"].includes(op)) return "days";
  if (op === "between") return f.type === "date" || f.type === "future" ? "date2" : "number2";
  if (op === "before" || op === "after") return "date";
  if (op === "in" || op === "has_any" || op === "has_all") return "list";
  if (f.type === "tags") return "tags";
  if (f.type === "number" || (f.type === "custom" && ["gt", "gte", "lt", "lte"].includes(op))) return "number";
  if (f.type === "select" && f.options?.length && (op === "equals" || op === "not_equals")) return "pick";
  return "text";
}

export const blankRule = (): SegmentRule => ({ field: "tag", operator: "contains", value: "", value2: null, values: null });

/** A rule is ready to save/preview when it has everything its operator needs. */
export function ruleComplete(r: SegmentRule, meta: SegmentMeta | null): boolean {
  const f = meta?.fields.find((x) => x.key === r.field);
  if (!f) return false;
  const k = inputKind(r.operator, f);
  if (k === "none") return true;
  if (k === "list") return !!r.values?.length;
  if (k === "number2" || k === "date2") return !!(r.value ?? "").trim() && !!(r.value2 ?? "").trim();
  return !!(r.value ?? "").trim();
}

/** "District is any of Dhaka, Sylhet" for chips on the list page. */
export function describeRule(r: SegmentRule, meta: SegmentMeta | null): string {
  const f = meta?.fields.find((x) => x.key === r.field);
  const label = f?.label ?? r.field;
  const op = (meta?.operators[r.operator] ?? r.operator.replace(/_/g, " "));
  const lookup = (v: string) => f?.options?.map((o) => (typeof o === "string" ? { value: o, label: o } : o)).find((o) => o.value === v)?.label ?? v;
  const pretty = f?.type === "bool" ? "" : r.values?.length ? r.values.map(lookup).join(", ")
    : r.operator === "between" ? `${r.value} and ${r.value2}`
    : r.operator.endsWith("_days") ? `${r.value} days` : r.value ? lookup(r.value) : "";
  const text = f?.type === "bool" ? `${label} ${op}` : `${label} ${op} ${pretty}`.trim();
  return text.replace("in the last … days", "in the last").replace("not in the last … days", "not in the last").replace("in the next … days", "in the next");
}

/** One line for a history entry: what changed in a segment. */
export function describeChange(field: string, v: { old: unknown; new: unknown }, meta: SegmentMeta | null): string {
  const rulesText = (x: unknown) => (Array.isArray(x) && x.length ? (x as SegmentRule[]).map((r) => describeRule(r, meta)).join("; ") : "none");
  switch (field) {
    case "name": return `Name: “${v.old ?? ""}” → “${v.new ?? ""}”`;
    case "description": return `Note: ${v.old ? `“${v.old}”` : "none"} → ${v.new ? `“${v.new}”` : "none"}`;
    case "match_type": return `Match: ${v.old === "any" ? "any rule" : "all rules"} → ${v.new === "any" ? "any rule" : "all rules"}`;
    case "rules": return `Rules: ${rulesText(v.old)} → ${rulesText(v.new)}`;
    case "copied_from": return `Copied from “${v.new}”`;
    default: return field;
  }
}

export interface Suggestion { value: string; label: string; count: number; }
export interface SuggestionSet { values: Suggestion[]; hint: string | null; }

export async function fetchSuggestions(field: string): Promise<SuggestionSet> {
  const res = await fetch(`/api/v1/segments/suggestions?field=${encodeURIComponent(field)}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) return { values: [], hint: null };
  return res.json();
}

/** The field's pick-list with "how many people" next to each choice, most common first. */
export function optionsWithCounts(f: FieldDef, sug?: SuggestionSet): FieldOption[] | null {
  if (!f.options?.length) return null;
  const counts = new Map((sug?.values ?? []).map((v) => [v.value, v.count]));
  return f.options
    .map((o) => ({ value: optValue(o), label: optLabel(o) }))
    .map((o) => ({ ...o, n: counts.get(o.value) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((o) => ({ value: o.value, label: o.n ? `${o.label} · ${o.n}` : o.label }));
}

export const GROUP_INFO: Record<string, { blurb: string; dot: string; tint: string }> = {
  Person: { blurb: "Who they are — name, mobile, email, shop, tags", dot: "bg-brand-500", tint: "bg-brand-50 text-brand-700" },
  Place: { blurb: "Where they are — division, district, area, map pin", dot: "bg-success-base", tint: "bg-success-light text-success-dark" },
  Business: { blurb: "How they buy — type, source, owner, deals, dues", dot: "bg-warning-base", tint: "bg-warning-light text-warning-dark" },
  Consent: { blurb: "Who agreed to be messaged", dot: "bg-info-dark", tint: "bg-info-light text-info-dark" },
  Activity: { blurb: "What they did — added, contacted, opened emails", dot: "bg-danger-base", tint: "bg-danger-light text-danger-dark" },
  "Your extra fields": { blurb: "The fields you added yourself", dot: "bg-surface-500", tint: "bg-surface-100 text-surface-700" },
};
