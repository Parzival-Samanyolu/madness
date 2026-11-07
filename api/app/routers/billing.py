"""Billing placeholder. Plans + quotas already work; wire Stripe here when you want paid plans.

To enable later:
 1. pip install stripe, set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env
 2. Create a Checkout Session in /api/billing/checkout with metadata user_id
 3. In the webhook, on 'checkout.session.completed' set user.plan = "pro";
    on 'customer.subscription.deleted' set it back to "free".
"""
from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import get_settings
from ..models import User
from ..security import current_user

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.post("/checkout")
def checkout(user: User = Depends(current_user)):
    raise HTTPException(501, "Paid plans are coming soon")


@router.post("/webhook")
async def webhook(request: Request):
    if not get_settings().stripe_webhook_secret:
        raise HTTPException(501, "Billing is not enabled")
    raise HTTPException(501, "Stripe webhook not implemented yet")
