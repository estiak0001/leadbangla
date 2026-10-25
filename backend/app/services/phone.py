import re

_BD_MOBILE = re.compile(r"^8801[3-9]\d{8}$")


def normalize_bd_msisdn(phone: str) -> str:
    """Return a Bangladeshi mobile number as 8801XXXXXXXXX (what SMS gateways expect).

    Accepts 01712345678, 1712345678, +8801712345678, 008801712-345678, spaces/dashes.
    Raises ValueError for anything that isn't a valid BD mobile number."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("00880"):
        digits = digits[2:]
    if digits.startswith("880"):
        pass
    elif digits.startswith("01") and len(digits) == 11:
        digits = "88" + digits
    elif digits.startswith("1") and len(digits) == 10:
        digits = "880" + digits
    if not _BD_MOBILE.match(digits):
        raise ValueError(f"'{phone}' is not a valid Bangladeshi mobile number (expected 01XXXXXXXXX)")
    return digits
