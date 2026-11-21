"""Shared HTTP helper for external API calls.

Every external call goes through `request_json` so it gets the 8 second
timeout, a timing log line and one error type (`ExternalAPIError`) that
callers catch to apply their fallback.
"""

import logging
import time

import requests

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 8

# Wikimedia asks API clients to send a descriptive User-Agent.
USER_AGENT = 'Venturing/0.1 (hackathon project)'


class ExternalAPIError(Exception):
    """An external API call failed (network error, timeout, bad status or bad JSON)."""


def request_json(method, url, *, label, headers=None, **kwargs):
    """Make an HTTP request and return the parsed JSON body.

    `label` names the call in the timing log, e.g. "google.nearby".
    Raises ExternalAPIError on any failure.
    """
    headers = {'User-Agent': USER_AGENT, **(headers or {})}
    start = time.monotonic()
    try:
        resp = requests.request(method, url, headers=headers, timeout=TIMEOUT_SECONDS, **kwargs)
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.info('%s %s in %.0fms', label, resp.status_code, elapsed_ms)
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as exc:
        body = exc.response.text[:300] if exc.response is not None else ''
        logger.warning('%s failed: %s %s', label, exc, body)
        raise ExternalAPIError(f'{label} failed: {exc}') from exc
    except (requests.RequestException, ValueError) as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.warning('%s failed after %.0fms: %s', label, elapsed_ms, exc)
        raise ExternalAPIError(f'{label} failed: {exc}') from exc
