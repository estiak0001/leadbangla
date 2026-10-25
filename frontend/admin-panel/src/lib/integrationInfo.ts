/** What each platform integration is for, and how to get its credentials. Shown on its page. */
export interface IntegrationInfo {
  tagline: string;
  usedFor: string[];
  ifMissing: string;
  steps: string[];
  notes?: string[];
  required: string[];          // credential keys that must be filled in to go live
  liveAffects?: string;
}

export const INTEGRATION_INFO: Record<string, IntegrationInfo> = {
  amazon_ses: {
    tagline: "Delivers every customer's email campaign and the platform's own emails.",
    usedFor: ["Email campaigns sent by customers", "Open/click tracking and bounce handling", "Verified sending domains for each customer"],
    ifMissing: "Customers cannot send real email — campaigns stay blocked with a 'not configured' message.",
    steps: [
      "In AWS, open IAM and create a user with SES permissions (for example AmazonSESFullAccess).",
      "Create an access key for that user and paste the Access Key ID and Secret here.",
      "Choose the AWS region where your domains are verified (for example ap-south-1).",
      "Set a Default From Email on a domain verified in SES, then use 'Send test email' below.",
      "Ask AWS for SES production access, otherwise you can only email verified addresses.",
    ],
    notes: ["Public API URL is needed for open/click tracking to work from outside your network.", "Webhook secret protects the bounce/complaint endpoint — pick a long random string."],
    required: ["access_key_id", "secret_access_key", "region", "default_from_email"],
    liveAffects: "all customers' email",
  },
  sslcommerz: {
    tagline: "Takes subscription payments and wallet top-ups in BDT.",
    usedFor: ["Plan subscriptions", "Wallet top-ups (cards, bKash, Nagad, Rocket, Upay)"],
    ifMissing: "Checkout runs in a built-in fake mode — nobody is actually charged.",
    steps: [
      "Register as a merchant with SSLCommerz (needs Trade License and TIN for live).",
      "Start in sandbox: copy the Store ID and Store Password from the sandbox panel.",
      "Use https://sandbox.sslcommerz.com as the base URL while testing.",
      "When approved, switch to your live Store ID/Password and the live base URL.",
    ],
    notes: ["Fees are about 2.5–3.5% + VAT per payment."],
    required: ["store_id", "store_password", "sandbox_base_url"],
    liveAffects: "all payments",
  },
  firebase_vapid: {
    tagline: "The one set of push keys the whole platform uses. Customers don't set anything up themselves.",
    usedFor: ["Every customer's push notifications", "Subscribe links and website code (each customer has their own subscribers)"],
    ifMissing: "Customers see “Push isn't switched on yet” and cannot send notifications.",
    steps: [
      "Press “Generate key pair” — it creates and saves the public and private keys for you. (You can paste your own instead.)",
      "Set the contact address as mailto:you@yourcompany.com. Browser push services use it to reach you if there is a problem.",
      "Press Test connection, then switch Live on.",
    ],
    notes: [
      "Push is free: browsers deliver it through Google or Mozilla at no cost.",
      "Generating new keys replaces the old ones, and everyone who subscribed must subscribe again. Do it once, at the start.",
      "Keep the private key secret.",
    ],
    required: ["vapid_public_key", "vapid_private_key", "vapid_subject"],
    liveAffects: "push campaigns",
  },
  meta_whatsapp: {
    tagline: "Sends WhatsApp messages for customers directly through Meta's Cloud API — no provider in between.",
    usedFor: ["Customer WhatsApp campaigns (using Meta-approved templates)", "Delivery receipts and STOP replies through the webhook"],
    ifMissing: "WhatsApp campaigns use the older provider route if it is set up, otherwise they are simulated.",
    steps: [
      "Create a Meta Business account and complete business verification (trade licence).",
      "In developers.facebook.com create an app of type Business and add the WhatsApp product.",
      "Add your business phone number. Copy its Phone number ID and the WhatsApp Business Account ID from WhatsApp → API setup.",
      "In Business settings → Users → System users, create a system user, give it the WhatsApp account, and generate a token with whatsapp_business_messaging and whatsapp_business_management.",
      "Paste the token, IDs, your App secret (App settings → Basic) and a verify token you make up, then save.",
      "In the app's WhatsApp → Configuration set the Callback URL shown below and the same verify token. Subscribe to the 'messages' field.",
      "Press Test connection, send the hello_world test message to your own number, then switch Live on.",
    ],
    notes: [
      "Business-started messages must use a template approved by Meta. Create templates in WhatsApp Manager; approved ones appear in the customers' composer.",
      "A customer's number can have its own Phone number ID (set when you assign it). Otherwise the platform number is used.",
      "Customers who reply STOP are opted out automatically.",
    ],
    required: ["access_token", "phone_number_id"],
    liveAffects: "all customers' WhatsApp",
  },
  whatsapp_bsp: {
    tagline: "Delivers WhatsApp messages for customers through an approved Business Solution Provider.",
    usedFor: ["Customer WhatsApp campaigns", "Business number and template approvals"],
    ifMissing: "WhatsApp campaigns are simulated — nothing is delivered.",
    steps: [
      "Get approved as a WhatsApp Business Solution Provider customer — for example through SSL Wireless.",
      "Paste the BSP API token here and save it.",
      "Use 'Send a test WhatsApp message' with your own number to prove it works.",
      "Switch it on. Customers can then request their own business number from their WhatsApp → Setup tab.",
    ],
    notes: ["Business-started messages must use templates approved by Meta.", "Customers cannot send WhatsApp campaigns until you approve their business number."],
    required: ["api_token"],
    liveAffects: "all customers' WhatsApp",
  },
  dataseo: {
    tagline: "Keyword, ranking and SEO data for the SEO tools.",
    usedFor: ["Customer SEO audits and keyword checks (charged as SEO credits)"],
    ifMissing: "SEO lookups return no live data.",
    steps: ["Create an account at DataForSEO.", "Use your account email as Login and your API password as Password (from the API access page)."],
    notes: ["Usage-based pricing — set a budget alert in their dashboard."],
    required: ["login", "password"],
    liveAffects: "SEO tools",
  },
  meta_social: {
    tagline: "Publishes to Facebook and Instagram pages and reads their stats.",
    usedFor: ["Social posting and engagement stats for connected pages"],
    ifMissing: "Facebook/Instagram posting is unavailable.",
    steps: ["Create an app in Meta for Developers and pass App Review for page publishing.", "Generate a long-lived Page Access Token and copy the Facebook Page ID."],
    notes: ["Customers connect their own pages; this is the platform's app credential."],
    required: ["access_token", "page_id"],
    liveAffects: "Facebook/Instagram",
  },
  linkedin: {
    tagline: "Publishes to LinkedIn organisation pages.",
    usedFor: ["LinkedIn posting"],
    ifMissing: "LinkedIn posting is unavailable.",
    steps: ["Apply for the LinkedIn Marketing Developer Platform and get approved.", "Generate an access token and copy the organisation URN (urn:li:organization:123…)."],
    required: ["access_token", "org_urn"],
    liveAffects: "LinkedIn posting",
  },
  twitter_x: {
    tagline: "Posts to X (Twitter).",
    usedFor: ["X posting"],
    ifMissing: "X posting is unavailable.",
    steps: ["Subscribe to an X API tier that allows posting (Basic is about $200/month).", "Create a project and paste the Bearer Token, API Key and API Secret."],
    notes: ["This is the most expensive integration — enable it only if customers need it."],
    required: ["bearer_token", "api_key", "api_secret"],
    liveAffects: "X posting",
  },
};
