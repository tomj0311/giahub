import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
import stripe

from ..utils.auth import verify_token_middleware

logger = logging.getLogger(__name__)

router = APIRouter()

# Configure Stripe
stripe.api_key = os.getenv('STRIPE_SECRET_KEY', 'sk_test')

# Pydantic models
class CheckoutSessionRequest(BaseModel):
    plan: str = "freemium"


class CheckoutSessionResponse(BaseModel):
    id: str
    url: str


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: CheckoutSessionRequest,
    user: dict = Depends(verify_token_middleware)
):
    """Create a Stripe checkout session"""
    try:
        # Determine price based on plan
        plan_prices = {
            'freemium': 0,
            'consultation': 5000,  # $50.00 in cents
            'enterprise': 10000    # $100.00 in cents
        }
        
        price = plan_prices.get(request.plan, 0)
        client_url = os.getenv('CLIENT_URL', 'http://localhost:5173')
        
        # Create Stripe checkout session
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f'{request.plan} plan'
                    },
                    'unit_amount': price
                },
                'quantity': 1
            }],
            mode='payment',
            success_url=f'{client_url}/payment-success',
            cancel_url=f'{client_url}/payment-cancel'
        )
        
        return CheckoutSessionResponse(
            id=session.id,
            url=session.url
        )
        
    except stripe.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stripe error"
        )
    except Exception as e:
        logger.error(f"Payment session creation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )
