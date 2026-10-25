import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users, Mail, MessageSquare, CreditCard, Workflow, BarChart3, Check, ArrowRight,
  ShieldCheck, Smartphone, Menu, X,
} from "lucide-react";
import Button from "../../components/Button";
import { fetchPlans, type Plan } from "../../lib/billing";

const toBn = (n: number | string) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
const INTERVAL_BN: Record<string, string> = { monthly: "মাস", month: "মাস", yearly: "বছর", year: "বছর" };

const NAV = [
  { href: "#features", label: "ফিচার" },
  { href: "#how", label: "কীভাবে কাজ করে" },
  { href: "#pricing", label: "প্রাইসিং" },
  { href: "#faq", label: "সচরাচর প্রশ্ন" },
];

const STATS = [
  { value: "৫০,০০০+", label: "প্রতিদিন পাঠানো মেসেজ" },
  { value: "৯৮%", label: "SMS ডেলিভারি রেট" },
  { value: "৫ মিনিট", label: "সেটআপ করতে সময়" },
  { value: "১০০%", label: "বাংলা ও BDT সাপোর্ট" },
];

const FEATURES = [
  { icon: Users, title: "কাস্টমার তালিকা ও সেগমেন্ট", desc: "এক্সেল/CSV থেকে কন্টাক্ট ইমপোর্ট করুন, ট্যাগ দিন এবং এলাকা বা কেনাকাটার ভিত্তিতে অডিয়েন্স ভাগ করুন।", color: "bg-indigo-50 text-indigo-600" },
  { icon: Mail, title: "ইমেইল মার্কেটিং", desc: "সুন্দর ইমেইল ক্যাম্পেইন পাঠান এবং কে খুলল, কে ক্লিক করল তা লাইভ দেখুন।", color: "bg-sky-50 text-sky-600" },
  { icon: MessageSquare, title: "SMS ও WhatsApp", desc: "বাংলায় মাস্কিং SMS ও WhatsApp মেসেজ পাঠান। BTRC নীতিমালা মেনে, সরাসরি গ্রাহকের ফোনে।", color: "bg-emerald-50 text-emerald-600" },
  { icon: Workflow, title: "অটোমেশন", desc: "নতুন কাস্টমারকে স্বাগত, কার্ট ফেলে গেলে রিমাইন্ডার — একবার সেট করুন, বাকিটা অটো চলবে।", color: "bg-violet-50 text-violet-600" },
  { icon: BarChart3, title: "রিপোর্ট ও অ্যানালিটিক্স", desc: "কোন ক্যাম্পেইনে কত বিক্রি হলো তা এক ড্যাশবোর্ডেই বুঝে নিন।", color: "bg-amber-50 text-amber-600" },
  { icon: CreditCard, title: "বিকাশ, নগদ, রকেট পেমেন্ট", desc: "টাকায় বিল দিন লোকাল পেমেন্টে। ডলার কার্ড বা বিদেশি ঝামেলা নেই।", color: "bg-rose-50 text-rose-600" },
];

const STEPS = [
  { n: "১", title: "অ্যাকাউন্ট খুলুন", desc: "ইমেইল দিয়ে ১ মিনিটে সাইন আপ করুন।" },
  { n: "২", title: "কাস্টমার যোগ করুন", desc: "CSV ইমপোর্ট করুন অথবা হাতে যোগ করুন।" },
  { n: "৩", title: "ক্যাম্পেইন পাঠান", desc: "ইমেইল, SMS বা WhatsApp বেছে নিয়ে সেন্ড করুন।" },
  { n: "৪", title: "ফলাফল দেখুন", desc: "বিক্রি ও এনগেজমেন্ট রিপোর্টে দেখুন।" },
];

const lim = (n: number | undefined, unit: string) =>
  n === undefined ? null : n < 0 ? `সীমাহীন ${unit}` : `${toBn(n.toLocaleString("en-US"))}টি ${unit}`;

function planPoints(p: Plan): string[] {
  return [
    lim(p.contacts_limit, "কন্টাক্ট"),
    p.emails_monthly_limit === undefined ? null : `মাসে ${p.emails_monthly_limit < 0 ? "সীমাহীন" : toBn(p.emails_monthly_limit.toLocaleString("en-US"))}টি ইমেইল`,
    p.sms_enabled === false ? null : p.sms_monthly_limit === undefined ? null : p.sms_monthly_limit < 0 ? "সীমাহীন SMS (ওয়ালেট ক্রেডিট থেকে)" : `মাসে ${toBn(p.sms_monthly_limit.toLocaleString("en-US"))}টি SMS`,
    p.masking_allowed ? "নিজের ব্র্যান্ড নামে SMS (মাস্কিং Sender ID)" : null,
    p.whatsapp_enabled ? "WhatsApp ক্যাম্পেইন" : null,
    lim(p.workflows_limit, "অটোমেশন"),
    lim(p.landing_pages_limit, "ল্যান্ডিং পেজ"),
    lim(p.team_members_limit, "টিম মেম্বার"),
    p.custom_domain ? "নিজের ডোমেইন ব্যবহার" : null,
    p.priority_support ? "প্রাধান্য পাওয়া সাপোর্ট" : "বাংলা সাপোর্ট",
  ].filter((x): x is string => !!x);
}

const FAQ = [
  { q: "আমি কি বাংলায় মেসেজ পাঠাতে পারব?", a: "হ্যাঁ। ইমেইল ও SMS দুটোতেই পূর্ণ বাংলা (ইউনিকোড) সাপোর্ট আছে এবং পুরো ড্যাশবোর্ড ব্যবহার করা সহজ।" },
  { q: "পেমেন্ট কীভাবে করব?", a: "বিকাশ, নগদ, রকেট এবং কার্ড — সব পেমেন্ট বাংলাদেশি টাকায় (BDT) করা যায়।" },
  { q: "যেকোনো সময় বাতিল করা যাবে?", a: "অবশ্যই। কোনো লক-ইন নেই, যখন ইচ্ছা প্ল্যান বাতিল বা পরিবর্তন করতে পারবেন।" },
  { q: "SMS কি BTRC নিয়ম মেনে পাঠানো হয়?", a: "হ্যাঁ, মেসেজ পাঠানো হয় BTRC-র নীতিমালা মেনে, যাতে আপনার ব্যবসা নিরাপদ থাকে।" },
];

/** Bangladesh in dots: the map and historical landmarks drawn as faint dot-matrix art. */
type Art = { name: "bd-map" | "shaheed-minar" | "sangsad" | "sixty-dome" | "ahsan-manzil" | "nouka" | "shapla"; className: string; light?: boolean };

function DotArt({ name, className, light }: Art) {
  return (
    <img src={`/img/dots/${name}.svg`} alt="" aria-hidden loading="lazy"
      className={`pointer-events-none absolute select-none ${light ? "[filter:brightness(0)_invert(1)]" : ""} ${className}`} />
  );
}

/** A full-width band with dot art behind its content. */
function Decor({ arts, className = "", children }: { arts: Art[]; className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {arts.map((a) => <DotArt key={a.name + a.className} {...a} />)}
      <div className="relative">{children}</div>
    </div>
  );
}

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetchPlans().then(setPlans).catch(() => undefined); }, []);

  return (
    <div className="min-h-screen bg-white text-surface-800">
      {/* Top announcement */}
      <div className="bg-brand-900 px-4 py-2 text-center text-sm text-white">
        🇧🇩 বাংলাদেশের ব্যবসার জন্য তৈরি — বিকাশ/নগদ-এ পেমেন্ট, বাংলায় সাপোর্ট
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-surface-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="LeadBangla">
            <img src="/logo.png" alt="LeadBangla" className="h-7 w-auto sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-surface-600 md:flex">
            {NAV.map((n) => <a key={n.href} href={n.href} className="hover:text-brand-600">{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden px-3 py-2 text-sm font-medium text-surface-600 hover:text-surface-900 sm:inline">লগইন</Link>
            <Link to="/signup"><Button size="sm">বিনামূল্যে শুরু করুন</Button></Link>
            <button className="rounded p-2 text-surface-600 md:hidden" onClick={() => setOpen(!open)} aria-label="মেনু">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-surface-200 bg-white px-4 py-3 md:hidden">
            {[...NAV, { href: "/login", label: "লগইন" }].map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-2 text-sm font-medium text-surface-700">{n.label}</a>
            ))}
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "url(/img/pattern.svg)" }} aria-hidden />
        <DotArt name="bd-map" className="-right-6 top-1/2 h-[125%] -translate-y-1/2 opacity-[0.16] lg:right-[2%]" />
        <DotArt name="shapla" className="bottom-3 left-[2%] hidden w-44 opacity-[0.14] md:block" />
        <DotArt name="shaheed-minar" className="-left-10 top-4 hidden w-56 opacity-[0.07] xl:block" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> দেশি ব্যবসার স্মার্ট মার্কেটিং সঙ্গী
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.25] text-surface-900 sm:text-5xl">
              আপনার ব্যবসার মার্কেটিং<br />
              <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">হোক সহজ ও বাংলায়</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-surface-600">
              ইমেইল, SMS ও WhatsApp — সব এক জায়গায়। কাস্টমারদের কাছে পৌঁছান, বিক্রি বাড়ান।
              বিকাশ ও নগদে পেমেন্ট, দাম টাকায়।
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup"><Button size="lg" icon={<ArrowRight size={18} />}>ফ্রিতে শুরু করুন</Button></Link>
              <a href="#pricing"><Button variant="secondary" size="lg">প্ল্যান দেখুন</Button></a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-surface-600">
              {["ক্রেডিট কার্ড লাগবে না", "যেকোনো সময় বাতিল", "বাংলা সাপোর্ট"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Check size={16} className="text-emerald-600" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <img src="/img/hero.svg" alt="LeadBangla ড্যাশবোর্ড, SMS এবং বিকাশ পেমেন্টের চিত্র" className="mx-auto w-full max-w-xl drop-shadow-xl" />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto -mt-2 max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-surface-200 bg-white p-6 shadow-lg md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-extrabold text-brand-700 sm:text-3xl">{s.value}</div>
              <div className="mt-1 text-sm text-surface-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Payment strip */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <p className="text-center text-sm font-medium text-surface-500">পেমেন্ট করুন আপনার পছন্দের মাধ্যমে</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {[
            { n: "bKash", c: "bg-[#e2136e]" }, { n: "Nagad", c: "bg-[#f6921e]" },
            { n: "Rocket", c: "bg-[#8c3494]" }, { n: "Visa / Mastercard", c: "bg-surface-800" },
          ].map((p) => (
            <span key={p.n} className={`${p.c} rounded-full px-5 py-2 text-sm font-bold text-white shadow-sm`}>{p.n}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <Decor className="" arts={[{ name: "shaheed-minar", className: "-left-8 bottom-0 hidden w-72 opacity-[0.08] lg:block" }, { name: "shapla", className: "right-[3%] top-8 hidden w-40 opacity-[0.09] md:block" }]}>
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-surface-900 sm:text-4xl">বিক্রি বাড়াতে যা যা দরকার</h2>
          <p className="mt-3 text-surface-500">আলাদা আলাদা টুল ছেড়ে এক প্ল্যাটফর্মেই পুরো মার্কেটিং চালান।</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-xl border border-surface-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-card-hover">
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${f.color}`}><f.icon size={24} /></div>
              <h3 className="text-lg font-semibold text-surface-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-surface-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      </Decor>

      {/* Banner CTA */}
      <section className="mx-auto max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-2xl">
          <img src="/img/boishakh.jpg" alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-900/95 via-brand-700/85 to-violet-700/60" aria-hidden />
          <div className="relative grid items-center gap-6 px-6 py-12 text-white sm:px-12 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-3xl font-bold leading-snug sm:text-4xl">ঈদ, পহেলা বৈশাখ, ১১.১১ —<br />প্রতিটি সেল সিজনে সবার আগে পৌঁছান</h2>
              <p className="mt-3 max-w-lg text-brand-100">এক ক্লিকে হাজারো কাস্টমারের ফোনে অফার পাঠান।</p>
            </div>
            <div className="flex md:justify-end">
              <Link to="/signup"><Button variant="secondary" size="lg" icon={<Smartphone size={18} />}>ক্যাম্পেইন শুরু করুন</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Local business */}
      <Decor className="" arts={[{ name: "nouka", className: "-right-6 bottom-0 hidden w-80 opacity-[0.10] md:block" }, { name: "bd-map", className: "-left-10 top-0 hidden h-[110%] opacity-[0.07] lg:block" }]}>
      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <img src="/img/market.jpg" alt="বাজারে সবজি বিক্রেতা" loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover shadow-xl" />
          <div>
            <span className="text-sm font-semibold text-brand-600">ছোট দোকান থেকে বড় ব্র্যান্ড</span>
            <h2 className="mt-2 text-3xl font-bold leading-snug text-surface-900 sm:text-4xl">আপনার কাস্টমার ফোনেই আছে — সেখানেই পৌঁছান</h2>
            <p className="mt-4 leading-relaxed text-surface-600">
              বাজারের দোকান হোক বা ফেসবুক পেজ — নিয়মিত ক্রেতাদের নতুন পণ্য, অফার ও রিমাইন্ডার পাঠান।
              একবার মেসেজ সাজান, বাকিটা LeadBangla করে দেবে।
            </p>
            <ul className="mt-5 space-y-2 text-surface-700">
              {["পুরনো ক্রেতাকে আবার কেনাকাটায় ফেরান", "নতুন পণ্যের খবর এক ক্লিকে পাঠান", "বাকির রিমাইন্ডার ও অর্ডার আপডেট দিন"].map((t) => (
                <li key={t} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      </Decor>

      {/* How it works */}
      <Decor className="" arts={[{ name: "sangsad", className: "-right-10 top-4 hidden w-80 opacity-[0.09] lg:block" }, { name: "sixty-dome", className: "-left-10 bottom-0 hidden w-72 opacity-[0.07] xl:block" }]}>
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-surface-900 sm:text-4xl">মাত্র ৪ ধাপে শুরু</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="relative rounded-xl bg-surface-50 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-lg font-bold text-white">{s.n}</div>
              <h3 className="mt-4 font-semibold text-surface-900">{s.title}</h3>
              <p className="mt-1 text-sm text-surface-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
      </Decor>

      {/* Pricing */}
      <section id="pricing" className="relative scroll-mt-20 overflow-hidden border-t border-surface-200 bg-surface-50 px-4 py-20">
        <DotArt name="bd-map" className="-right-8 top-4 hidden h-[90%] opacity-[0.10] lg:block" />
        <DotArt name="sixty-dome" className="-left-10 bottom-0 hidden w-80 opacity-[0.10] md:block" />
        <DotArt name="nouka" className="left-[38%] bottom-1 hidden w-56 opacity-[0.07] xl:block" />
        <div className="relative mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-surface-900 sm:text-4xl">আপনার ব্যবসার জন্য সঠিক প্ল্যান</h2>
          <p className="mt-3 text-center text-surface-500">সহজ দাম, টাকায়। কোনো লুকানো চার্জ নেই।</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, i) => {
              const featured = plans.length >= 3 ? i === 1 : false;
              return (
                <div key={plan.id} className={`relative flex flex-col rounded-2xl bg-white p-7 ${featured ? "border-2 border-brand-500 shadow-xl lg:-translate-y-3" : "border border-surface-200 shadow-sm"}`}>
                  {featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">সবচেয়ে জনপ্রিয়</span>}
                  <h3 className="text-lg font-bold text-surface-900">{plan.name}</h3>
                  <div className="mt-3">
                    <span className="text-4xl font-extrabold text-surface-900">৳{toBn(plan.price_bdt)}</span>
                    <span className="ml-1 text-sm text-surface-500">/ {INTERVAL_BN[plan.billing_interval] ?? plan.billing_interval}</span>
                  </div>
                  <ul className="my-6 flex-1 space-y-2.5 text-sm text-surface-600">
                    {planPoints(plan).map((p) => <li key={p} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />{p}</li>)}
                  </ul>
                  <Link to={`/signup?plan=${plan.id}`}>
                    <Button variant={featured ? "primary" : "secondary"} className="w-full">{plan.name} নিন</Button>
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-surface-500">
            <ShieldCheck size={16} className="text-emerald-600" /> নিরাপদ পেমেন্ট · যেকোনো সময় বাতিলযোগ্য
          </p>
        </div>
      </section>

      {/* FAQ */}
      <Decor className="" arts={[{ name: "ahsan-manzil", className: "-right-6 bottom-2 hidden w-72 opacity-[0.09] lg:block" }, { name: "shapla", className: "-left-4 top-10 hidden w-36 opacity-[0.08] lg:block" }]}>
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-surface-900 sm:text-4xl">সচরাচর জিজ্ঞাসা</h2>
        <div className="mt-10 divide-y divide-surface-200 rounded-xl border border-surface-200 bg-white">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-surface-900">
                {f.q}<span className="ml-4 text-brand-600 transition group-open:rotate-45 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-surface-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      </Decor>

      {/* Final CTA */}
      <section className="px-4 pb-20">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl px-6 py-14 text-center text-white">
          <img src="/img/dhaka.jpg" alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-700/90 to-violet-800/90" aria-hidden />
          <DotArt name="bd-map" light className="-right-6 top-1/2 h-[170%] -translate-y-1/2 opacity-[0.16]" />
          <DotArt name="shapla" light className="bottom-2 left-3 hidden w-32 opacity-[0.14] sm:block" />
          <div className="relative">
          <h2 className="text-3xl font-bold">আজই আপনার প্রথম ক্যাম্পেইন পাঠান</h2>
          <p className="mt-2 text-brand-100">সাইন আপ করতে ৫ মিনিটও লাগবে না।</p>
          <Link to="/signup" className="mt-6 inline-block"><Button variant="secondary" size="lg">বিনামূল্যে শুরু করুন</Button></Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-surface-200 bg-surface-900 py-10 text-center text-sm text-surface-400">
        <DotArt name="bd-map" light className="-left-6 top-1/2 h-[190%] -translate-y-1/2 opacity-[0.07]" />
        <DotArt name="shaheed-minar" light className="-right-4 bottom-0 hidden w-60 opacity-[0.07] md:block" />
        <DotArt name="nouka" light className="right-[28%] bottom-0 hidden w-44 opacity-[0.06] lg:block" />
        <img src="/logo-white.png" alt="LeadBangla" className="relative mx-auto h-8 w-auto" />
        <p className="relative mt-1">আপনার ব্যবসার পাশে, আপনার ভাষায় 🇧🇩</p>
        <p className="relative mx-auto mt-4 max-w-2xl px-4 text-xs text-surface-500">
          ছবি: Wikimedia Commons — <a className="underline" href="https://commons.wikimedia.org/wiki/File:Shopkeeper_in_BD.jpg">Masum-al-hasan</a> (CC BY-SA 3.0),{" "}
          <a className="underline" href="https://commons.wikimedia.org/wiki/File:Pohela_Boishakh_Celebration_at_Chittagong_01.jpg">IqbalHossain</a> (CC BY-SA 4.0),{" "}
          <a className="underline" href="https://commons.wikimedia.org/wiki/File:Dhaka_skyline_at_golden_hour_02.jpg">Wasiul Bahar</a> (CC BY-SA 4.0)
        </p>
        <p className="relative mt-4">© {toBn(new Date().getFullYear())} LeadBangla. সর্বস্বত্ব সংরক্ষিত।</p>
      </footer>
    </div>
  );
}
