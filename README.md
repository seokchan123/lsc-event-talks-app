# BigQuery Release Notes Explorer & Tweet Sharer

A web application built with **Python Flask** and **plain vanilla HTML5, CSS3, and modern JavaScript** that fetches and parses the official BigQuery release notes feed ([Google Cloud Feed](https://docs.cloud.google.com/feeds/bigquery-release-notes.xml)), displays them with interactive filtering, and lets you select any update to compose and share on Twitter / X.

---

## Features

- **Live XML Feed Fetching**: Automatically parses the Atom XML feed from Google Cloud documentation.
- **Granular Update Extraction**: Breaks down multi-announcement daily batches into distinct, selectable update cards categorized by `Feature`, `Announcement`, `Change`, and `Fixed`.
- **On-Demand Refresh with Modern Spinner**:
  - Refresh button triggers immediate re-fetch from the source.
  - Implements an accessible, high-performance `<progress>` spinner with conic gradient styling and `@media (prefers-reduced-motion: reduce)` support.
- **Interactive Search & Category Filters**:
  - Instant live keyword filtering across titles, summaries, dates, and categories.
  - Category pill filter showing real-time item counts.
- **Tweet / X Integration**:
  - Direct 1-click "Tweet" button on every release card.
  - Multi-select capability to tweet batches of updates.
  - Dedicated Tweet Composer Modal (`<dialog>`):
    - Live character counter with warning limits (280 chars max).
    - Auto-formatted tweet draft with date, category, summary, link, and hashtags (`#BigQuery #GoogleCloud`).
    - Editable text field to refine commentary before posting.
    - One-click copy to clipboard with instant feedback.
    - Direct "Post on X / Twitter" launcher via Twitter Web Intent (no API keys required).

---

## Quickstart

### 1. Requirements
- Python 3.10+

### 2. Setup Virtual Environment
```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

### 3. Run the Application
```powershell
.\.venv\Scripts\python.exe app.py
```

Open your browser to:
[http://127.0.0.1:5000](http://127.0.0.1:5000)

### 4. Run Automated Tests
```powershell
.\.venv\Scripts\python.exe -m pytest -v tests/
```

---

## Project Structure
```
bq-releases-notes/
├── app.py                  # Flask backend & REST API endpoints
├── feed_parser.py          # Atom XML fetcher, cleaner & parser
├── pytest.ini              # Pytest configuration
├── requirements.txt        # Python dependencies
├── static/
│   ├── css/
│   │   └── style.css       # Vanilla CSS3 with design tokens & modern spinner
│   └── js/
│       └── app.js          # Vanilla JavaScript for UI state, search, dialog & X intent
├── templates/
│   └── index.html          # Semantic HTML5 template
├── tests/
│   ├── test_app.py         # Flask integration route tests
│   └── test_parser.py      # XML parsing & text extraction unit tests
└── README.md
```
