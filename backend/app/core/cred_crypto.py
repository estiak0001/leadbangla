import base64
import hashlib
import json

from cryptography.fernet import Fernet

from app.core.config import settings


def _get_key() -> bytes:
    if settings.service_cred_key:
        return settings.service_cred_key.encode()
    # Dev fallback: derive from jwt_secret — not safe for production, but
    # keeps credential storage functional without a separate secret to set up.
    raw = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return base64.urlsafe_b64encode(raw)


def encrypt_creds(data: dict) -> str:
    return Fernet(_get_key()).encrypt(json.dumps(data).encode()).decode()


def decrypt_creds(ciphertext: str) -> dict:
    return json.loads(Fernet(_get_key()).decrypt(ciphertext.encode()).decode())
