import { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Change these to your real details — they appear on the public pages. */
const COMPANY = "LeadBangla";
const SITE = "leadbangla.com";
const CONTACT_EMAIL = "support@leadbangla.com";
const ABUSE_EMAIL = "abuse@leadbangla.com";
const UPDATED = "26 October 2026";

function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-50 text-surface-800">
      <header className="border-b border-surface-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label={COMPANY}><img src="/logo.png" alt={COMPANY} className="h-7 w-auto" /></Link>
          <nav className="flex gap-4 text-sm text-surface-600">
            <Link to="/privacy" className="hover:text-brand-600">Privacy</Link>
            <Link to="/terms" className="hover:text-brand-600">Terms</Link>
            <Link to="/acceptable-use" className="hover:text-brand-600">Acceptable use</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-surface-900">{title}</h1>
        <p className="mt-1 text-sm text-surface-500">Last updated {UPDATED}</p>
        <p className="mt-4 text-surface-700">{intro}</p>
        <div className="mt-6 space-y-6 text-[15px] leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-surface-900 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_a]:text-brand-600 [&_a]:underline">{children}</div>
      </main>
      <footer className="border-t border-surface-200 bg-white py-6 text-center text-xs text-surface-500">
        © {new Date().getFullYear()} {COMPANY} · <Link to="/" className="underline">{SITE}</Link> · <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </footer>
    </div>
  );
}

const Section = ({ h, children }: { h: string; children: ReactNode }) => <section><h2>{h}</h2>{children}</section>;

export function PrivacyPage() {
  return (
    <Shell title="Privacy Policy" intro={`${COMPANY} (“we”, “us”) provides marketing and customer-communication software for businesses. This policy explains what information we handle and why.`}>
      <Section h="Who is responsible for what">
        <p>When a business uses {COMPANY} to email or message its own contacts, <b>that business decides who to contact and why</b> (the “controller”). {COMPANY} only processes that data on the business's behalf (the “processor”). For account and billing information of our own customers, {COMPANY} is the controller.</p>
      </Section>
      <Section h="Information we handle">
        <ul>
          <li><b>Account information</b>: name, email address, phone number, business details, billing records.</li>
          <li><b>Contact data our customers add</b>: names, email addresses, phone numbers, tags and consent records, imported or collected through forms.</li>
          <li><b>Messages</b>: campaign content, and emails received and sent through the shared inbox on a customer's domain.</li>
          <li><b>Usage and security data</b>: log-ins, delivery results (sent, bounced, opened, clicked), IP address and device information.</li>
        </ul>
      </Section>
      <Section h="How we use it">
        <ul>
          <li>To provide, secure and support the service, and to deliver the messages our customers send.</li>
          <li>To prevent abuse: we keep suppression lists (unsubscribed, bounced and spam-reporting addresses) and may pause accounts that harm deliverability.</li>
          <li>To bill our customers and to meet legal obligations.</li>
        </ul>
        <p>We do not sell personal information and we do not use customers' contact lists for our own marketing.</p>
      </Section>
      <Section h="Who we share it with">
        <p>Only with service providers needed to run the service: cloud hosting and email delivery (Amazon Web Services, including Amazon SES and S3), SMS and messaging gateways, payment providers, and the social networks a customer connects (for example Meta and LinkedIn). They may process data only to provide their service.</p>
      </Section>
      <Section h="Retention and security">
        <p>Messages in the shared inbox are kept for a limited period (90 days by default) and then deleted. Message bodies and stored credentials are encrypted at rest. Contact data is kept while the customer's account is active and removed on request or after the account is closed, except where the law requires us to keep records.</p>
      </Section>
      <Section h="Your choices and rights">
        <p>If you received an email sent through {COMPANY}, use the <b>Unsubscribe</b> link in it, or contact the business that sent it. You can ask us to access, correct or delete personal information we hold about you by writing to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If your data is held for a business customer, we will pass your request to them.</p>
      </Section>
      <Section h="Cookies">
        <p>The service uses only the storage needed to keep you signed in and remember simple preferences. We do not use advertising cookies.</p>
      </Section>
      <Section h="Changes and contact">
        <p>We will post changes on this page and update the date above. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>
    </Shell>
  );
}

export function TermsPage() {
  return (
    <Shell title="Terms of Service" intro={`These terms apply when you use ${COMPANY} (${SITE}). By creating an account you agree to them.`}>
      <Section h="The service">
        <p>{COMPANY} lets businesses manage contacts, send email, SMS and WhatsApp campaigns, receive and reply to email on their own domain, schedule social posts and track results. Features depend on your plan.</p>
      </Section>
      <Section h="Your account">
        <p>You are responsible for your account, for keeping credentials safe, and for everything done under it, including by your team members. You must give accurate information.</p>
      </Section>
      <Section h="Your content and contacts">
        <p>You own your content and contact lists. You promise that you have the right to contact every person you add, and that you follow our <Link to="/acceptable-use">Acceptable Use &amp; Anti-Spam Policy</Link> and the laws that apply to you, including rules on consent and unsubscribing.</p>
      </Section>
      <Section h="Payments">
        <p>Plans and prices are shown at sign-up and in your billing page. Wallet credits used for SMS, WhatsApp and email overage are consumed when messages are sent. Unless the law says otherwise, fees already paid are not refundable.</p>
      </Section>
      <Section h="Suspension and termination">
        <p>We may limit, pause or end an account that breaks these terms or the acceptable-use policy, puts our delivery reputation at risk, or is used for fraud. You may close your account at any time.</p>
      </Section>
      <Section h="Third-party services">
        <p>Some features rely on providers such as Amazon Web Services, SMS gateways, Meta and LinkedIn. Their availability and rules are outside our control.</p>
      </Section>
      <Section h="Disclaimers and liability">
        <p>The service is provided “as is”. We do not guarantee that every message will be delivered or opened. To the extent the law allows, our liability is limited to the fees you paid in the three months before the claim.</p>
      </Section>
      <Section h="Changes and contact">
        <p>We may update these terms and will post the new version here. Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>
    </Shell>
  );
}

export function AcceptableUsePage() {
  return (
    <Shell title="Acceptable Use & Anti-Spam Policy" intro={`${COMPANY} exists to help businesses talk to people who want to hear from them. This policy applies to everyone who sends messages through the platform.`}>
      <Section h="1. Send only to people who agreed">
        <ul>
          <li>Every recipient must have given permission to receive your messages (for example by signing up on your website, a landing page or a form), or be an existing customer you have a real relationship with.</li>
          <li><b>No purchased, rented, scraped or harvested lists.</b> No sending to addresses guessed or collected without consent.</li>
          <li>Keep a record of how and when each contact joined. Consent history is stored for each contact.</li>
        </ul>
      </Section>
      <Section h="2. Be clear about who you are">
        <ul>
          <li>The sender name and address must be real and must not mislead. Subject lines must not be deceptive.</li>
          <li>Every marketing email automatically carries your business name, postal address and an <b>Unsubscribe link</b>. You must not remove them.</li>
        </ul>
      </Section>
      <Section h="3. Honor unsubscribes immediately">
        <ul>
          <li>Anyone who clicks Unsubscribe (or uses the one-click Unsubscribe button in their mail app) is added to your suppression list at once and is never emailed again by your account.</li>
          <li>Addresses that bounce or report spam are also suppressed automatically. You cannot re-enable them.</li>
          <li>For SMS and WhatsApp, replies such as STOP opt the person out.</li>
        </ul>
      </Section>
      <Section h="4. Protect deliverability">
        <ul>
          <li>You must verify your own sending domain (DKIM and SPF) before sending from it.</li>
          <li>Daily sending limits apply to each account. Accounts whose bounce or complaint rates become too high are paused automatically until reviewed.</li>
          <li>Keep lists clean: remove addresses that never engage and stop sending to invalid addresses.</li>
        </ul>
      </Section>
      <Section h="5. What is not allowed">
        <ul>
          <li>Phishing, scams, fraud, malware, impersonation, or content that is illegal in Bangladesh or where the recipient lives.</li>
          <li>Adult content, gambling, weapons, illegal drugs, hate speech, or harassment.</li>
          <li>Attempts to avoid our limits, filters or suppression lists.</li>
        </ul>
      </Section>
      <Section h="6. Enforcement">
        <p>We monitor delivery results. We may warn, limit, pause or close an account that breaks this policy, and we may cooperate with email providers and authorities where required.</p>
      </Section>
      <Section h="7. Report abuse">
        <p>If you received unwanted email sent through {COMPANY}, forward it to <a href={`mailto:${ABUSE_EMAIL}`}>{ABUSE_EMAIL}</a> with the full message headers. We investigate every report.</p>
      </Section>
    </Shell>
  );
}
