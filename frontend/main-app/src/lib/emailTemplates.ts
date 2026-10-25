/** Ready-made email templates for common Bangladeshi business patterns
 * (festival offers, flash sales, order updates, due reminders, admissions…).
 *
 * Written as email-safe HTML: table layout + inline styles, 600px wide.
 * Merge tags {{first_name}} {{last_name}} {{email}} {{phone}} are filled per
 * recipient at send time. Everything in the copy is meant to be edited. */

export const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First name" },
  { tag: "{{last_name}}", label: "Last name" },
  { tag: "{{email}}", label: "Email" },
  { tag: "{{phone}}", label: "Phone" },
] as const;

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  accent: string;
  subject: string;
  html: string;
}

const SHOP = "আপনার দোকানের নাম";

function shell(opts: { accent: string; headline: string; sub?: string; body: string; cta?: string; ctaLabel?: string; note?: string }): string {
  const { accent, headline, sub, body, cta = "https://example.com", ctaLabel, note } = opts;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;font-family:'Hind Siliguri','Noto Sans Bengali',Arial,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:${accent};padding:28px 32px;color:#ffffff">
        <div style="font-size:14px;opacity:.9">${SHOP}</div>
        <div style="font-size:28px;font-weight:700;line-height:1.3;margin-top:8px">${headline}</div>${sub ? `
        <div style="font-size:16px;opacity:.95;margin-top:6px">${sub}</div>` : ""}
      </td></tr>
      <tr><td style="padding:28px 32px;color:#0f172a;font-size:16px;line-height:1.7">
        <p style="margin:0 0 14px">প্রিয় {{first_name}},</p>
${body}${ctaLabel ? `
        <p style="margin:24px 0 8px"><a href="${cta}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600">${ctaLabel}</a></p>` : ""}${note ? `
        <p style="margin:16px 0 0;font-size:13px;color:#64748b">${note}</p>` : ""}
      </td></tr>
      <tr><td style="background:#f8fafc;padding:18px 32px;font-size:12px;color:#64748b;line-height:1.6;border-top:1px solid #e2e8f0">
        ${SHOP} · ঠিকানা, ঢাকা · মোবাইল: 01XXX-XXXXXX<br>বিকাশ / নগদ / ক্যাশ অন ডেলিভারি
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const p = (t: string) => `        <p style="margin:0 0 14px">${t}</p>`;

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "festival-offer",
    name: "ঈদ / উৎসব অফার",
    description: "ঈদ, পহেলা বৈশাখ, পূজা বা যেকোনো উৎসবের বিশেষ ছাড়।",
    emoji: "🌙",
    accent: "#0f766e",
    subject: "ঈদ মোবারক! সব পণ্যে ৩০% পর্যন্ত ছাড় 🎁",
    html: shell({
      accent: "#0f766e",
      headline: "ঈদ মোবারক! 🌙",
      sub: "উৎসবের বিশেষ অফার — সীমিত সময়ের জন্য",
      body: p("এই ঈদে আপনার পছন্দের সব পণ্যে পাচ্ছেন <strong>৩০% পর্যন্ত ছাড়</strong>। অফার চলবে <strong>১০ তারিখ পর্যন্ত</strong>।") +
        p("✔ ফ্রি হোম ডেলিভারি (৳১,৫০০ এর উপরে)<br>✔ বিকাশ/নগদে পেমেন্টে অতিরিক্ত ৫% ছাড়<br>✔ ৭ দিনের এক্সচেঞ্জ সুবিধা"),
      ctaLabel: "অফার দেখুন",
      note: "অফারটি শুধুমাত্র নির্দিষ্ট পণ্যের জন্য প্রযোজ্য।",
    }),
  },
  {
    id: "flash-sale",
    name: "ফ্ল্যাশ সেল (১১.১১ / ব্ল্যাক ফ্রাইডে)",
    description: "অল্প সময়ের বড় সেল। জরুরি ভাব তৈরি করে।",
    emoji: "⚡",
    accent: "#dc2626",
    subject: "⚡ ২৪ ঘণ্টার ফ্ল্যাশ সেল — ৫০% পর্যন্ত ছাড়!",
    html: shell({
      accent: "#dc2626",
      headline: "ফ্ল্যাশ সেল ⚡",
      sub: "মাত্র ২৪ ঘণ্টা! স্টক শেষ হলেই অফার শেষ",
      body: p("{{first_name}}, আজ রাত ১২টা পর্যন্ত বাছাই করা পণ্যে <strong>৫০% পর্যন্ত ছাড়</strong>।") +
        p("🔥 সবচেয়ে জনপ্রিয় পণ্যগুলো এখন সবচেয়ে কম দামে।<br>🚚 সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।"),
      ctaLabel: "এখনই কিনুন",
      note: "সীমিত স্টক। আগে এলে আগে পাবেন।",
    }),
  },
  {
    id: "new-arrival",
    name: "নতুন পণ্য এসেছে",
    description: "নতুন কালেকশন বা পণ্য লঞ্চের ঘোষণা।",
    emoji: "🆕",
    accent: "#4f46e5",
    subject: "নতুন কালেকশন এসে গেছে — সবার আগে দেখুন",
    html: shell({
      accent: "#4f46e5",
      headline: "নতুন কালেকশন এসেছে 🆕",
      sub: "আপনার জন্য সদ্য আসা পণ্য",
      body: p("আপনাদের পছন্দের কথা মাথায় রেখে আমরা নিয়ে এসেছি নতুন কালেকশন। প্রতিটি পণ্য যাচাই করা এবং মানসম্মত।") +
        p("এখনই দেখুন, প্রথম ৫০ জন অর্ডারে পাবেন <strong>বিশেষ ছাড়</strong>।"),
      ctaLabel: "কালেকশন দেখুন",
    }),
  },
  {
    id: "order-confirmed",
    name: "অর্ডার কনফার্মেশন",
    description: "অর্ডারের পর ধন্যবাদ ও ডেলিভারির তথ্য। ক্যাশ অন ডেলিভারিতে আস্থা বাড়ায়।",
    emoji: "📦",
    accent: "#16a34a",
    subject: "আপনার অর্ডার কনফার্ম হয়েছে ✔",
    html: shell({
      accent: "#16a34a",
      headline: "অর্ডার কনফার্ম হয়েছে ✔",
      sub: "ধন্যবাদ আমাদের সাথে কেনাকাটা করার জন্য",
      body: p("আপনার অর্ডারটি আমরা পেয়েছি এবং প্রস্তুত করা শুরু করেছি।") +
        `        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;margin:8px 0 14px">
          <tr><td style="padding:14px 16px;font-size:15px;line-height:1.9">
            <strong>অর্ডার নম্বর:</strong> #১২৩৪৫<br>
            <strong>মোট বিল:</strong> ৳২,৫০০<br>
            <strong>পেমেন্ট:</strong> ক্যাশ অন ডেলিভারি<br>
            <strong>ডেলিভারি:</strong> ২–৩ কর্মদিবসের মধ্যে
          </td></tr>
        </table>` + "\n" +
        p("কুরিয়ার আপনাকে কল করবে। কোনো প্রশ্ন থাকলে আমাদের কল করুন: 01XXX-XXXXXX।"),
      ctaLabel: "অর্ডার ট্র্যাক করুন",
    }),
  },
  {
    id: "cart-reminder",
    name: "কার্টে পণ্য রেখে গেছেন",
    description: "যারা কেনা শেষ করেননি তাদের মনে করিয়ে দিন।",
    emoji: "🛒",
    accent: "#ea580c",
    subject: "{{first_name}}, আপনার কার্টে পণ্য অপেক্ষা করছে 🛒",
    html: shell({
      accent: "#ea580c",
      headline: "কেনাকাটা শেষ করেননি? 🛒",
      sub: "আপনার পছন্দের পণ্য কার্টে রাখা আছে",
      body: p("আপনি কার্টে কিছু পণ্য রেখে গিয়েছিলেন। স্টক কম, তাই দেরি না করে অর্ডার সম্পন্ন করুন।") +
        p("এখন অর্ডার করলে পাবেন <strong>ফ্রি ডেলিভারি</strong>।"),
      ctaLabel: "অর্ডার সম্পন্ন করুন",
    }),
  },
  {
    id: "payment-due",
    name: "বাকি / পেমেন্ট রিমাইন্ডার",
    description: "বকেয়া বা ইনভয়েসের ভদ্র অনুস্মারক, বিকাশ/নগদ নম্বরসহ।",
    emoji: "💳",
    accent: "#7c3aed",
    subject: "পেমেন্ট রিমাইন্ডার — ইনভয়েস #১০১",
    html: shell({
      accent: "#7c3aed",
      headline: "পেমেন্ট রিমাইন্ডার 💳",
      sub: "ইনভয়েস #১০১",
      body: p("আপনার <strong>৳৫,০০০</strong> বকেয়া পেমেন্টের শেষ তারিখ <strong>১৫ তারিখ</strong>।") +
        p("পেমেন্ট করুন:<br>📱 বিকাশ / নগদ (পার্সোনাল): <strong>01XXX-XXXXXX</strong><br>🏦 ব্যাংক ট্রান্সফার: অ্যাকাউন্ট নম্বর XXXXXXXX") +
        p("পেমেন্ট করে থাকলে এই ইমেইলটি উপেক্ষা করুন। ধন্যবাদ।"),
      ctaLabel: "পেমেন্ট করুন",
    }),
  },
  {
    id: "welcome",
    name: "স্বাগতম ইমেইল",
    description: "নতুন গ্রাহককে স্বাগত জানান এবং প্রথম অর্ডারে ছাড় দিন।",
    emoji: "👋",
    accent: "#0284c7",
    subject: "স্বাগতম! প্রথম অর্ডারে ১০% ছাড় 🎉",
    html: shell({
      accent: "#0284c7",
      headline: "স্বাগতম! 👋",
      sub: "আমাদের পরিবারে যোগ দেওয়ার জন্য ধন্যবাদ",
      body: p("আমরা খুশি যে আপনি আমাদের সাথে আছেন। নতুন পণ্য, অফার ও টিপস সবার আগে আপনার ইনবক্সে পাঠাব।") +
        p("প্রথম অর্ডারে ব্যবহার করুন কুপন কোড <strong style=\"background:#e0f2fe;padding:2px 8px;border-radius:4px\">WELCOME10</strong> এবং পান <strong>১০% ছাড়</strong>।"),
      ctaLabel: "কেনাকাটা শুরু করুন",
    }),
  },
  {
    id: "admission",
    name: "ভর্তি চলছে / কোর্স",
    description: "কোচিং সেন্টার, স্কুল বা অনলাইন কোর্সের ভর্তি বিজ্ঞপ্তি।",
    emoji: "🎓",
    accent: "#1d4ed8",
    subject: "নতুন ব্যাচে ভর্তি চলছে — সীমিত আসন",
    html: shell({
      accent: "#1d4ed8",
      headline: "ভর্তি চলছে 🎓",
      sub: "নতুন ব্যাচ শুরু হচ্ছে ১ তারিখ থেকে",
      body: p("আপনার সন্তান বা আপনার জন্য অভিজ্ঞ শিক্ষকের তত্ত্বাবধানে নতুন ব্যাচে আসন সীমিত।") +
        p("📚 ক্লাস: সপ্তাহে ৩ দিন<br>🕓 সময়: বিকাল ৪টা – ৬টা<br>💰 কোর্স ফি: ৳৩,০০০ (বিকাশে পেমেন্ট করা যাবে)") +
        p("আজই সিট বুক করুন।"),
      ctaLabel: "ভর্তি হতে চাই",
    }),
  },
  {
    id: "thank-you-review",
    name: "ধন্যবাদ ও রিভিউ চাওয়া",
    description: "কেনার পর রিভিউ ও রেফারেল চেয়ে সম্পর্ক ধরে রাখুন।",
    emoji: "⭐",
    accent: "#ca8a04",
    subject: "আপনার অভিজ্ঞতা কেমন ছিল? ⭐",
    html: shell({
      accent: "#ca8a04",
      headline: "আপনার মতামত জরুরি ⭐",
      sub: "ধন্যবাদ আমাদের কাছ থেকে কেনার জন্য",
      body: p("আপনার সাম্প্রতিক অর্ডারটি কেমন লেগেছে? এক মিনিট সময় নিয়ে আমাদের জানান — এতে আমরা আরও ভালো করতে পারব।") +
        p("বন্ধুকে রেফার করলে আপনি ও আপনার বন্ধু দুজনেই পাবেন <strong>৳১০০ ছাড়</strong>।"),
      ctaLabel: "রিভিউ দিন",
    }),
  },
];

const SAMPLES: Record<string, string> = {
  first_name: "রাহিম",
  last_name: "আহমেদ",
  email: "rahim@example.com",
  phone: "01712-345678",
};

export type PreviewContact = Partial<Record<"first_name" | "last_name" | "email" | "phone", string | null>>;

/** Replace merge tags for the live preview only. With no `contact`, contact
 * tags get made-up sample values; with a real contact, its own values are used
 * and a blank field stays blank. Custom tags
 * always use the org's saved value (blank if undefined). */
export function fillSample(html: string, custom: Record<string, string> = {}, contact?: PreviewContact): string {
  return html.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_m, key: string) => {
    if (contact === undefined) return SAMPLES[key] ?? custom[key] ?? "";
    if (key in SAMPLES) return (contact as Record<string, string | null | undefined>)[key] || "";
    return custom[key] ?? "";
  });
}
