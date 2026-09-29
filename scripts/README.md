# Kothay Boshbo — Google Maps Scraper & Google Sheet CMS Guide

This guide walks you through collecting restaurant and cafe data across the 10 Dhaka areas and connecting your Google Sheet as a live CMS.

---

## 1. File Overview

- **`scripts/collect_data.py`**: Python script to scrape Google Places API or generate curated Dhaka listings and export to CSV/JSON (or sync directly to Google Sheets).
- **`scripts/collect_data.js`**: Node.js companion script (can be run with `node scripts/collect_data.js` right now).
- **`scripts/google_apps_script.js`**: Apps Script code to paste into your Google Sheet to turn it into a real-time JSON API.
- **`data/restaurants.csv`**: Pre-generated CSV ready to import into your `Restaurants` sheet tab.
- **`data/cafes.csv`**: Pre-generated CSV ready to import into your `Cafes` sheet tab.

---

## 2. Setting Up Your Google Sheet (Live CMS)

### Step 1: Create the Google Sheet
1. Go to [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Name it **Kothay Boshbo Database**.
3. Create two tabs at the bottom:
   - **`Restaurants`**
   - **`Cafes`**

### Step 2: Import the Data
1. In the **`Restaurants`** tab:
   - Click **File > Import > Upload**.
   - Select `data/restaurants.csv`.
   - Choose **"Replace current sheet"** and click **Import data**.
2. In the **`Cafes`** tab:
   - Click **File > Import > Upload**.
   - Select `data/cafes.csv`.
   - Choose **"Replace current sheet"** and click **Import data**.

---

## 3. Deploying the Real-Time Apps Script Web App

To let the website fetch from your Sheet in real time without exposing any private API keys:

1. In your Google Sheet, click **Extensions > Apps Script**.
2. Delete any existing code in the editor.
3. Open `scripts/google_apps_script.js` from this repository, copy its entire contents, and paste it into the editor.
4. Click the blue **Deploy** button > **New deployment**.
5. Click the gear icon next to "Select type" and choose **Web app**.
6. Set the configuration:
   - **Description**: `Kothay Boshbo API`
   - **Execute as**: `Me (your_email@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial so the website can read the public food directory)*
7. Click **Deploy** and grant permissions if prompted.
8. Copy the generated **Web App URL** (it looks like `https://script.google.com/macros/s/.../exec`).

---

## 4. Connecting the Web App to the Website

Open `js/config.js` in your code editor and paste your Web App URL:

```javascript
// js/config.js
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycb.../exec";
```

That's it! Now:
- If you **add a new restaurant** in the Sheet, it appears on the website.
- If you **edit a price or name**, it updates immediately.
- If you set `active = FALSE` in any row, it hides that place from the website.
- Clicking the **↻ Refresh** button on the website re-fetches the latest live data from your Sheet.

---

## 5. Running the Python Scraper with Google Places API (Optional)

If you have a Google Cloud account and want to fetch fresh listings directly from Google Places:

```bash
# 1. Install dependencies
pip install -r scripts/requirements.txt

# 2. Run with your API key
python scripts/collect_data.py --mode places --api-key YOUR_GOOGLE_PLACES_API_KEY
```

This will query each of the 10 target zones in Dhaka (Mirpur 1, 10, 11, 12, Dhanmondi, Gulshan 1, 2, Banani, Shantinagar, Khilgaon) and update `data/restaurants.csv` and `data/cafes.csv`.
