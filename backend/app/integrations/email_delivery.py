"""Low-level delivery backends behind EmailClient.send_email.

Each function takes an already-resolved message and returns a message id.
Provider selection lives in services/email_provider_service.py.
"""
import asyncio
import re
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import settings


def _plain_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", html)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</h[1-6]>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def build_message(
    *, to_email: str, subject: str, html_body: str, from_email: str, from_name: str | None, headers: dict | None = None
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((from_name, from_email)) if from_name else from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1])
    for k, v in (headers or {}).items():
        msg[k] = v
    msg.set_content(_plain_text(html_body) or " ")
    msg.add_alternative(html_body, subtype="html")
    return msg


def _dkim_sign(raw: bytes, *, domain: str, selector: str, private_key_pem: str) -> bytes:
    import dkim  # dkimpy

    signature = dkim.sign(
        raw,
        selector.encode(),
        domain.encode(),
        private_key_pem.encode(),
        include_headers=[b"from", b"to", b"subject", b"message-id"],
    )
    return signature + raw


def _smtp_send_sync(raw: bytes, from_email: str, to_email: str) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.sendmail(from_email, [to_email], raw)


async def send_via_smtp(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    from_email: str,
    from_name: str | None,
    dkim: dict | None = None,
    headers: dict | None = None,
) -> str:
    """dkim = {"domain", "selector", "private_key_pem"} to sign as the customer's domain."""
    msg = build_message(to_email=to_email, subject=subject, html_body=html_body, from_email=from_email, from_name=from_name, headers=headers)
    raw = msg.as_bytes()
    if dkim:
        raw = _dkim_sign(raw, domain=dkim["domain"], selector=dkim["selector"], private_key_pem=dkim["private_key_pem"])
    await asyncio.to_thread(_smtp_send_sync, raw, from_email, to_email)
    return msg["Message-ID"].strip("<>")


class EmailSendError(Exception):
    """A delivery failure with a message that is safe and useful to show users."""


def customer_safe(message: str, *, log_prefix: str = "email delivery") -> str:
    """Wording for customers: no provider names, credentials or regions. The original goes to the server log."""
    import logging  # noqa: PLC0415

    logging.getLogger("email").warning("%s error (hidden from customer): %s", log_prefix, message)
    low = message.lower()
    if "sender" in low and "verif" in low and "recipient" not in low:
        return "The From address isn't verified yet. Open Email Setup and verify your domain."
    return "We couldn't deliver this email right now. Please try again later, or contact support if it keeps happening."


def friendly_ses_error(e: Exception, *, region: str = "", sender: str = "", recipient: str = "") -> str:
    """Turns botocore errors into messages that say what to do."""
    code = ""
    message = str(e)
    resp = getattr(e, "response", None)
    if isinstance(resp, dict):
        code = resp.get("Error", {}).get("Code", "")
        message = resp.get("Error", {}).get("Message", message)
    low = message.lower()

    if code in ("InvalidClientTokenId", "UnrecognizedClientException", "SignatureDoesNotMatch", "AuthFailure") or "security token" in low:
        return "Amazon SES rejected the AWS credentials. Check the Access Key ID and Secret Access Key in the Integration Hub."
    if code in ("AccessDenied", "AccessDeniedException", "UnauthorizedOperation"):
        return "The AWS user is not allowed to use SES. Attach a policy that allows ses:* (or at least SendEmail, CreateEmailIdentity, GetEmailIdentity, GetAccount)."
    if code == "NotFoundException":
        return f"Amazon SES doesn't know this identity in region {region or 'this region'}. Add the domain again so it is registered in SES, and make sure the region matches."
    if code == "MessageRejected":
        if "not verified" in low:
            # SES lists exactly which identities failed: "...identities failed the check in region US-EAST-1: a@x.com, b@y.com"
            import re as _re

            m = _re.search(r"failed the check[^:]*:\s*(.+)$", message, _re.I | _re.S)
            failed = [x.strip().strip(".").lower() for x in m.group(1).split(",")] if m else []
            sender_l, rcpt_l = sender.lower(), recipient.lower()
            sender_dom = sender_l.split("@")[-1]
            bad_sender = [f for f in failed if f == sender_l or f == sender_dom] or ([sender] if not failed and sender else [])
            bad_rcpt = [f for f in failed if f == rcpt_l]
            parts = []
            if bad_sender:
                parts.append(
                    f"the sender {sender} isn't verified in Amazon SES (region {region or 'this region'}). "
                    f"Verify the address {sender} or its whole domain {sender_dom} in SES → Identities, or change the From address to one that is verified"
                )
            if bad_rcpt:
                parts.append(
                    f"the recipient {recipient} isn't verified, and your SES account is still in sandbox mode "
                    "(verify it in SES → Identities, or request production access)"
                )
            if parts:
                return "Amazon SES rejected the email: " + "; and ".join(parts) + "."
            return f"Amazon SES rejected the email because an address isn't verified: {', '.join(failed) or message}. In sandbox both the sender and recipient must be verified."
        return f"Amazon SES rejected the message: {message}"
    if code in ("AccountSendingPausedException", "SendingPausedException"):
        return "Amazon SES has paused sending for this AWS account. Check the SES console for a reputation or compliance notice."
    if code in ("MailFromDomainNotVerifiedException",):
        return "The MAIL FROM domain is not verified in Amazon SES."
    if code in ("TooManyRequestsException", "Throttling", "ThrottlingException"):
        return "Amazon SES is rate-limiting requests (daily quota or send rate exceeded). Try again shortly or ask AWS to raise the limit."
    if code == "LimitExceededException":
        return "Amazon SES limit exceeded for this account."
    if "endpoint" in low and "could not connect" in low or "name or service not known" in low:
        return f"Could not reach Amazon SES in region {region or '?'}. Check the region name and the server's internet connection."
    if "region" in low and "invalid" in low:
        return f"'{region}' is not a valid AWS region."
    return f"Amazon SES error{f' ({code})' if code else ''}: {message}"


def ses_client(config: dict):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "sesv2",
        region_name=config["region"],
        aws_access_key_id=config["access_key_id"],
        aws_secret_access_key=config["secret_access_key"],
        config=Config(connect_timeout=8, read_timeout=15, retries={"max_attempts": 1}),
    )


async def send_via_ses(
    config: dict, *, to_email: str, subject: str, html_body: str, from_email: str, from_name: str | None, reply_to: str | None = None,
    headers: dict | None = None,
) -> str:
    source = formataddr((from_name, from_email)) if from_name else from_email

    def _send() -> str:
        kwargs = {}
        if config.get("configuration_set"):
            kwargs["ConfigurationSetName"] = config["configuration_set"]
        if reply_to:
            kwargs["ReplyToAddresses"] = [reply_to]
        simple_headers = {"Headers": [{"Name": k, "Value": v} for k, v in headers.items()]} if headers else {}
        resp = ses_client(config).send_email(
            FromEmailAddress=source,
            Destination={"ToAddresses": [to_email]},
            Content={
                "Simple": {
                    **simple_headers,
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {
                        "Html": {"Data": html_body, "Charset": "UTF-8"},
                        "Text": {"Data": _plain_text(html_body) or " ", "Charset": "UTF-8"},
                    },
                }
            },
            **kwargs,
        )
        return resp["MessageId"]

    try:
        return await asyncio.to_thread(_send)
    except Exception as e:
        raise EmailSendError(friendly_ses_error(e, region=config["region"], sender=from_email, recipient=to_email)) from e
