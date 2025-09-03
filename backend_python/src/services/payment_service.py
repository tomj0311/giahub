"""
Payment Service

This service handles all payment-related business logic including subscription management,
checkout sessions, and payment verification using Stripe.
"""

import os
from typing import Dict, Any
from fastapi import HTTPException, status
import stripe

from ..utils.log import logger


class PaymentService:
    """Service for handling payment operations"""
    
    # Configure Stripe
    stripe.api_key = os.getenv('STRIPE_SECRET_KEY', 'sk_test')
    
    # Plan prices in cents
    PLAN_PRICES = {
        'freemium': 0,
        'consultation': 5000,  # $50.00 in cents
        'enterprise': 10000    # $100.00 in cents
    }
    
    @classmethod
    async def create_checkout_session(cls, plan: str, user: Dict[str, Any]) -> Dict[str, str]:
        """Create a Stripe checkout session"""
        user_id = user.get("id", "unknown")
        tenant_id = user.get("tenantId", "unknown")
        logger.info(f"[PAYMENT] Creating checkout session for plan: {plan}, user: {user_id}, tenant: {tenant_id}")
        
        try:
            price = cls.PLAN_PRICES.get(plan, 0)
            logger.debug(f"[PAYMENT] Plan price: ${price/100:.2f} for plan: {plan}")
            
            client_url = os.getenv('CLIENT_URL', 'http://localhost:5173')
            logger.debug(f"[PAYMENT] Using client URL: {client_url}")
            
            # Create Stripe checkout session
            logger.debug(f"[PAYMENT] Creating Stripe checkout session for user: {user_id}")
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': f'{plan.title()} Plan',
                        },
                        'unit_amount': price,
                    },
                    'quantity': 1,
                }],
                mode='payment' if price > 0 else 'setup',
                success_url=f'{client_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}',
                cancel_url=f'{client_url}/payment/cancel',
                customer_email=user.get('email'),
                metadata={
                    'user_id': user.get('id'),
                    'plan': plan
                }
            )
            
            logger.info(f"[PAYMENTS] Created checkout session for user {user.get('id')}, plan: {plan}")
            
            return {
                "id": session.id,
                "url": session.url
            }
            
        except Exception as e:
            logger.error(f"[PAYMENTS] Failed to create checkout session: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create checkout session"
            )
    
    @classmethod
    async def verify_payment(cls, session_id: str) -> Dict[str, Any]:
        """Verify a payment session"""
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            
            if session.payment_status == 'paid':
                logger.info(f"[PAYMENTS] Payment verified for session: {session_id}")
                return {
                    "verified": True,
                    "user_id": session.metadata.get('user_id'),
                    "plan": session.metadata.get('plan'),
                    "amount": session.amount_total,
                    "currency": session.currency
                }
            else:
                logger.warning(f"[PAYMENTS] Payment not completed for session: {session_id}")
                return {
                    "verified": False,
                    "status": session.payment_status
                }
                
        except Exception as e:
            logger.error(f"[PAYMENTS] Failed to verify payment: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to verify payment"
            )
    
    @classmethod
    async def get_subscription_status(cls, user: Dict[str, Any]) -> Dict[str, Any]:
        """Get user's subscription status"""
        try:
            # This would typically check your database for user's subscription
            # For now, return a basic response
            return {
                "user_id": user.get('id'),
                "plan": "freemium",  # Default plan
                "status": "active",
                "expires_at": None
            }
            
        except Exception as e:
            logger.error(f"[PAYMENTS] Failed to get subscription status: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get subscription status"
            )
