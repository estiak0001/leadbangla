"""Amazon SES *receiving* (mail to our customers' domains) and raw sending, plus the S3 bucket the mail lands in.

SES delivers each incoming message into an S3 bucket and notifies us through SNS. Rules that say "this domain goes
to that bucket" live in ONE active receipt rule set per AWS region; we use a rule set called RULE_SET and refuse to
take over a different active one."""
import asyncio

from app.integrations.email_delivery import EmailSendError, friendly_ses_error

RULE_SET = "leadbangla-inbox"
MAX_RAW_BYTES = 40 * 1024 * 1024


class MailSetupError(Exception):
    """Something about the AWS setup needs fixing; the message says what."""


def mx_value(region: str) -> str:
    return f"10 inbound-smtp.{region}.amazonaws.com"


def mx_host(region: str) -> str:
    return f"inbound-smtp.{region}.amazonaws.com"


def _client(service: str, cfg: dict):
    import boto3
    from botocore.config import Config

    return boto3.client(
        service, region_name=cfg["region"], aws_access_key_id=cfg["access_key_id"], aws_secret_access_key=cfg["secret_access_key"],
        config=Config(connect_timeout=8, read_timeout=30, retries={"max_attempts": 2}),
    )


def _code(e: Exception) -> str:
    return getattr(e, "response", {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else ""


def explain(e: Exception, cfg: dict, what: str) -> str:
    code = _code(e)
    if code in ("AccessDenied", "AccessDeniedException", "UnauthorizedOperation", "403", "Forbidden") or "not authorized" in str(e) or "Forbidden" in str(e):
        bucket = cfg.get("inbound_bucket") if what.startswith("Inbound bucket") else None
        extra = (f" Two common causes: (1) the IAM user doesn't have the inbox policy yet (it needs s3:ListBucket on '{bucket}'), or "
                 f"(2) the bucket name '{bucket}' already belongs to someone else's AWS account — bucket names are global, so pick a different one.") if bucket else ""
        return f"{what}: AWS refused access (403).{extra} Add the inbox permissions to the app's IAM user (see the setup guide in the Integration Hub)."
    if code in ("NoSuchBucket", "404", "NotFound"):
        return f"{what}: the bucket '{cfg.get('inbound_bucket')}' doesn't exist in AWS (or is in another region)."
    if code in ("InvalidClientTokenId", "SignatureDoesNotMatch", "UnrecognizedClientException"):
        return "The AWS credentials were rejected."
    if "Could not connect" in str(e) or "Name or service not known" in str(e):
        return f"{what}: could not reach AWS in region {cfg['region']}."
    return f"{what}: {code or type(e).__name__}: {str(e)[:200]}"


def _check_setup_sync(cfg: dict) -> list[dict]:
    out: list[dict] = []

    def add(name: str, ok: bool, message: str) -> None:
        out.append({"name": name, "ok": ok, "message": message})

    bucket = cfg.get("inbound_bucket")
    if not bucket:
        add("Inbound bucket", False, "No inbound S3 bucket is set. Add its name in the Amazon SES settings.")
    else:
        try:
            _client("s3", cfg).head_bucket(Bucket=bucket)
            add("Inbound bucket", True, f"Bucket '{bucket}' is reachable.")
        except Exception as e:  # noqa: BLE001
            add("Inbound bucket", False, explain(e, cfg, "Inbound bucket"))
    try:
        r = _client("ses", cfg).describe_active_receipt_rule_set()
        name = (r.get("Metadata") or {}).get("Name")
        if not name:
            add("Receipt rule set", True, "No rule set is active yet. LeadBangla will create and activate its own when the first domain is enabled.")
        elif name == RULE_SET:
            add("Receipt rule set", True, f"Active rule set '{name}' (managed by LeadBangla), {len(r.get('Rules') or [])} rule(s).")
        else:
            add("Receipt rule set", False, f"Another rule set '{name}' is active in this region. LeadBangla won't replace it — add LeadBangla's rules there manually, or make it use '{RULE_SET}'.")
    except Exception as e:  # noqa: BLE001
        msg = explain(e, cfg, "Receipt rules")
        if "InvalidAction" in str(e) or "not supported" in str(e).lower():
            msg = f"Email receiving may not be available in region {cfg['region']}. Check AWS's list of SES receiving regions."
        add("Receipt rule set", False, msg)
    if not cfg.get("inbound_topic_arn"):
        add("Notifications (SNS topic)", True, "Optional: no SNS topic set. Without it SES can't tell LeadBangla about new mail — add the topic ARN and subscribe it to the inbox webhook.")
    else:
        add("Notifications (SNS topic)", True, f"Topic {cfg['inbound_topic_arn']} will be used.")
    return out


async def check_setup(cfg: dict) -> list[dict]:
    return await asyncio.to_thread(_check_setup_sync, cfg)


def _ensure_rule_sync(cfg: dict, domain: str) -> None:
    ses = _client("ses", cfg)
    bucket = cfg.get("inbound_bucket")
    if not bucket:
        raise MailSetupError("The inbox isn't set up on this platform yet: no inbound S3 bucket is configured in the Amazon SES settings. Ask your administrator.")
    try:
        active = (ses.describe_active_receipt_rule_set().get("Metadata") or {}).get("Name")
    except Exception as e:  # noqa: BLE001
        raise MailSetupError(explain(e, cfg, "Could not read the SES receiving settings")) from e
    try:
        if not active:
            try:
                ses.create_receipt_rule_set(RuleSetName=RULE_SET)
            except Exception as e:  # noqa: BLE001
                if _code(e) != "AlreadyExists":
                    raise
            ses.set_active_receipt_rule_set(RuleSetName=RULE_SET)
        elif active != RULE_SET:
            raise MailSetupError(f"Another SES receipt rule set ('{active}') is already active in this AWS region, and LeadBangla won't replace it. Ask your administrator to add LeadBangla's rule there or switch the rule set.")
        s3 = {"BucketName": bucket, "ObjectKeyPrefix": f"{cfg.get('inbound_prefix', 'inbox/')}{domain}/"}
        if cfg.get("inbound_topic_arn"):
            s3["TopicArn"] = cfg["inbound_topic_arn"]
        rule = {"Name": "lb-" + domain.replace(".", "-")[:60], "Enabled": True, "TlsPolicy": "Optional", "Recipients": [domain],
                "Actions": [{"S3Action": s3}], "ScanEnabled": True}
        try:
            ses.create_receipt_rule(RuleSetName=RULE_SET, Rule=rule)
        except Exception as e:  # noqa: BLE001
            if _code(e) == "AlreadyExists":
                ses.update_receipt_rule(RuleSetName=RULE_SET, Rule=rule)
            else:
                raise
    except MailSetupError:
        raise
    except Exception as e:  # noqa: BLE001
        code = _code(e)
        if code == "InvalidS3Configuration":
            raise MailSetupError(f"SES can't write to the bucket '{bucket}'. Add the bucket policy that allows SES to put objects (see the setup guide).") from e
        if code == "InvalidSnsTopic":
            raise MailSetupError("SES can't publish to the SNS topic. Add the topic policy that allows SES to publish (see the setup guide).") from e
        raise MailSetupError(explain(e, cfg, "Could not create the receiving rule")) from e


async def ensure_rule(cfg: dict, domain: str) -> None:
    await asyncio.to_thread(_ensure_rule_sync, cfg, domain)


def _remove_rule_sync(cfg: dict, domain: str) -> None:
    try:
        _client("ses", cfg).delete_receipt_rule(RuleSetName=RULE_SET, RuleName="lb-" + domain.replace(".", "-")[:60])
    except Exception:  # noqa: BLE001 — already gone, or not ours: nothing to undo
        pass


async def remove_rule(cfg: dict, domain: str) -> None:
    await asyncio.to_thread(_remove_rule_sync, cfg, domain)


async def fetch_raw(cfg: dict, bucket: str, key: str) -> bytes:
    def _get() -> bytes:
        obj = _client("s3", cfg).get_object(Bucket=bucket, Key=key)
        if (obj.get("ContentLength") or 0) > MAX_RAW_BYTES:
            raise MailSetupError("This email is larger than 40 MB and was skipped.")
        return obj["Body"].read()
    try:
        return await asyncio.to_thread(_get)
    except MailSetupError:
        raise
    except Exception as e:  # noqa: BLE001
        raise MailSetupError(explain(e, cfg, "Could not read the received email from S3")) from e


async def delete_raw(cfg: dict, bucket: str, key: str) -> None:
    try:
        await asyncio.to_thread(lambda: _client("s3", cfg).delete_object(Bucket=bucket, Key=key))
    except Exception:  # noqa: BLE001 — retention cleanup is best-effort
        pass


async def send_raw(cfg: dict, raw: bytes, *, from_email: str, recipients: list[str]) -> str:
    """Send a fully built MIME message (threading headers, attachments). Returns SES's message id."""
    def _send() -> str:
        kw = {"ConfigurationSetName": cfg["configuration_set"]} if cfg.get("configuration_set") else {}
        r = _client("sesv2", cfg).send_email(FromEmailAddress=from_email, Destination={"ToAddresses": recipients},
                                              Content={"Raw": {"Data": raw}}, **kw)
        return r["MessageId"]
    try:
        return await asyncio.to_thread(_send)
    except Exception as e:  # noqa: BLE001
        raise EmailSendError(friendly_ses_error(e, region=cfg["region"], sender=from_email, recipient=recipients[0] if recipients else "")) from e
