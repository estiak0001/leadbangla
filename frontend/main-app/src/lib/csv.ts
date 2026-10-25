import type { Contact } from "./audience";

/** Reads a CSV the way the server will: Excel encodings, any separator, quoted cells. */
export function decodeCsv(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return new TextDecoder("utf-16").decode(buf);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

export function detectDelimiter(text: string): string {
  const first = text.split("\n", 1)[0];
  const best = [",", ";", "\t", "|"].reduce((a, d) => (first.split(d).length > first.split(a).length ? d : a), ",");
  return first.includes(best) ? best : ",";
}

export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

// Same spellings the server accepts.
const ALIASES: Record<string, string[]> = {
  email: ["email", "e mail", "email address", "mail", "ইমেইল"],
  phone: ["phone", "mobile", "mobile number", "phone number", "cell", "cell number", "contact number", "contact", "whatsapp", "whatsapp number", "মোবাইল", "ফোন", "মোবাইল নম্বর"],
  first_name: ["first name", "firstname", "first", "given name", "নাম"],
  last_name: ["last name", "lastname", "surname", "family name"],
  full_name: ["name", "full name", "customer name", "customer", "contact name"],
  tags: ["tags", "tag", "labels", "label", "group", "groups", "segment"],
  company: ["company", "company name", "shop", "shop name", "business", "business name", "organization", "দোকান", "প্রতিষ্ঠান"],
  district: ["city", "district", "town", "জেলা", "শহর"],
  division: ["division", "বিভাগ"],
  area: ["area", "upazila", "thana", "locality", "এলাকা", "উপজেলা", "থানা"],
  address: ["address", "delivery address", "ঠিকানা"],
  source: ["source", "lead source", "channel", "উৎস"],
  customer_type: ["type", "customer type", "retail wholesale", "retail/wholesale", "category", "শ্রেণি"],
  owner: ["owner", "assigned to", "assignee", "salesperson", "sales person", "sales rep", "account manager", "মালিক"],
  deal_value: ["deal value", "deal", "value", "amount", "expected value", "deal amount"],
  expected_close: ["expected close", "expected close date", "close date", "closing date"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon", "long"],
  map_link: ["map link", "google maps", "google map", "maps link", "location link", "map", "location"],
  facebook_url: ["facebook", "facebook link", "facebook url", "fb", "fb link", "facebook profile"],
  sms_opt_in: ["sms opt in", "sms optin", "sms consent", "sms"],
  whatsapp_opt_in: ["whatsapp opt in", "whatsapp optin", "whatsapp consent"],
};
const norm = (h: string) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ");

export const FIELD_LABEL: Record<string, string> = {
  email: "Email", phone: "Phone", first_name: "First name", last_name: "Last name", full_name: "Full name",
  tags: "Tags", sms_opt_in: "SMS opt-in", whatsapp_opt_in: "WhatsApp opt-in",
  company: "Shop / company", division: "Division", district: "District", area: "Area", address: "Address", source: "Source", customer_type: "Retail / wholesale",
  latitude: "Latitude", longitude: "Longitude", map_link: "Map link", owner: "Owner", deal_value: "Deal value", expected_close: "Expected close", facebook_url: "Facebook link",
};

export interface CsvAnalysis {
  total: number;
  recognised: { field: string; header: string }[];
  ignored: string[];
  hasIdentifier: boolean;
  hasOptIn: boolean;
  preview: string[][];
  header: string[];
}

/** `customFields` = the company's extra field names; a column with the same name fills that field. */
export function analyzeContactsCsv(text: string, customFields: { key: string; label: string }[] = []): CsvAnalysis {
  const rows = parseCsv(text, detectDelimiter(text));
  const header = rows[0] ?? [];
  const recognised: { field: string; header: string }[] = [];
  const ignored: string[] = [];
  header.forEach((h) => {
    const n = norm(h);
    const cf = customFields.find((d) => norm(d.label) === n || norm(d.key) === n);
    const field = cf ? `cf:${cf.key}` : Object.keys(ALIASES).find((f) => ALIASES[f].includes(n));
    if (cf) FIELD_LABEL[field!] = cf.label;
    if (field && !recognised.some((r) => r.field === field)) recognised.push({ field, header: h.trim() });
    else if (n) ignored.push(h.trim());
  });
  const has = (f: string) => recognised.some((r) => r.field === f);
  return {
    total: Math.max(0, rows.length - 1), recognised, ignored, header,
    hasIdentifier: has("email") || has("phone"), hasOptIn: has("sms_opt_in") || has("whatsapp_opt_in"),
    preview: rows.slice(1, 6),
  };
}

const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(rows: string[][]): string { return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n"; }

export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const TEMPLATE_COLUMNS: { column: string; required: string; example: string; note: string }[] = [
  { column: "email", required: "Email or phone", example: "rahim@example.com", note: "Lower or upper case is fine." },
  { column: "phone", required: "Email or phone", example: "01712345678", note: "01…, +8801… or 8801… all work. Must be a Bangladeshi mobile number." },
  { column: "first_name", required: "Optional", example: "Rahim", note: "Bangla names are fine. A single “name” column also works." },
  { column: "last_name", required: "Optional", example: "Uddin", note: "" },
  { column: "tags", required: "Optional", example: "vip;dhaka", note: "Separate several tags with ; or ," },
  { column: "company", required: "Optional", example: "Rahim Fashion", note: "Shop or company name." },
  { column: "division", required: "Optional", example: "Dhaka", note: "One of the 8 divisions (filled in from the district if you leave it out)." },
  { column: "district", required: "Optional", example: "Dhaka", note: "Any of the 64 districts, English or বাংলা. “city” also works." },
  { column: "area", required: "Optional", example: "Gulshan", note: "Thana / upazila / locality from your Locations list." },
  { column: "type", required: "Optional", example: "retail", note: "retail or wholesale." },
  { column: "source", required: "Optional", example: "facebook", note: "facebook, whatsapp, website, referral, walk_in, event…" },
  { column: "owner", required: "Optional", example: "sales1@yourshop.com", note: "The teammate’s login email. Leave blank to assign automatically." },
  { column: "address", required: "Optional", example: "House 5, Road 3, Dhanmondi", note: "Delivery address or notes." },
  { column: "map_link", required: "Optional", example: "https://www.google.com/maps/@23.78,90.41,15z", note: "A full Google Maps link, or “23.78, 90.41”. Or use separate latitude and longitude columns." },
  { column: "deal_value", required: "Optional", example: "12000", note: "In taka. ৳ and commas are fine." },
  { column: "expected_close", required: "Optional", example: "30/11/2026", note: "2026-11-30 or 30/11/2026." },
  { column: "sms_opt_in", required: "Optional", example: "yes", note: "Write yes only if this person agreed to get SMS from you." },
  { column: "whatsapp_opt_in", required: "Optional", example: "no", note: "Same for WhatsApp." },
];

export function downloadContactsTemplate(customFields: { label: string; options?: string[] }[] = []) {
  const extra = customFields.map((d) => d.label);
  const sample = (i: number) => customFields.map((d) => (d.options?.length ? d.options[i % d.options.length] : "")); 
  downloadFile("contacts-sample.csv", toCsv([
    ["email", "phone", "first_name", "last_name", "company", "division", "district", "area", "type", "source", "owner", "tags", "sms_opt_in", "whatsapp_opt_in", ...extra],
    ["rahim@example.com", "01712345678", "Rahim", "Uddin", "Rahim Fashion", "Dhaka", "Dhaka", "Gulshan", "retail", "facebook", "", "vip;dhaka", "yes", "no", ...sample(0)],
    ["", "01812345678", "ফাতেমা", "বেগম", "Fatema Boutique", "Chattogram", "Chattogram", "Agrabad", "retail", "website", "", "newsletter", "yes", "yes", ...sample(1)],
    ["karim@example.com", "", "Karim", "Ahmed", "Karim Traders", "Sylhet", "Sylhet", "Zindabazar", "wholesale", "referral", "", "", "no", "no", ...sample(2)],
  ]));
}

export function exportContacts(contacts: Contact[], name = "contacts.csv") {
  downloadFile(name, toCsv([
    ["email", "phone", "first_name", "last_name", "company", "division", "district", "area", "source", "tags", "sms_opt_in", "whatsapp_opt_in"],
    ...contacts.map((c) => [c.email ?? "", c.phone ?? "", c.first_name ?? "", c.last_name ?? "", c.company ?? "", c.division ?? "", c.district ?? c.city ?? "", c.area ?? "", c.source ?? "", c.tags.join(";"), c.sms_opt_in ? "yes" : "no", c.whatsapp_opt_in ? "yes" : "no"]),
  ]));
}
