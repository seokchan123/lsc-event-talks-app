import pytest
from feed_parser import parse_feed_xml, clean_html_to_text, extract_headline

SAMPLE_ATOM_XML = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:google.com,2016:bigquery-release-notes</id>
  <title>BigQuery - Release notes</title>
  <updated>2026-10-22T00:00:00-07:00</updated>
  <entry>
    <title>October 22, 2026</title>
    <id>tag:google.com,2016:bigquery-release-notes#October_22_2026</id>
    <updated>2026-10-22T00:00:00-07:00</updated>
    <link rel="alternate" href="https://docs.cloud.google.com/bigquery/docs/release-notes#October_22_2026"/>
    <content type="html"><![CDATA[<h3>Feature</h3>
<p>The <a href="https://docs.cloud.google.com/test"><code>AI.TRANSLATE</code> function</a> lets you translate text.</p>
<h3>Announcement</h3>
<p>BigQuery Studio update is now available.</p>
]]>
    </content>
  </entry>
  <entry>
    <title>October 20, 2026</title>
    <id>tag:google.com,2016:bigquery-release-notes#October_20_2026</id>
    <updated>2026-10-20T00:00:00-07:00</updated>
    <link rel="alternate" href="https://docs.cloud.google.com/bigquery/docs/release-notes#October_20_2026"/>
    <content type="html"><![CDATA[<p>General update with no h3 tag.</p>]]>
    </content>
  </entry>
</feed>
"""

def test_clean_html_to_text():
    html = "<p>Hello <strong>World</strong>! &amp; welcome &lt;here&gt;.<br>New line.</p>"
    clean = clean_html_to_text(html)
    assert clean == "Hello World! & welcome <here>. New line."

def test_extract_headline():
    html = '<p>The <code>AI.TRANSLATE</code> function lets you translate text.</p>'
    text = "The AI.TRANSLATE function lets you translate text."
    headline = extract_headline(html, text, "Feature")
    assert "AI.TRANSLATE" in headline

def test_parse_feed_xml():
    parsed = parse_feed_xml(SAMPLE_ATOM_XML)
    assert parsed["title"] == "BigQuery - Release notes"
    assert parsed["items_count"] == 3  # 2 from first entry, 1 from second entry
    assert "Feature" in parsed["categories"]
    assert "Announcement" in parsed["categories"]
    assert "General" in parsed["categories"]

    first_item = parsed["items"][0]
    assert first_item["date"] == "October 22, 2026"
    assert first_item["category"] == "Feature"
    assert "AI.TRANSLATE" in first_item["summary_text"]
    assert first_item["link"] == "https://docs.cloud.google.com/bigquery/docs/release-notes#October_22_2026"

    second_item = parsed["items"][1]
    assert second_item["date"] == "October 22, 2026"
    assert second_item["category"] == "Announcement"
    assert "BigQuery Studio" in second_item["summary_text"]

    third_item = parsed["items"][2]
    assert third_item["date"] == "October 20, 2026"
    assert third_item["category"] == "General"
    assert "General update with no h3 tag." in third_item["summary_text"]
