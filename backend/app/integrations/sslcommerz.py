import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.service_creds import get_live_creds


class SSLCommerzSessionError(Exception):
    pass


class SSLCommerzClient:
    """Wraps SSLCommerz's sandbox API.

    Falls back to a local fake checkout page when no real sandbox
    credentials are configured, so the subscribe -> pay -> active flow is
    testable without first registering a SSLCommerz developer account.

    Credentials are resolved per call: live credentials stored via the
    admin Integration Hub (Step 27) take priority, then the
    SSLCOMMERZ_STORE_ID/SSLCOMMERZ_STORE_PASSWORD env vars, then the fake
    checkout page.
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
        fake_checkout_path: str = "/api/v1/billing/fake-checkout",
    ) -> str:
        """Returns the URL the browser should be redirected to for payment."""
        creds = await get_live_creds(db, "sslcommerz")
        if creds is None:
            # Must go through the /api prefix so Nginx/Vite's proxy routes it
            # to the backend instead of falling through to the frontend SPA.
            # fake_checkout_path lets different flows (plan checkout, wallet
            # top-up) each land on their own fake-checkout route.
            return f"{fake_checkout_path}?tran_id={tran_id}"

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
            return True

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
