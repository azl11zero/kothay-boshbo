/**
 * ==============================================================================
 * Kothay Boshbo — Synchronize Missing Listings to Google Sheet via SheetDB
 * ==============================================================================
 * Synchronizes all missing curated places (including all Uttara and Bashundhara
 * venues) into the user's connected Google Sheet.
 *
 * Uses chunked batch POST requests to respect Google Sheets write quotas.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const SHEETDB_URL = 'https://sheetdb.io/api/v1/zfs6hbyutwymz';
const BATCH_SIZE = 100;

async function syncToGoogleSheet() {
    console.log('📡 Step 1: Fetching current rows from Google Sheet via SheetDB...');
    const currentRes = await fetch(SHEETDB_URL);
    if (!currentRes.ok) {
        throw new Error(`Failed to fetch current sheet rows: HTTP ${currentRes.status}`);
    }
    const currentRows = await currentRes.json();
    console.log(`📊 Found ${currentRows.length} existing rows in Google Sheet.`);

    // Build deduplication set using normalized names + area
    const existingKeys = new Set(
        currentRows.map(r => `${(r.Name || '').toLowerCase().trim()}:::${(r.Area || '').toLowerCase().trim()}`)
    );

    // Load full local curated listings
    const localListingsPath = path.join(__dirname, '../data/all_listings.json');
    const localListings = JSON.parse(fs.readFileSync(localListingsPath, 'utf8'));
    console.log(`📋 Found ${localListings.length} total verified venues in Kothay Boshbo dataset.`);

    // Find missing places
    const missingPlaces = localListings.filter(p => {
        const name = (p.name || p.Name || '').toLowerCase().trim();
        const area = (p.area || p.Area || '').toLowerCase().trim();
        return !existingKeys.has(`${name}:::${area}`);
    });

    console.log(`🔍 Identified ${missingPlaces.length} new places to add to Google Sheet.`);

    if (missingPlaces.length === 0) {
        console.log('✅ Google Sheet is already 100% up to date with all website listings!');
        return;
    }

    // Format rows for Google Sheet columns
    const formattedPayload = missingPlaces.map(item => ({
        'Name': item.name || item.Name || 'Unnamed Venue',
        'Category': (item.type || item.Category || '').toLowerCase().includes('cafe') ? 'Cafe' : 'Restaurant',
        'Area': item.area || item.Area || 'Dhaka',
        'Google Map link': item.google_maps_url || item['Google Map link'] || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((item.name || item.Name) + ' ' + (item.area || item.Area) + ' Dhaka')}`
    }));

    // Split into batches
    const batches = [];
    for (let i = 0; i < formattedPayload.length; i += BATCH_SIZE) {
        batches.push(formattedPayload.slice(i, i + BATCH_SIZE));
    }

    console.log(`🚀 Step 2: Uploading ${formattedPayload.length} rows in ${batches.length} batch(es)...`);

    let totalCreated = 0;
    for (let bIndex = 0; bIndex < batches.length; bIndex++) {
        const batch = batches[bIndex];
        console.log(`   Uploading Batch ${bIndex + 1}/${batches.length} (${batch.length} rows)...`);

        const postRes = await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: batch })
        });

        if (!postRes.ok) {
            const errText = await postRes.text();
            throw new Error(`Batch ${bIndex + 1} failed: HTTP ${postRes.status}: ${errText}`);
        }

        const postResult = await postRes.json();
        totalCreated += (postResult.created || batch.length);
        console.log(`   ✅ Batch ${bIndex + 1} uploaded successfully (+${postResult.created || batch.length} rows).`);

        // Brief delay between batches for Google Sheets API safety
        if (bIndex < batches.length - 1) {
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    console.log(`\n🎉 Step 3: Verification — Added ${totalCreated} new rows to your Google Sheet!`);
    const verifyRes = await fetch(SHEETDB_URL);
    const verifyRows = await verifyRes.json();
    console.log(`📊 Final total rows in Google Sheet: ${verifyRows.length}`);

    // Summary by Area in Google Sheet
    const areaBreakdown = {};
    verifyRows.forEach(r => {
        const a = r.Area || 'Unknown';
        areaBreakdown[a] = (areaBreakdown[a] || 0) + 1;
    });
    console.log('📍 Current Google Sheet Breakdown by Area:');
    console.table(areaBreakdown);
}

syncToGoogleSheet().catch(err => {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
});
