"""
Payment processing routes using Stripe integration.
Handles subscription management, checkout sessions, and payment verification.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from ..utils.auth import verify_token_middleware
from ..utils.log import logger
from ..services.payment_service import PaymentService

router = APIRouter(tags=["payments"])

# Pydantic models
class CheckoutSessionRequest(BaseModel):
    plan: str = "freemium"


class CheckoutSessionResponse(BaseModel):
    id: str
    url: str


class PaymentVerificationRequest(BaseModel):
    session_id: str


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: CheckoutSessionRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Create a Stripe checkout session"""
    try:
        result = await PaymentService.create_checkout_session(request.plan, user)
        return CheckoutSessionResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkout session creation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout session"
        )


@router.post("/verify")
async def verify_payment(
    request: PaymentVerificationRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Verify a payment session"""
    try:
        result = await PaymentService.verify_payment(request.session_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Payment verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify payment"
        )


@router.get("/subscription-status")
async def get_subscription_status(user: dict = Depends(verify_token_middleware)):
    """Get current user's subscription status"""
    try:
        result = await PaymentService.get_subscription_status(user)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get subscription status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get subscription status"
        )
