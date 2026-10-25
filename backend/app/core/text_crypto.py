"""Encrypts message bodies at rest (same key as stored credentials)."""
from cryptography.fernet import Fernet, InvalidToken

from app.core.cred_crypto import _get_key

PREFIX = "m1:"


def seal(text: str | None) -> str | None:
    if text is None:
        return None
    return PREFIX + Fernet(_get_key()).encrypt(text.encode()).decode()


def unseal(stored: str | None) -> str:
    if not stored:
        return ""
    if not stored.startswith(PREFIX):
        return stored
    try:
        return Fernet(_get_key()).decrypt(stored[len(PREFIX):].encode()).decode()
    except InvalidToken:
        return "(this message can't be decrypted — the encryption key changed)"
