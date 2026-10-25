# Shared Inbox (receive and reply on the customer's domain)

Step-by-step AWS setup with your values: [aws_inbox_setup_guide.md](aws_inbox_setup_guide.md).

Customers get addresses such as `support@mail.theirbrand.com`. Incoming mail lands in **Email → Inbox** inside LeadBangla; replies go out through Amazon SES from the same address. No mail server to run: Amazon SES receives, LeadBangla files and shows it.

## How it works

```
sender ──► MX → inbound-smtp.<region>.amazonaws.com (SES)
             ├─ virus + spam scan, SPF/DKIM/DMARC verdicts
             └─ receipt rule "lb-<domain>" (rule set "leadbangla-inbox")
                  ├─ stores the raw email in the S3 bucket   inbox/<domain>/<id>
                  └─ publishes a notification to the SNS topic
SNS ──► POST https://<host>/api/v1/public/mail/inbound?secret=…   (public webhook, answers 200 at once)
          └─ Celery task process_inbound_mail_task  (retries with back-off)
               └─ downloads the email from S3 → mail_service.ingest_raw_email
                    ├─ finds the customer from the recipient address (plus-addresses and catch-all supported)
                    ├─ skips duplicates (same Message-ID), threads replies (In-Reply-To / References)
                    ├─ spam/virus FAIL → Spam folder; links the sender to an existing CRM contact
                    └─ stores bodies encrypted; attachments stay in the raw S3 copy and are streamed on download
reply  ──► mail_service.send_mail → MIME with threading headers + attachments → SES (SendEmail, raw)
```

Retention: mail older than `MAIL_RETENTION_DAYS` (default 90) is deleted daily together with its S3 copy; Trash is emptied after 30 days; unused uploads after 1 day.

## One-time AWS setup (administrator)

Do this once per AWS account/region (the same region as SES). The admin panel shows the same steps with copy-paste policies: **Integrations → Amazon SES Email → Shared inbox → Show AWS setup guide**, and a **Check inbox setup** button that tests it.

1. **S3 bucket** (block public access). Bucket policy lets SES write: principal `ses.amazonaws.com`, action `s3:PutObject` on `arn:aws:s3:::BUCKET/*`, condition `AWS:SourceAccount` = your account id.
2. **IAM user** (the one already used for SES) needs, in addition:
   `ses:DescribeActiveReceiptRuleSet`, `ses:CreateReceiptRuleSet`, `ses:SetActiveReceiptRuleSet`, `ses:CreateReceiptRule`, `ses:UpdateReceiptRule`, `ses:DeleteReceiptRule`, and `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket.
3. **SNS topic** (same region) with a policy that lets `ses.amazonaws.com` publish; add an **HTTPS subscription** to `https://<public-host>/api/v1/public/mail/inbound?secret=<Webhook Secret>`. The subscription confirms itself.
4. In the admin panel (Amazon SES settings) fill **Inbox: S3 bucket name** and **Inbox: SNS topic ARN**, save, press **Check inbox setup** — all items green.

Notes
- LeadBangla creates and manages its own receipt rule set `leadbangla-inbox`. If another rule set is already active in the region it **will not replace it**; the check says so.
- Only one set of MX records can exist per domain. Customers should use a subdomain (`mail.theirdomain.com`) so existing Google/Zoho mailboxes keep working. The setup screen recommends this by default.
- SES must support *receiving* in your region (not every region does — verify before choosing).
- The public API URL must be reachable from the internet over HTTPS (SNS cannot call `localhost`).

## Customer flow

1. Email Campaigns → Domains: add and verify the domain (already done for sending).
2. **Inbox → Setup → Add an inbox**: choose the domain, keep the suggested `mail.<domain>`.
3. Add the shown **MX** record (Type MX, Name `mail`, Priority 10, Value `inbound-smtp.<region>.amazonaws.com`).
4. LeadBangla re-checks every 5 minutes (and on **Verify**); status turns **Receiving mail**.
5. Create addresses (`support`, `sales`…), optionally turn on catch-all.
6. Campaigns can use one of these as **Replies go to**; customer replies arrive in the Inbox.

## Safety

- Bodies encrypted at rest; HTML shown only after sanitising (no scripts, forms, styles); pictures hidden until the reader asks; attachments are always downloaded, never opened inline; files from emails with a failed virus scan are blocked; risky file types cannot be attached when sending.
- Sending: at most `MAIL_DAILY_SEND_CAP_PER_ORG` (200) messages per day per customer, 20 recipients each, 10 MB of attachments, and addresses that bounced or complained earlier are refused.
- Webhook: protected by the shared secret and (if set) the expected SNS topic ARN. SNS message signatures are **not** verified yet.

## Testing

- `backend/app/scripts/seed_mail_demo.py` (`seed` / `clean`) fills the demo account with a fake active inbox and sample emails for looking at the screens (development only, never touches AWS).
- The service logic is covered by a harness that files sample emails (threading, duplicates, plus-addresses, catch-all, spam, attachments, HTML sanitising, replies with attachments, limits, retention) inside a rolled-back transaction.
- Still to do against real AWS once the bucket and permissions exist: send a mail from Gmail to the address and confirm it shows up; reply and confirm it arrives threaded; confirm replies can be sent **from a subdomain address when only the parent domain is verified in SES** (check in SES).

## Not included yet

HTML composing and rich text, saved replies, auto-replies, desktop/mobile mail apps and IMAP/POP, per-customer retention setting, bounce tracking for one-to-one replies, SNS signature verification.
