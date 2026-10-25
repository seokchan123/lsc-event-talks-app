# BigQuery Release Notes Explorer & Tweet Composer

A web application built with **Python Flask** and **plain vanilla HTML, CSS, and JavaScript** that fetches, organizes, and displays the latest [BigQuery Release Notes](https://docs.cloud.google.com/feeds/bigquery-release-notes.xml). It allows you to select any specific update and immediately compose, edit, or post a tweet about it to X (Twitter).

---

## ✨ Features

- **Live Feed Ingestion**: Fetches and parses the official Google Cloud BigQuery Atom XML feed (`https://docs.cloud.google.com/feeds/bigquery-release-notes.xml`).
- **Granular Update Breakdown**: Parses individual release notes into discrete, categorized updates (e.g., `Feature`, `Change`, `Announcement`, `Fixed`).
- **Interactive Refresh Button with Spinner**: One-click asynchronous refresh with a smooth animated spinner and last-updated timestamp.
- **Select & Tweet About Any Update**:
  - Click on any update card to highlight and select it.
  - Floating bottom action bar stays in view as you browse and scroll.
  - **Composer Modal**: Auto-generates an optimized tweet draft within the 280-character limit, including:
    - Contextual emoji & release category
    - Clean summary excerpt
    - Official documentation link
    - Pre-populated hashtags (`#BigQuery`, `#GoogleCloud`, `#GCP`, `#DataAnalytics`)
  - **Real-Time Character Counter**: Live character meter accurately accounting for Twitter's 23-character URL weighting (`t.co`).
  - **One-Click Post to X / Twitter**: Uses the official Twitter Web Intent (`https://twitter.com/intent/tweet?text=...`) to open the compose window.
  - **Copy to Clipboard**: Quick copy of the tweet or plain-text update details.
- **Search & Filter**:
  - Real-time keyword search across update texts and titles.
  - Category filter pills (`All`, `Features`, `Changes`, `Announcements`, `Fixes`) with live counts.
- **Zero Heavy Frontend Frameworks**: Pure vanilla JavaScript (ES6+), semantic HTML5, and modern Google Cloud-inspired CSS.

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.9+ (Python 3.12 recommended)

### 2. Setup Virtual Environment & Dependencies
```bash
# Activate the existing virtual environment:
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# Or on Linux / macOS:
source .venv/bin/activate

# (Optional) Install dependencies if not already installed:
pip install -r requirements.txt
```

### 3. Run the Application
```bash
python app.py
```
By default, the server runs on [http://127.0.0.1:5000](http://127.0.0.1:5000).

---

## 📁 Project Architecture

```
bq-releases-notes/
├── app.py                      # Flask backend & XML/HTML feed parser
├── requirements.txt            # Python dependencies (flask, requests, beautifulsoup4)
├── templates/
│   └── index.html              # Clean vanilla HTML5 single-page interface
├── static/
│   ├── css/
│   │   └── style.css           # Google Cloud-themed responsive CSS
│   └── js/
│       └── app.js              # Vanilla JS for feed handling, modal, search & tweeting
└── README.md                   # Documentation
```

---

## 📡 API Endpoints

- `GET /` — Main web application interface.
- `GET /api/release-notes` — Returns parsed release notes JSON. Add `?refresh=true` to force bypass cache.
- `POST /api/refresh` — Forces an immediate fetch and cache refresh from Google Cloud.
- `GET /health` — Returns application and cache health status.
