import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.service_creds import get_live_creds


class SSLCommerzSessionError(Exception):
    pass


class SSLCommerzClient:
    """Wraps the SSLCommerz API.

    Credentials are resolved per call: those saved in the admin Integration Hub
    take priority, then the SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD env
    vars. With neither, online payment is simply unavailable.
    """

    async def init_session(
        self,
        db: AsyncSession,
        *,
        tran_id: str,
        amount_bdt: int,
        customer_email: str,
        success_url: str,
        fail_url: str,
        cancel_url: str,
        ipn_url: str,
        product_name: str,
    ) -> str:
        """Returns the URL the browser should be redirected to for payment."""
        creds = await get_live_creds(db, "sslcommerz")
        if creds is None:
            raise SSLCommerzSessionError("Online payment is not available right now")

        base_url = creds.get("sandbox_base_url", "https://sandbox.sslcommerz.com")
        payload = {
            "store_id": creds["store_id"],
            "store_passwd": creds["store_password"],
            "total_amount": amount_bdt,
            "currency": "BDT",
            "tran_id": tran_id,
            "success_url": success_url,
            "fail_url": fail_url,
            "cancel_url": cancel_url,
            "ipn_url": ipn_url,
            "cus_name": customer_email,
            "cus_email": customer_email,
            "cus_add1": "N/A",
            "cus_city": "Dhaka",
            "cus_postcode": "1000",
            "cus_country": "Bangladesh",
            "cus_phone": "00000000000",
            "shipping_method": "NO",
            "product_name": product_name,
            "product_category": "Subscription",
            "product_profile": "general",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(f"{base_url}/gwprocess/v4/api.php", data=payload)
            response.raise_for_status()
            body = response.json()

        if body.get("status") != "SUCCESS":
            raise SSLCommerzSessionError(body.get("failedreason", "session init failed"))
        return body["GatewayPageURL"]

    async def validate_transaction(self, db: AsyncSession, val_id: str) -> bool:
        creds = await get_live_creds(db, "sslcommerz")
        if creds is None:
            return False  # never confirm a payment we cannot verify

        base_url = creds.get("sandbox_base_url", "https://sandbox.sslcommerz.com")
        params = {
            "val_id": val_id,
            "store_id": creds["store_id"],
            "store_passwd": creds["store_password"],
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{base_url}/validator/api/validationserverAPI.php", params=params)
            response.raise_for_status()
            body = response.json()
        return body.get("status") in {"VALID", "VALIDATED"}


sslcommerz_client = SSLCommerzClient()
