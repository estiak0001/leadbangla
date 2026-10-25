import { getAccessToken } from "./auth";
import type { SmsChannel } from "./sms";

/** Per-channel presentation + rules, shared by the SMS and WhatsApp screens. */
export const CHANNELS: Record<SmsChannel, {
  label: string;
  path: string;
  maxChars: number;
  tone: string;      // text + bg classes for the channel chip
  accent: string;    // solid accent (bars, dots)
  creditService: "sms" | "whatsapp";
}> = {
  sms: { label: "SMS", path: "/sms", maxChars: 1600, tone: "text-sky-700 bg-sky-50", accent: "bg-sky-500", creditService: "sms" },
  whatsapp: { label: "WhatsApp", path: "/whatsapp", maxChars: 1600, tone: "text-emerald-700 bg-emerald-50", accent: "bg-emerald-500", creditService: "whatsapp" },
};

/** SMS length maths. Anything outside plain ASCII (Bangla!) is sent as Unicode,
 * which fits only 70 characters per message (67 when it spans several parts). */
export function smsParts(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const length = [...text].length;
  const parts = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { unicode, length, parts, perPart: parts > 1 ? multi : single };
}

// ── Saved templates API ──────────────────────────────────────────────────────

export interface MessageTemplate {
  id: string;
  channel: SmsChannel;
  name: string;
  body: string;
  approved: boolean;
  updated_at: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/message-templates${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const fetchMessageTemplates = (channel: SmsChannel) => call<MessageTemplate[]>(`?channel=${channel}`);
export const createMessageTemplate = (data: { channel: SmsChannel; name: string; body: string; approved?: boolean }) =>
  call<MessageTemplate>("", { method: "POST", body: JSON.stringify(data) });
export const updateMessageTemplate = (id: string, data: { name?: string; body?: string; approved?: boolean }) =>
  call<MessageTemplate>(`/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMessageTemplate = (id: string) => call<void>(`/${id}`, { method: "DELETE" });

// ── Starter ideas for common Bangladeshi business messages ───────────────────

export interface StarterTemplate { id: string; emoji: string; name: string; body: string }

export const STARTER_TEMPLATES: Record<SmsChannel, StarterTemplate[]> = {
  sms: [
    { id: "eid", emoji: "🌙", name: "ঈদ অফার", body: "ঈদ মোবারক {{first_name}}! সব পণ্যে ৩০% ছাড়। অফার ১০ তারিখ পর্যন্ত। আপনার দোকানের নাম" },
    { id: "flash", emoji: "⚡", name: "ফ্ল্যাশ সেল", body: "{{first_name}}, আজ রাত ১২টা পর্যন্ত ৫০% ছাড়! স্টক সীমিত। এখনই অর্ডার করুন: 01XXXXXXXXX" },
    { id: "order", emoji: "📦", name: "অর্ডার কনফার্ম", body: "ধন্যবাদ {{first_name}}! আপনার অর্ডার কনফার্ম হয়েছে। ২-৩ দিনে ডেলিভারি পাবেন।" },
    { id: "delivery", emoji: "🚚", name: "ডেলিভারি আপডেট", body: "{{first_name}}, আপনার পার্সেল আজ ডেলিভারি হবে। কুরিয়ার কল করলে রিসিভ করুন।" },
    { id: "due", emoji: "💳", name: "বাকি / পেমেন্ট রিমাইন্ডার", body: "{{first_name}}, আপনার ৳৫,০০০ বকেয়া ১৫ তারিখের মধ্যে বিকাশ করুন: 01XXXXXXXXX (পার্সোনাল)।" },
    { id: "admission", emoji: "🎓", name: "ভর্তি চলছে", body: "নতুন ব্যাচে ভর্তি চলছে। সিট সীমিত! বিস্তারিত: 01XXXXXXXXX" },
  ],
  whatsapp: [
    { id: "eid", emoji: "🌙", name: "ঈদ অফার", body: "ঈদ মোবারক {{first_name}}! 🌙\n\nউৎসব উপলক্ষে সব পণ্যে ৩০% পর্যন্ত ছাড়।\n✔ ফ্রি ডেলিভারি (৳১,৫০০+)\n✔ বিকাশ/নগদে অতিরিক্ত ৫% ছাড়\n\nঅফার ১০ তারিখ পর্যন্ত। অর্ডার করতে রিপ্লাই দিন।" },
    { id: "flash", emoji: "⚡", name: "ফ্ল্যাশ সেল", body: "⚡ ফ্ল্যাশ সেল! {{first_name}}\n\nমাত্র ২৪ ঘণ্টা — ৫০% পর্যন্ত ছাড়। স্টক শেষ হলেই অফার শেষ।\n\nঅর্ডার করতে এখনই রিপ্লাই দিন।" },
    { id: "order", emoji: "📦", name: "অর্ডার কনফার্ম", body: "ধন্যবাদ {{first_name}}! ✅\n\nআপনার অর্ডার কনফার্ম হয়েছে।\nপেমেন্ট: ক্যাশ অন ডেলিভারি\nডেলিভারি: ২–৩ কর্মদিবস\n\nকোনো প্রশ্ন থাকলে এখানেই জানান।" },
    { id: "cart", emoji: "🛒", name: "কার্টে পণ্য রেখে গেছেন", body: "{{first_name}}, আপনার পছন্দের পণ্য এখনো কার্টে আছে 🛒\n\nস্টক কম। আজ অর্ডার করলে ফ্রি ডেলিভারি পাবেন। রিপ্লাই দিন, আমরা অর্ডার করে দিচ্ছি।" },
    { id: "due", emoji: "💳", name: "পেমেন্ট রিমাইন্ডার", body: "প্রিয় {{first_name}},\n\nআপনার ৳৫,০০০ বকেয়ার শেষ তারিখ ১৫ তারিখ।\nবিকাশ/নগদ (পার্সোনাল): 01XXXXXXXXX\n\nপেমেন্ট করে থাকলে স্ক্রিনশট পাঠান। ধন্যবাদ।" },
    { id: "review", emoji: "⭐", name: "রিভিউ চাওয়া", body: "{{first_name}}, আমাদের থেকে কিনে কেমন লেগেছে? ⭐\n\nএক লাইনে আপনার মতামত জানান — এতে আমরা আরও ভালো করতে পারব। ধন্যবাদ!" },
  ],
};
