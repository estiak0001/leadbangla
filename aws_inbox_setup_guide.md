# AWS setup for the Shared Inbox — step by step

Values below are filled in from your AWS account as seen by the app. **Change them if yours differ.**

| Item | Value used in this guide |
|---|---|
| AWS region (same as SES) | `us-east-1` (N. Virginia) |
| AWS account ID | `471112973371` |
| IAM user the app uses | `leadbangla-ses` |
| S3 bucket (name must be globally unique) | `leadbangla-inbox-471112973371` |
| SNS topic | `leadbangla-inbox` → ARN `arn:aws:sns:us-east-1:471112973371:leadbangla-inbox` |
| Customer domain used for the first test | `gadgetandrevive.com` → receives at `mail.gadgetandrevive.com` |
| Your public API address | `https://YOUR-PUBLIC-HOST` (see Step 5 — SNS cannot call `localhost`) |

Menu names in the AWS console change from time to time; if one differs slightly, search for the service name at the top of the console.
Time needed: about 30–40 minutes, plus DNS waiting time.

---

## Step 0 — Check that SES can receive in your region (2 min)
1. AWS console → top-right region selector → choose **US East (N. Virginia) us-east-1**.
2. Open **Amazon SES**. In the left menu look for **Email receiving** (it may sit under *Configuration*). If it is there, receiving is available in this region. (`us-east-1` supports it; if you ever choose another region, confirm this first.)
3. Receiving works even while your account is still in the SES *sandbox* (the sandbox only limits **sending**) — I believe this is right; you will see it in Step 9.

## Step 1 — Create the S3 bucket (5 min)
1. AWS console → **S3** → **Create bucket**.
2. **Bucket name:** `leadbangla-inbox-471112973371`. **Region:** US East (N. Virginia).
3. Leave **Block all public access** **ON** (all four boxes ticked). Leave encryption on the default.
4. **Create bucket**.
5. Open the bucket → **Permissions** → **Bucket policy** → **Edit** → paste, then **Save changes**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESPuts",
      "Effect": "Allow",
      "Principal": { "Service": "ses.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::leadbangla-inbox-471112973371/*",
      "Condition": { "StringEquals": { "AWS:SourceAccount": "471112973371" } }
    }
  ]
}
```
6. **Safety net (recommended):** bucket → **Management** → **Create lifecycle rule** → name `expire-old-mail` → apply to all objects → tick **Expire current versions of objects** → **100 days**. (The app deletes mail after 90 days itself; this catches anything left behind.)

## Step 2 — Give the app's IAM user the extra permissions (5 min)
1. AWS console → **IAM** → **Policies** → **Create policy** → **JSON** tab → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:DescribeActiveReceiptRuleSet",
        "ses:CreateReceiptRuleSet",
        "ses:SetActiveReceiptRuleSet",
        "ses:CreateReceiptRule",
        "ses:UpdateReceiptRule",
        "ses:DeleteReceiptRule"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [ "s3:GetObject", "s3:DeleteObject" ],
      "Resource": "arn:aws:s3:::leadbangla-inbox-471112973371/*"
    },
    {
      "Effect": "Allow",
      "Action": [ "s3:ListBucket" ],
      "Resource": "arn:aws:s3:::leadbangla-inbox-471112973371"
    }
  ]
}
```
2. **Next** → name it `LeadBanglaInboxAccess` → **Create policy**.
3. **IAM → Users → `leadbangla-ses` → Add permissions → Attach policies directly** → tick `LeadBanglaInboxAccess` → **Add permissions**.

## Step 3 — Create the SNS topic (5 min)
SNS tells LeadBangla "a new email arrived".
1. AWS console → **Simple Notification Service (SNS)** (region `us-east-1`) → **Topics** → **Create topic**.
2. **Type: Standard**. **Name:** `leadbangla-inbox`. **Create topic**.
3. On the topic page: **Edit** → expand **Access policy** → replace everything with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESPublish",
      "Effect": "Allow",
      "Principal": { "Service": "ses.amazonaws.com" },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:us-east-1:471112973371:leadbangla-inbox",
      "Condition": { "StringEquals": { "AWS:SourceAccount": "471112973371" } }
    }
  ]
}
```
4. **Save changes**. Copy the topic **ARN**: `arn:aws:sns:us-east-1:471112973371:leadbangla-inbox`.

## Step 4 — Tell LeadBangla about the bucket and topic (3 min)
1. Admin panel → **Integrations → Amazon SES Email → Configure**.
2. Fill in:
   - **Inbox: S3 bucket name** → `leadbangla-inbox-471112973371`
   - **Inbox: SNS topic ARN** → `arn:aws:sns:us-east-1:471112973371:leadbangla-inbox`
   - **Webhook Secret** → a long random string. Make one with `openssl rand -hex 24` and keep it; you need it in Step 6. (If it is empty, a weak built-in default is used — do not leave it empty.)
   - **Public API URL** → your public address (Step 5), e.g. `https://app.yourdomain.com/api`
3. **Save**, then press **Check inbox setup** (in the *Shared inbox* section of the same page). You should see:
   - ✓ Inbound bucket — reachable
   - ✓ Receipt rule set — "No rule set is active yet. LeadBangla will create and activate its own…"
   - ✓ Notifications — topic set
   If an item is red, read its message (see *Troubleshooting* below), fix it and press the button again.

## Step 5 — Make the API reachable from the internet (10 min)
SNS must be able to call your server over **HTTPS**; `http://localhost` will not work.
- **Production:** use your real domain, e.g. `https://app.yourdomain.com`. The webhook address is  
  `https://app.yourdomain.com/api/v1/public/mail/inbound?secret=YOUR_WEBHOOK_SECRET`
- **Testing on this computer:** use a tunnel. Example with ngrok: `ngrok http 80` — it prints a public `https://xxxx.ngrok-free.app` address. The webhook address is then  
  `https://xxxx.ngrok-free.app/api/v1/public/mail/inbound?secret=YOUR_WEBHOOK_SECRET`  
  (A free tunnel gets a new address each time it restarts, so you would have to re-create the SNS subscription each time. Fine for a test.)

## Step 6 — Subscribe the webhook to the topic (3 min)
1. SNS → **Topics → `leadbangla-inbox` → Create subscription**.
2. **Protocol:** HTTPS. **Endpoint:** the webhook address from Step 5 (including `?secret=…`).
3. **Create subscription**. After a few seconds press the refresh icon: **Status** should change from *Pending confirmation* to **Confirmed** (LeadBangla confirms it by itself).
   - Stuck on *Pending*? The address is not reachable from the internet, the secret is wrong (the app answers 401), or the topic ARN in Step 4 does not match. See *Troubleshooting*.

## Step 7 — Make sure DNS and the sending domain are ready (5 min)
1. In LeadBangla, **Email Campaigns → Domains**: `gadgetandrevive.com` must show **Ready to send** (verified with Amazon SES).
2. The customer inbox will receive on a **subdomain**, `mail.gadgetandrevive.com`, so any existing mailboxes on the main domain keep working.

## Step 8 — Create the inbox in LeadBangla (5 min + DNS wait)
1. Customer app → **Inbox → Setup → Add an inbox**: choose `gadgetandrevive.com`, keep `mail.gadgetandrevive.com`, press **Create inbox**.  
   Behind the scenes LeadBangla creates the SES receiving rule set `leadbangla-inbox`, activates it, and adds the rule for this domain. (If you get an error here, see *Troubleshooting*.)
2. Add the **MX record** shown on screen at your DNS provider (for `gadgetandrevive.com` that is where its nameservers point):

   | Type | Name / Host | Priority | Value |
   |---|---|---|---|
   | MX | `mail` | `10` | `inbound-smtp.us-east-1.amazonaws.com` |

   No quotes, no trailing dot. If your provider wants the full name use `mail.gadgetandrevive.com`.
3. Press **Verify** (or wait — it re-checks every 5 minutes). The status becomes **Receiving mail**.
4. Add addresses, for example `support` and `hello`.
5. *(Optional check in AWS)* SES → **Email receiving → Rule sets**: you should see an active rule set **leadbangla-inbox** with a rule named `lb-mail-gadgetandrevive-com`.

## Step 9 — Test it (5 min)
1. From your own Gmail (`eng.estiakahmed@gmail.com`) send an email to **`support@mail.gadgetandrevive.com`**.
2. Within about a minute it should appear in **Inbox**. (Behind the scenes: SES stores it in the bucket under `inbox/mail.gadgetandrevive.com/…`, SNS notifies LeadBangla, LeadBangla files it.)
3. Open it and **Reply**. While SES is in the sandbox you can only send to **verified** addresses — your Gmail is verified, so this works. Check the reply arrives in Gmail and stays in the same conversation.
4. **Check these once:** the reply is sent *from* `support@mail.gadgetandrevive.com` although only the main domain `gadgetandrevive.com` is verified in SES. If SES refuses ("sender … isn't verified"), verify `mail.gadgetandrevive.com` as its own identity in SES (Identities → Create identity → Domain) and add the DKIM records it shows.

## Step 10 — Before real customers use it
- Keep a **permanent public HTTPS address** (no tunnel) and re-point the SNS subscription to it.
- Ask AWS for **SES production access** (otherwise replies can only go to verified addresses).
- Set a strong `SERVICE_CRED_KEY` and `JWT_SECRET` in the server settings.
- Decide the retention period (`MAIL_RETENTION_DAYS`, default 90 days).

---

## Troubleshooting

| What you see | Likely cause → fix |
|---|---|
| *Check inbox setup*: "Inbound bucket … doesn't exist" | Bucket name typo or created in another region → fix the name, or recreate in `us-east-1`. |
| "the AWS user isn't allowed to do this" | Step 2 policy not attached to `leadbangla-ses` (or the bucket name inside it is wrong). |
| "Another rule set ('X') is already active" | Your account already uses SES receiving. LeadBangla will not replace it. Either add LeadBangla's rule inside that set yourself, or make `leadbangla-inbox` the active one. |
| Creating the inbox fails: "SES can't write to the bucket" | Step 1 bucket policy missing/mistyped (check bucket name and account ID). |
| Creating the inbox fails: "SES can't publish to the SNS topic" | Step 3 topic access policy missing/mistyped. |
| Subscription stays *Pending confirmation* | The endpoint isn't reachable over HTTPS, the `?secret=` is wrong (the app returns 401), or the topic ARN in Step 4 differs from the real one. Test the address in a browser: it should answer "Method Not Allowed" (not a timeout). |
| MX never turns green | Record added at the wrong DNS provider (use the one the domain's nameservers point to), wrong name (`mail`, not `mail.mail`), or not propagated yet — wait and press Verify. |
| Email sent but nothing in the Inbox | 1) Look in the S3 bucket under `inbox/mail.gadgetandrevive.com/` — if the file is **not** there, the MX/rule is the problem (the sender's mail system gets a "no such recipient" bounce). 2) If it **is** there, the notification didn't arrive: check the SNS subscription status and `docker compose logs backend \| grep inbound` and `docker compose logs worker`. |
| Gmail says "Address not found" / bounce | The rule set isn't active or the domain in the rule differs from the one in the address. Recheck Step 8 item 5. |
| Reply fails: "sender … isn't verified" | See Step 9 item 4. |
| Reply fails: "recipient isn't verified … sandbox" | Verify the recipient in SES, or request production access. |

## Cost note (approximate, from memory — check AWS pricing)
Receiving costs roughly $0.10 per 1,000 emails plus a few cents for S3 storage and SNS. Small teams will pay very little.
