import re
import urllib.parse
from html import unescape
import xml.etree.ElementTree as ET
import requests

DEFAULT_FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}


def find_elem(parent, path_with_ns: str, path_without_ns: str = None):
    """Safely find XML element without boolean evaluation of Element."""
    el = parent.find(path_with_ns, ATOM_NS)
    if el is not None:
        return el
    if path_without_ns:
        el_fallback = parent.find(path_without_ns)
        if el_fallback is not None:
            return el_fallback
    return None


def clean_html_to_text(html_content: str) -> str:
    """Strips HTML tags and normalizes whitespace."""
    if not html_content:
        return ""
    # Replace <br> or </p> or </li> or </h\d> with spaces to preserve word boundaries
    text = re.sub(r'<(?:br|/p|/li|/h\d)[^>]*>', ' ', html_content, flags=re.IGNORECASE)
    # Remove remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Unescape HTML entities (&amp;, &#39;, &quot;, etc.)
    text = unescape(text)
    # Collapse multiple whitespaces
    return " ".join(text.split())


def extract_headline(html_content: str, clean_text: str, category: str) -> str:
    """Extracts a concise headline from code, bold tags, or first sentence."""
    # Look for code or strong or link near the beginning
    match = re.search(r'<(?:code|strong|a)[^>]*>(.*?)</(?:code|strong|a)>', html_content[:200], flags=re.IGNORECASE)
    if match:
        snippet = clean_html_to_text(match.group(1)).strip()
        if 3 <= len(snippet) <= 60:
            return snippet

    # Fallback to the first sentence of the text
    sentences = re.split(r'(?<=[.!?])\s+', clean_text)
    if sentences and sentences[0]:
        first_sentence = sentences[0].strip()
        if len(first_sentence) > 90:
            return first_sentence[:87] + "..."
        return first_sentence

    return f"{category} Update"


def parse_feed_xml(xml_content: str) -> dict:
    """Parses Atom XML string into structured release note entries."""
    root = ET.fromstring(xml_content)

    # Feed-level metadata
    feed_title_elem = find_elem(root, "atom:title", "title")
    feed_title = feed_title_elem.text if feed_title_elem is not None and feed_title_elem.text else "BigQuery - Release notes"

    feed_updated_elem = find_elem(root, "atom:updated", "updated")
    feed_updated = feed_updated_elem.text if feed_updated_elem is not None and feed_updated_elem.text else ""

    entries = root.findall("atom:entry", ATOM_NS)
    # Fallback for feeds without namespace
    if not entries:
        entries = root.findall("entry")

    all_items = []
    category_counts = {}

    for entry_idx, entry in enumerate(entries):
        # Entry date / title
        title_elem = find_elem(entry, "atom:title", "title")
        date_str = title_elem.text.strip() if title_elem is not None and title_elem.text else f"Update {entry_idx + 1}"

        # Entry alternate link
        link = ""
        link_elem = find_elem(entry, "atom:link[@rel='alternate']")
        if link_elem is None:
            link_elem = find_elem(entry, "atom:link", "link")
        if link_elem is not None:
            link = link_elem.attrib.get("href", "")

        # Entry updated date
        updated_elem = find_elem(entry, "atom:updated", "updated")
        entry_updated = updated_elem.text.strip() if updated_elem is not None and updated_elem.text else ""

        # Content HTML
        content_elem = find_elem(entry, "atom:content", "content")
        raw_content = content_elem.text if content_elem is not None and content_elem.text else ""

        # Split by <h3>Category</h3>
        parts = re.split(r'<h3>(.*?)</h3>', raw_content, flags=re.IGNORECASE)

        if len(parts) > 1:
            # format: [preamble, category1, content1, category2, content2, ...]
            for i in range(1, len(parts), 2):
                cat = parts[i].strip()
                item_html = parts[i + 1].strip() if i + 1 < len(parts) else ""
                clean_text = clean_html_to_text(item_html)
                headline = extract_headline(item_html, clean_text, cat)
                item_idx = (i // 2)

                safe_date_id = re.sub(r'[^a-zA-Z0-9]+', '_', date_str).strip('_')
                item_id = f"{safe_date_id}_{item_idx}"

                category_counts[cat] = category_counts.get(cat, 0) + 1

                all_items.append({
                    "id": item_id,
                    "date": date_str,
                    "updated": entry_updated,
                    "category": cat,
                    "headline": headline,
                    "summary_text": clean_text,
                    "content_html": item_html,
                    "link": link
                })
        else:
            clean_text = clean_html_to_text(raw_content)
            cat = "General"
            headline = extract_headline(raw_content, clean_text, cat)
            safe_date_id = re.sub(r'[^a-zA-Z0-9]+', '_', date_str).strip('_')
            item_id = f"{safe_date_id}_0"
            category_counts[cat] = category_counts.get(cat, 0) + 1

            all_items.append({
                "id": item_id,
                "date": date_str,
                "updated": entry_updated,
                "category": cat,
                "headline": headline,
                "summary_text": clean_text,
                "content_html": raw_content,
                "link": link
            })

    # Sort categories with Feature and Announcement first, then alphabetical
    def category_sort_key(c):
        prio = {"Feature": 0, "Announcement": 1, "Change": 2, "Fixed": 3}
        return (prio.get(c, 99), c)

    sorted_categories = sorted(category_counts.keys(), key=category_sort_key)

    return {
        "title": feed_title,
        "updated": feed_updated,
        "items_count": len(all_items),
        "categories": sorted_categories,
        "category_counts": category_counts,
        "items": all_items
    }


def fetch_and_parse_feed(feed_url: str = DEFAULT_FEED_URL, timeout: int = 15) -> dict:
    """Fetches the XML feed from the network and parses it."""
    headers = {
        "User-Agent": "BigQueryReleaseNotesApp/1.0 (Mozilla/5.0)",
        "Accept": "application/atom+xml, application/xml, text/xml"
    }
    response = requests.get(feed_url, headers=headers, timeout=timeout)
    response.raise_for_status()
    response.encoding = "utf-8"
    return parse_feed_xml(response.text)
