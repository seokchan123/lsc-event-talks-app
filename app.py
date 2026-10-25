import os
import re
import time
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_DURATION_SECONDS = 300  # 5 minutes

# In-memory cache
feed_cache = {
    "data": None,
    "last_fetched_epoch": 0,
    "last_fetched_str": None,
    "last_error": None
}

def clean_and_fix_html(soup):
    """Ensure all links in the snippet are absolute and open safely in a new tab."""
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("/"):
            if href.startswith("/bigquery") or href.startswith("/reference"):
                a["href"] = "https://docs.cloud.google.com" + href
            else:
                a["href"] = "https://cloud.google.com" + href
        a["target"] = "_blank"
        a["rel"] = "noopener noreferrer"
    return soup

def create_tweet_draft(category, date_str, plain_text, link):
    """
    Generate an engaging tweet draft that fits comfortably within 280 characters.
    Twitter reserves 23 characters for URLs.
    Target structure:
    🚀 BigQuery [Category] (<date>): <summary> <link> #BigQuery #GoogleCloud
    """
    emoji_map = {
        "Feature": "✨",
        "Change": "🔄",
        "Announcement": "📢",
        "Fixed": "🛠️",
        "Deprecated": "⚠️"
    }
    emoji = emoji_map.get(category, "🚀")
    
    header = f"{emoji} BigQuery [{category}] ({date_str}):"
    hashtags = "#BigQuery #GoogleCloud"
    
    # Twitter counts t.co links as 23 characters.
    # Max text budget = 280 - 23 (url) - len(hashtags) - 4 (spaces/newlines) - len(header)
    allowed_summary_length = 280 - 24 - len(hashtags) - len(header) - 4
    if allowed_summary_length < 50:
        allowed_summary_length = 80
        
    # Clean up whitespace
    clean_text = re.sub(r"\s+", " ", plain_text).strip()
    
    if len(clean_text) > allowed_summary_length:
        # Truncate at word boundary
        truncated = clean_text[:allowed_summary_length]
        last_space = truncated.rfind(" ")
        if last_space > allowed_summary_length // 2:
            truncated = truncated[:last_space]
        summary = truncated.rstrip(",. ") + "..."
    else:
        summary = clean_text
        
    return f"{header} {summary} {link} {hashtags}".strip()

def fetch_and_parse_feed(force_refresh=False):
    """Fetch the BigQuery release notes XML and parse into structured entries and updates."""
    now = time.time()
    
    # Return cached data if valid and force_refresh is False
    if not force_refresh and feed_cache["data"] and (now - feed_cache["last_fetched_epoch"] < CACHE_DURATION_SECONDS):
        return feed_cache["data"], None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
    }
    
    try:
        resp = requests.get(FEED_URL, headers=headers, timeout=12)
        resp.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(resp.content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        entries_data = []
        all_updates = []
        category_counts = {}
        
        raw_entries = root.findall("atom:entry", ns)
        
        for entry_idx, entry in enumerate(raw_entries):
            title = (entry.find("atom:title", ns).text or "").strip()
            link_el = entry.find("atom:link", ns)
            link = link_el.attrib.get("href", "").strip() if link_el is not None else ""
            updated = (entry.find("atom:updated", ns).text or "").strip()
            entry_id = (entry.find("atom:id", ns).text or f"entry-{entry_idx}").strip()
            
            content_el = entry.find("atom:content", ns)
            raw_html = content_el.text if content_el is not None else ""
            soup = BeautifulSoup(raw_html, "html.parser")
            clean_and_fix_html(soup)
            
            # Segment into discrete updates by <h3> headers
            items = []
            current_category = "Feature"  # default
            current_elements = []
            
            for child in soup.children:
                if getattr(child, "name", None) == "h3":
                    if current_elements:
                        items.append((current_category, current_elements))
                        current_elements = []
                    current_category = child.get_text(strip=True) or "Feature"
                elif child.name or (isinstance(child, str) and child.strip()):
                    current_elements.append(child)
                    
            if current_elements:
                items.append((current_category, current_elements))
                
            if not items and soup.get_text(strip=True):
                items.append(("Feature", list(soup.children)))
                
            entry_updates = []
            for update_idx, (cat, elements) in enumerate(items):
                item_soup = BeautifulSoup("".join(str(x) for x in elements), "html.parser")
                clean_and_fix_html(item_soup)
                
                plain_text = re.sub(r"\s+", " ", item_soup.get_text(" ", strip=True)).strip()
                update_id = f"up-{entry_idx}-{update_idx}"
                
                # Category tally
                cat_normalized = cat.strip().capitalize()
                category_counts[cat_normalized] = category_counts.get(cat_normalized, 0) + 1
                
                # Pre-format tweet
                tweet_draft = create_tweet_draft(cat_normalized, title, plain_text, link)
                
                update_obj = {
                    "id": update_id,
                    "entry_id": entry_id,
                    "category": cat_normalized,
                    "date": title,
                    "link": link,
                    "html": str(item_soup),
                    "plain_text": plain_text,
                    "tweet_draft": tweet_draft
                }
                entry_updates.append(update_obj)
                all_updates.append(update_obj)
                
            entries_data.append({
                "id": entry_id,
                "title": title,
                "date": title,
                "link": link,
                "updated": updated,
                "updates": entry_updates
            })
            
        current_time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        
        parsed_data = {
            "status": "success",
            "feed_url": FEED_URL,
            "fetched_at": current_time_str,
            "fetched_epoch": now,
            "total_entries": len(entries_data),
            "total_updates": len(all_updates),
            "category_counts": category_counts,
            "entries": entries_data,
            "all_updates": all_updates
        }
        
        feed_cache["data"] = parsed_data
        feed_cache["last_fetched_epoch"] = now
        feed_cache["last_fetched_str"] = current_time_str
        feed_cache["last_error"] = None
        
        return parsed_data, None
        
    except Exception as e:
        feed_cache["last_error"] = str(e)
        # If we have cached data, return it with a warning
        if feed_cache["data"]:
            stale_data = dict(feed_cache["data"])
            stale_data["warning"] = f"Using cached data. Live refresh failed: {str(e)}"
            return stale_data, None
        return None, str(e)

@app.route("/")
def index():
    """Render the main single page application."""
    return render_template("index.html")

@app.route("/api/release-notes")
def api_release_notes():
    """API endpoint to get the release notes, optionally forcing a refresh."""
    force_refresh = request.args.get("refresh", "false").lower() in ("true", "1", "yes")
    data, error = fetch_and_parse_feed(force_refresh=force_refresh)
    
    if error and not data:
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch BigQuery release notes: {error}",
            "feed_url": FEED_URL
        }), 502
        
    return jsonify(data)

@app.route("/api/refresh", methods=["POST", "GET"])
def api_refresh():
    """Explicit refresh endpoint with force_refresh enabled."""
    data, error = fetch_and_parse_feed(force_refresh=True)
    if error and not data:
        return jsonify({
            "status": "error",
            "message": f"Failed to refresh feed: {error}"
        }), 502
    return jsonify(data)

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "cached": feed_cache["data"] is not None,
        "last_fetched": feed_cache["last_fetched_str"]
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting BigQuery Release Notes App on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
