"""Shared HTTP helper for external API calls.

Every external call goes through `request_json` so it gets the 8 second
timeout, a timing log line and one error type (`ExternalAPIError`) that
callers catch to apply their fallback.
"""

import logging
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 8

# Wikimedia asks API clients to send a descriptive User-Agent with contact info
# (https://meta.wikimedia.org/wiki/User-Agent_policy) and rate-limits ones without it.
USER_AGENT_BASE = 'Venturing/0.1'


def user_agent():
    """e.g. "Venturing/0.1 (https://github.com/me/app; hackathon project)". Contact comes from WIKI_CONTACT."""
    contact = settings.WIKI_CONTACT
    return f'{USER_AGENT_BASE} ({contact}; hackathon project)' if contact else f'{USER_AGENT_BASE} (hackathon project)'


class ExternalAPIError(Exception):
    """An external API call failed (network error, timeout, bad status or bad JSON)."""


def unexpected(exc):
    """True if `exc` is a bug rather than an upstream failure.

    Fallback code catches every exception so a request never crashes, and
    passes `exc_info=unexpected(exc)` so real bugs still get a traceback in the log.
    """
    return not isinstance(exc, ExternalAPIError)


def request_json(method, url, *, label, headers=None, **kwargs):
    """Make an HTTP request and return the parsed JSON body.

    `label` names the call in the timing log, e.g. "google.nearby".
    Raises ExternalAPIError on any failure, including a body that isn't a JSON
    object (every API we call returns one).
    """
    headers = {'User-Agent': user_agent(), **(headers or {})}
    start = time.monotonic()
    try:
        resp = requests.request(method, url, headers=headers, timeout=TIMEOUT_SECONDS, **kwargs)
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.info('%s %s in %.0fms', label, resp.status_code, elapsed_ms)
        resp.raise_for_status()
        data = resp.json()
    except requests.HTTPError as exc:
        body = exc.response.text[:300] if exc.response is not None else ''
        logger.warning('%s failed: %s %s', label, exc, body)
        raise ExternalAPIError(f'{label} failed: {exc}') from exc
    except (requests.RequestException, ValueError) as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.warning('%s failed after %.0fms: %s', label, elapsed_ms, exc)
        raise ExternalAPIError(f'{label} failed: {exc}') from exc

    if not isinstance(data, dict):
        logger.warning('%s returned %s, expected a JSON object', label, type(data).__name__)
        raise ExternalAPIError(f'{label} returned {type(data).__name__}, expected a JSON object')
    return data
