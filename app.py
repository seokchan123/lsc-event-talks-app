import os
import time
import logging
from flask import Flask, render_template, jsonify, request
from feed_parser import fetch_and_parse_feed

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

# In-memory cache for feed data
_cache = {
    "data": None,
    "last_fetched": 0,
    "ttl_seconds": 600  # 10 minutes cache TTL
}


def get_releases_data(force_refresh: bool = False):
    """Retrieves feed data from cache or fetches new data if expired/forced."""
    now = time.time()
    cache_is_stale = (now - _cache["last_fetched"]) > _cache["ttl_seconds"]

    if not force_refresh and not cache_is_stale and _cache["data"] is not None:
        logger.info("Serving BigQuery releases from in-memory cache.")
        return _cache["data"], False, None

    logger.info("Fetching fresh BigQuery releases (force_refresh=%s, cache_stale=%s)...", force_refresh, cache_is_stale)
    try:
        data = fetch_and_parse_feed()
        _cache["data"] = data
        _cache["last_fetched"] = now
        return data, True, None
    except Exception as exc:
        logger.error("Failed to fetch fresh feed: %s", exc)
        if _cache["data"] is not None:
            # Fall back to stale cache if available
            return _cache["data"], False, f"Failed to refresh from source ({exc}). Serving cached data."
        raise exc


@app.route("/")
def index():
    """Serves the main single-page application."""
    return render_template("index.html")


@app.route("/api/releases")
def api_releases():
    """Returns parsed BigQuery release notes as JSON."""
    force_refresh = request.args.get("refresh", "").lower() in ("true", "1", "yes")
    try:
        data, is_fresh, warning_msg = get_releases_data(force_refresh=force_refresh)
        response_payload = dict(data)
        response_payload["cached"] = not is_fresh
        response_payload["last_fetched_epoch"] = _cache["last_fetched"]
        if warning_msg:
            response_payload["warning"] = warning_msg
        return jsonify(response_payload)
    except Exception as exc:
        logger.exception("Error loading release notes")
        return jsonify({"error": "Failed to load release notes", "details": str(exc)}), 502


@app.route("/api/health")
def api_health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "has_cached_data": _cache["data"] is not None,
        "items_count": len(_cache["data"]["items"]) if _cache["data"] else 0,
        "last_fetched_epoch": _cache["last_fetched"]
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("true", "1")
    app.run(host="0.0.0.0", port=port, debug=debug)
