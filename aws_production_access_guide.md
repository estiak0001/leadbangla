# Amazon SES production access: step-by-step guide (LeadBangla)

Region: **US East (N. Virginia) us-east-1**. Cost: free. Review time: usually about 24 hours.

## 1. Before you submit (all must be true)

- [ ] `leadbangla.com` is verified in SES with DKIM = Success.
- [ ] SPF and DMARC records exist for `leadbangla.com`.
- [ ] `https://leadbangla.com/privacy`, `/terms` and `/acceptable-use` open.
- [ ] Bounce and complaint tracking is set up (admin panel -> Integrations -> Amazon SES -> Check: all green).
- [ ] The `leadbangla-inbox` SNS topic has a Confirmed HTTPS subscription (mail to `support@gadgetandrevive.com` appears in the Inbox).
- [ ] Simulator test passed: a campaign sent to `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com` shows them in Campaigns -> Unsubscribed (reason bounce / complaint).
- [ ] You clicked the Unsubscribe link in a real campaign email and the address was suppressed.
- [ ] `support@leadbangla.com` forwards to a Gmail address you check every day. AWS replies there.
- [ ] The AWS account has a valid payment method.

## 2. Submit the request

1. Sign in to the AWS Console. Set the region to **US East (N. Virginia)**.
2. Open **Amazon SES -> Account dashboard**.
3. Click **Request production access** (banner: "Your Amazon SES account is in the sandbox").
4. Fill in the form:

| Field | Value |
|---|---|
| Mail type | **Marketing** |
| Website URL | `https://leadbangla.com` |
| Use case description | Paste the text in section 3 |
| Additional contact addresses | `support@leadbangla.com` and your own Gmail |
| Preferred contact language | English |
| Acknowledgement | Tick the box (you will only send to people who asked for it, and you will handle bounces and complaints) |

5. Click **Submit request**. The dashboard shows "Pending".

## 3. Use case description (copy and paste)

LeadBangla (https://leadbangla.com) is a marketing platform for small and medium businesses in Bangladesh. Our customers send email, SMS and WhatsApp campaigns to their own customers and subscribers. The service is new and we are onboarding our first business customers, so volume will start low and grow gradually. We expect under 10,000 emails per day initially.

How recipients are collected: each business customer uploads or collects their own contact list, and must have the recipient's consent. Our Terms of Service and Acceptable Use policy (https://leadbangla.com/terms and https://leadbangla.com/acceptable-use) prohibit purchased, rented or scraped lists. Consent records are stored with each contact. Every customer must verify their own sending domain (DKIM and SPF) before they can send, and we send from that verified domain.

Unsubscribes: every marketing email contains an unsubscribe link and the sender's business name and address. Unsubscribes take effect immediately and are stored on a suppression list, so those addresses are never emailed again.

Bounces and complaints: we receive SES bounce and complaint notifications through an SNS topic, delivered to our server. Hard-bounced and complaining addresses are added to the suppression list automatically and never emailed again. Customer accounts with high bounce or complaint rates are paused automatically. Each customer account also has daily and monthly sending limits based on their plan.

Support and abuse reports are handled through support@leadbangla.com.

## 4. While AWS reviews

- Check the Gmail behind `support@leadbangla.com` (and its spam folder).
- Do **not** resubmit while it is pending. That restarts the review.
- If AWS asks a follow-up, answer in one clear reply:
  - Consent: customers must have consent, it is recorded per contact, bought lists are forbidden.
  - Bounces and complaints: SNS notifications reach our server and the address is suppressed automatically.
  - Volume: under 10,000 a day at first; plans cap monthly volume from 8,000 to 150,000 emails.
  - Sample email: send them a campaign email that shows the unsubscribe link and business address.
- If denied: read the reason, fix that point, and reply on the same case.

## 5. After approval

1. SES -> Account dashboard shows production access enabled and a daily limit above 200.
2. AWS Budgets: create a monthly cost budget with an alert at about $20.
3. Send a real campaign to your own Gmail. Check it reaches the inbox and that Unsubscribe works.
4. Watch SES Reputation metrics for the first weeks. Keep bounces under about 5% and complaints under about 0.1%.
5. Later, consider changing DMARC from `p=none` to `p=quarantine`.

## Cost

The request is free. Sending is about $0.10 per 1,000 emails (about 12 BDT). Plan prices already cover this.
