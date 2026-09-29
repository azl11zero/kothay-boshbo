/**
 * ==============================================================================
 * Kothay Boshbo — Funnel / Push Listings to SheetDB
 * ==============================================================================
 * Reads all curated restaurant & cafe listings currently present in the website
 * and funnels them directly into your connected Google Sheet via SheetDB.
 *
 * Uses a single batch POST request to conserve your monthly API quota (1 request)!
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const SHEETDB_URL = 'https://sheetdb.io/api/v1/zfs6hbyutwymz';

// Load MOCK_DATA from config.js
const cfgPath = path.join(__dirname, '../js/config.js');
const cfgContent = fs.readFileSync(cfgPath, 'utf-8');
const window = global;
eval(cfgContent);

const mockListings = window.KothayBoshboConfig.MOCK_DATA || [];

console.log(`📋 Found ${mockListings.length} places in Kothay Boshbo website.`);

// Format rows according to Google Sheet's exact column headers
const payloadData = mockListings.map(item => ({
    'Name': item.name,
    'Category': item.type === 'cafe' ? 'Cafe' : 'Restaurant',
    'Area': item.area,
    'Google Map link': item.google_maps_url,
    'Price Range': item.price_range
}));

async function pushToSheet() {
    console.log(`🚀 Funneling ${payloadData.length} listings into Google Sheet via SheetDB...`);

    try {
        const response = await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: payloadData })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('🎉 SheetDB Response:', result);
        console.log(`✅ Successfully added ${result.created || payloadData.length} rows to your Google Sheet!`);

        // Verify by fetching back
        console.log('🔍 Verifying live rows in Google Sheet...');
        const verifyRes = await fetch(SHEETDB_URL);
        const verifyData = await verifyRes.json();
        console.log(`📊 Current total rows in Google Sheet: ${verifyData.length}`);

    } catch (err) {
        console.error('❌ Error pushing to SheetDB:', err.message);
    }
}

pushToSheet();
