"""
Shared Google auth helpers for tools.

This module centralizes obtaining Google credentials and building service
clients so the individual tool wrappers stay small. It favors Application
Default Credentials (ADC), using the environment variable
GOOGLE_APPLICATION_CREDENTIALS when present, with optional domain-wide
delegation via a subject email.

Dependencies (add to your requirements):
  - google-api-python-client
  - google-auth
  - google-auth-httplib2
  - google-auth-oauthlib (optional; not used here but handy for future OAuth)
"""
from __future__ import annotations

from typing import Iterable, Optional

from ai.utils.log import logger

try:
    import google.auth
    from google.auth.credentials import Credentials as GoogleCredentials
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
except Exception as e:  # pragma: no cover
    raise ImportError(
        "Google API libraries not installed. Install with:\n"
        "  pip install google-api-python-client google-auth google-auth-httplib2 google-auth-oauthlib"
    ) from e


def get_credentials(
    scopes: Iterable[str],
    *,
    credentials_file: Optional[str] = None,
    subject: Optional[str] = None,
) -> GoogleCredentials:
    """Return Google credentials using ADC or a service account file.

    Order:
      1) If credentials_file is provided, load service account credentials.
         If subject is provided, perform domain-wide delegation.
      2) Otherwise use google.auth.default with the requested scopes.
    """
    scope_list = list(scopes)
    if credentials_file:
        logger.debug("Loading Google service account credentials from file")
        creds = service_account.Credentials.from_service_account_file(credentials_file, scopes=scope_list)
        if subject:
            logger.debug("Applying domain-wide delegation to subject user")
            creds = creds.with_subject(subject)
        return creds

    logger.debug("Attempting to use Application Default Credentials (ADC)")
    creds, _ = google.auth.default(scopes=scope_list)
    return creds


def build_service(
    service_name: str,
    version: str,
    scopes: Iterable[str],
    *,
    credentials_file: Optional[str] = None,
    subject: Optional[str] = None,
):
    """Build and return a googleapiclient service client with the given scopes."""
    creds = get_credentials(scopes, credentials_file=credentials_file, subject=subject)
    logger.info(f"Building Google service client: {service_name} v{version}")
    return build(service_name, version, credentials=creds, cache_discovery=False)
