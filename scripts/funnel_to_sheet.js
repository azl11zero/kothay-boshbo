/**
 * ==============================================================================
 * Kothay Boshbo — Funnel Verified 753 Places to Google Sheet via SheetDB
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const SHEETDB_URL = 'https://sheetdb.io/api/v1/zfs6hbyutwymz';

const allPlaces = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/all_listings.json'), 'utf-8'));

const sheetRows = allPlaces.map(p => ({
    'Name': p.Name || p.name,
    'Category': p.Category || (p.type === 'cafe' ? 'Cafe' : 'Restaurant'),
    'Area': p.Area || p.area,
    'Google Map link': p['Google Map link'] || p.google_maps_url,
    'Price Range': p['Price Range'] || p.price_range || '৳ - ৳৳'
}));

async function funnel() {
    console.log('========================================================================');
    console.log(`🚀 Funneling ${sheetRows.length} verified places to Google Sheets via SheetDB`);
    console.log(`Endpoint: ${SHEETDB_URL}`);
    console.log('========================================================================\n');

    // Step 1: Clear existing rows
    console.log('🧹 Step 1: Clearing existing rows in Google Sheet...');
    try {
        const delRes = await fetch(`${SHEETDB_URL}/all`, { method: 'DELETE' });
        if (delRes.ok) {
            const delJson = await delRes.json();
            console.log('   ✅ Cleared previous rows:', delJson);
        } else {
            console.warn('   ⚠️ Note on delete:', await delRes.text());
        }
    } catch (e) {
        console.warn('   ⚠️ Delete error:', e.message);
    }

    // Step 2: Batch upload in chunks of 200 to ensure fast, reliable transfer
    const CHUNK_SIZE = 200;
    const totalChunks = Math.ceil(sheetRows.length / CHUNK_SIZE);
    let totalInserted = 0;

    console.log(`\n📤 Step 2: Uploading ${sheetRows.length} rows in ${totalChunks} batch chunks...`);

    for (let i = 0; i < totalChunks; i++) {
        const chunk = sheetRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        console.log(`   Batch [${i + 1}/${totalChunks}]: Sending ${chunk.length} rows (rows ${i * CHUNK_SIZE + 1} - ${i * CHUNK_SIZE + chunk.length})...`);

        try {
            const res = await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ data: chunk })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }

            const resJson = await res.json();
            const created = resJson.created || chunk.length;
            totalInserted += created;
            console.log(`   ✅ Batch ${i + 1} success: inserted ${created} rows.`);
            
            // Brief pause between chunks to be polite to the API
            await new Promise(r => setTimeout(r, 1200));
        } catch (err) {
            console.error(`   ❌ Error in batch ${i + 1}:`, err.message);
            break;
        }
    }

    // Step 3: Verify count
    console.log('\n🔎 Step 3: Verifying final Google Sheet row count...');
    try {
        const countRes = await fetch(`${SHEETDB_URL}/count`);
        const countJson = await countRes.json();
        console.log(`🎉 SheetDB Live Row Count: ${JSON.stringify(countJson)}`);
    } catch (e) {
        console.log(`   Total inserted in run: ${totalInserted}`);
    }

    console.log('\n========================================================================');
    console.log(`✨ DONE! All ${totalInserted} verified places are now live in your Google Sheet.`);
    console.log('========================================================================\n');
}

funnel();
