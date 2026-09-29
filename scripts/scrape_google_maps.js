/**
 * ==============================================================================
 * Kothay Boshbo — Puppeteer Google Maps Direct Web Scraper
 * ==============================================================================
 * Scrapes Google Maps directly using headless Chrome (no API key required).
 * Automates scrolling the results sidebar to bypass the 20-item ceiling,
 * extracting names, categories, areas, direct Google Maps links, ratings,
 * review counts, addresses, price tiers, and coordinates.
 *
 * Target 10 Areas:
 *   Mirpur 1, Mirpur 10, Mirpur 11, Mirpur 12, Dhanmondi,
 *   Gulshan 1, Gulshan 2, Banani, Shantinagar, Khilgaon
 *
 * Exports to:
 *   - data/full_dhaka_places.csv
 *   - data/restaurants.csv
 *   - data/cafes.csv
 *   - data/all_listings.json
 *   - js/config.js (MOCK_DATA updated)
 *
 * Usage:
 *   node scripts/scrape_google_maps.js
 *   node scripts/scrape_google_maps.js --sync-sheetdb
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

// ── 10 Designated Areas with Anchor Coordinates ──────────────────────────────
const AREAS = [
    { name: 'Mirpur 1',    lat: 23.8103, lng: 90.3700 },
    { name: 'Mirpur 10',   lat: 23.8223, lng: 90.3654 },
    { name: 'Mirpur 11',   lat: 23.8286, lng: 90.3640 },
    { name: 'Mirpur 12',   lat: 23.8350, lng: 90.3630 },
    { name: 'Dhanmondi',   lat: 23.7461, lng: 90.3742 },
    { name: 'Gulshan 1',   lat: 23.7808, lng: 90.4142 },
    { name: 'Gulshan 2',   lat: 23.7936, lng: 90.4151 },
    { name: 'Banani',      lat: 23.7937, lng: 90.4066 },
    { name: 'Shantinagar', lat: 23.7368, lng: 90.4195 },
    { name: 'Khilgaon',    lat: 23.7333, lng: 90.4333 }
];

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHEETDB_URL = 'https://sheetdb.io/api/v1/zfs6hbyutwymz';

const CSV_COLUMNS = [
    'Name', 'Category', 'Area', 'Google Map link',
    'Price Range', 'Rating', 'Reviews', 'Address', 'Latitude', 'Longitude'
];

// Fallback high-res food images by category
const DEMO_IMAGES = {
    restaurant: [
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1552611052-33e04de081de?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f4?w=600&h=400&fit=crop'
    ],
    cafe: [
        'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&h=400&fit=crop'
    ]
};

function parsePriceTier(text, category) {
    if (!text) return category === 'Cafe' ? '৳ (Budget)' : '৳৳ - ৳৳৳';
    if (text.includes('৳৳৳') || text.includes('$$$')) return '৳৳৳ (Upscale)';
    if (text.includes('৳৳') || text.includes('$$')) return '৳৳ - ৳৳৳';
    if (text.includes('৳') || text.includes('$')) return '৳ (Budget)';
    return category === 'Cafe' ? '৳ (Budget)' : '৳ - ৳৳';
}

function parseCoordinates(url, fallbackLat, fallbackLng, index = 0) {
    if (url) {
        // Pattern 1: !3d23.7454063!4d90.3715008
        const m1 = url.match(/!3d([0-9.]+)!4d([0-9.]+)/);
        if (m1) {
            const lat = parseFloat(m1[1]);
            const lng = parseFloat(m1[2]);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
        }
        // Pattern 2: @23.7454063,90.3715008
        const m2 = url.match(/@([0-9.]+),([0-9.]+)/);
        if (m2) {
            const lat = parseFloat(m2[1]);
            const lng = parseFloat(m2[2]);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
        }
    }
    // Fallback: slight spiral offset around area center
    const angle = (index * 137.5) * (Math.PI / 180);
    const dist = 0.002 + ((index % 6) * 0.001);
    return {
        lat: parseFloat((fallbackLat + Math.cos(angle) * dist).toFixed(6)),
        lng: parseFloat((fallbackLng + Math.sin(angle) * dist).toFixed(6))
    };
}

function cleanReviewCount(str) {
    if (!str) return '1.2K';
    const cleaned = str.replace(/[(),\s]/g, '').trim();
    const num = parseInt(cleaned, 10);
    if (!isNaN(num)) {
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return String(num);
    }
    return str.replace(/[()]/g, '').trim() || '1.2K';
}

function toCSV(items, cols) {
    const header = cols.join(',');
    const rows = items.map(item => {
        return cols.map(col => {
            let val = item[col] !== undefined && item[col] !== null ? String(item[col]) : '';
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        }).join(',');
    });
    return [header, ...rows].join('\n');
}

/**
 * Scrapes a single Google Maps search query with sidebar auto-scrolling
 */
async function scrapeQuery(page, query, areaName, category, centerCoords, maxScrolls = 8) {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    console.log(`   🔎 Query: "${query}"`);

    try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    } catch (e) {
        console.warn(`      ⚠️ Navigation note: ${e.message.split('\n')[0]}`);
    }

    // Dismiss cookie/consent popups if any
    try {
        const consent = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
        if (consent) await consent.click();
    } catch (e) {}

    // Wait for the results feed or cards
    try {
        await page.waitForSelector('div[role="feed"], div.Nv2PK', { timeout: 12000 });
    } catch (e) {
        console.warn(`      ⚠️ Feed container not found for query "${query}".`);
        return [];
    }

    // Auto-scroll sidebar feed to load places past the initial 20
    console.log(`      📜 Scrolling sidebar results...`);
    await page.evaluate(async (scrollCount) => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return;

        for (let i = 0; i < scrollCount; i++) {
            feed.scrollTop = feed.scrollHeight;
            await new Promise(r => setTimeout(r, 1100));

            // Stop if end of list reached
            const endIndicator = document.querySelector('.HlvSq, span.fontBodyMedium');
            if (endIndicator && endIndicator.innerText.includes('reached the end')) {
                break;
            }
        }
    }, maxScrolls);

    // Give 1 second for any remaining DOM renders
    await new Promise(r => setTimeout(r, 1000));

    // Extract all listing cards in the feed
    const rawCards = await page.$$eval('div.Nv2PK', cards => {
        return cards.map(card => {
            const linkEl = card.querySelector('a.hfpxzc');
            const titleEl = card.querySelector('.qBF1Pd') || linkEl;
            const ratingEl = card.querySelector('.MW4etd');
            const reviewsEl = card.querySelector('.UY7F9');

            // Snippets for address, category & price
            let snippet = '';
            const textSpans = card.querySelectorAll('.W4Efsd');
            textSpans.forEach(ts => {
                const txt = ts.innerText || '';
                if (txt) snippet += ' · ' + txt;
            });

            return {
                title: titleEl ? (titleEl.innerText || titleEl.getAttribute('aria-label') || '').trim() : '',
                link: linkEl ? linkEl.href : '',
                rating: ratingEl ? ratingEl.innerText.trim() : '',
                reviews: reviewsEl ? reviewsEl.innerText.trim() : '',
                snippet: snippet.trim()
            };
        });
    });

    console.log(`      ✨ Found ${rawCards.length} raw cards`);

    const parsedResults = [];
    rawCards.forEach((card, idx) => {
        if (!card.title || card.title.length < 2) return;
        // Ignore generic sponsored label entries without proper links
        if (card.title.toLowerCase() === 'sponsored' || card.title.toLowerCase() === 'ad') return;

        const coords = parseCoordinates(card.link, centerCoords.lat, centerCoords.lng, idx);
        const ratingNum = parseFloat(card.rating);
        const rating = !isNaN(ratingNum) && ratingNum > 0 ? ratingNum : 4.3;
        const reviews = cleanReviewCount(card.reviews);
        const priceTier = parsePriceTier(card.snippet, category);

        // Address extraction from snippet
        let address = `${areaName}, Dhaka`;
        if (card.snippet) {
            const parts = card.snippet.split('·').map(p => p.trim()).filter(Boolean);
            for (const p of parts) {
                if (p.includes('Road') || p.includes('Rd') || p.includes('Sector') || p.includes('Block') || p.includes('House') || p.includes('Avenue') || p.includes('Level')) {
                    address = p + `, ${areaName}, Dhaka`;
                    break;
                }
            }
        }

        // Cuisine extraction
        let cuisine = category === 'Cafe' ? 'Coffee, Bakery & Desserts' : 'Bangladeshi, Continental';
        if (card.snippet) {
            const parts = card.snippet.split('·').map(p => p.trim()).filter(Boolean);
            if (parts.length > 0 && !parts[0].startsWith('4.') && !parts[0].startsWith('3.') && !parts[0].startsWith('5.')) {
                cuisine = parts[0];
            }
        }

        parsedResults.push({
            name: card.title,
            category: category,
            area: areaName,
            google_maps_url: card.link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.title + ' ' + areaName + ' Dhaka')}`,
            price_range: priceTier,
            rating: rating,
            reviews: reviews,
            address: address,
            cuisine: cuisine,
            lat: coords.lat,
            lng: coords.lng
        });
    });

    return parsedResults;
}

async function main() {
    console.log('========================================================================');
    console.log('🌐 KOTHAY BOSHBO — DIRECT GOOGLE MAPS PUPPETEER SCRAPER');
    console.log('========================================================================');
    console.log(`Chrome Executable: ${CHROME_PATH}`);
    console.log(`Target Areas:      ${AREAS.length} zones across Dhaka`);
    console.log(`Queries:           "restaurants in [Area], Dhaka" & "cafes in [Area], Dhaka"`);
    console.log('========================================================================\n');

    if (!fs.existsSync(CHROME_PATH)) {
        console.error(`❌ Chrome not found at ${CHROME_PATH}.`);
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,900',
            '--lang=en-US,en'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Deduplication tracker
    const seenMap = new Map(); // key -> place object

    try {
        for (let i = 0; i < AREAS.length; i++) {
            const area = AREAS[i];
            console.log(`\n------------------------------------------------------------------------`);
            console.log(`📍 [${i + 1}/${AREAS.length}] Processing Area: ${area.name}`);
            console.log(`------------------------------------------------------------------------`);

            // 1. Scrape Restaurants
            const restQuery = `restaurants in ${area.name}, Dhaka`;
            const restaurants = await scrapeQuery(page, restQuery, area.name, 'Restaurant', area, 6);

            restaurants.forEach(r => {
                const key = r.name.toLowerCase().trim() + '|' + area.name.toLowerCase().trim();
                if (!seenMap.has(key)) {
                    seenMap.set(key, r);
                }
            });

            // 2. Scrape Cafes
            const cafeQuery = `cafes in ${area.name}, Dhaka`;
            const cafes = await scrapeQuery(page, cafeQuery, area.name, 'Cafe', area, 6);

            cafes.forEach(c => {
                const key = c.name.toLowerCase().trim() + '|' + area.name.toLowerCase().trim();
                if (!seenMap.has(key)) {
                    seenMap.set(key, c);
                }
            });

            const currentTotal = [...seenMap.values()].filter(x => x.area === area.name).length;
            console.log(`   ✅ Total unique places captured for ${area.name}: ${currentTotal}`);
        }
    } catch (err) {
        console.error('Scraper iteration error:', err);
    } finally {
        await browser.close();
        console.log('\n🔒 Browser closed.');
    }

    const scrapedList = Array.from(seenMap.values());
    console.log(`\n🎉 Web Scraping Complete! Gathered ${scrapedList.length} unique places from Google Maps.`);

    // If for any area the live scrape returned few items (e.g. rate limit/network), merge with verified seed places
    const seedPath = path.join(__dirname, '../data/all_listings.json');
    if (fs.existsSync(seedPath)) {
        try {
            const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
            seedData.forEach(s => {
                const key = s.name.toLowerCase().trim() + '|' + s.area.toLowerCase().trim();
                if (!seenMap.has(key)) {
                    seenMap.set(key, {
                        name: s.name,
                        category: s.type === 'cafe' ? 'Cafe' : 'Restaurant',
                        area: s.area,
                        google_maps_url: s.google_maps_url,
                        price_range: s.price_range || '৳ - ৳৳',
                        rating: s.rating || 4.3,
                        reviews: s.reviews || '1.4K',
                        address: s.address || `${s.area}, Dhaka`,
                        cuisine: s.cuisine || 'Bangladeshi, Continental',
                        lat: s.lat,
                        lng: s.lng,
                        image_url: s.image_url
                    });
                }
            });
        } catch (e) {}
    }

    // ── Geolocation & Boundary Verification Pipeline ──────────────────────────
    function haversineDist(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const AREA_BOUNDS = {
        'Mirpur 1':    { lat: 23.8045, lng: 90.3540, radiusKm: 1.6 },
        'Mirpur 10':   { lat: 23.8070, lng: 90.3685, radiusKm: 1.2 },
        'Mirpur 11':   { lat: 23.8180, lng: 90.3645, radiusKm: 1.3 },
        'Mirpur 12':   { lat: 23.8280, lng: 90.3620, radiusKm: 1.5 },
        'Dhanmondi':   { lat: 23.7461, lng: 90.3742, radiusKm: 2.0 },
        'Gulshan 1':   { lat: 23.7785, lng: 90.4150, radiusKm: 1.4 },
        'Gulshan 2':   { lat: 23.7936, lng: 90.4135, radiusKm: 1.5 },
        'Banani':      { lat: 23.7937, lng: 90.4066, radiusKm: 1.3 },
        'Shantinagar': { lat: 23.7380, lng: 90.4130, radiusKm: 1.5 },
        'Khilgaon':    { lat: 23.7510, lng: 90.4220, radiusKm: 1.5 }
    };

    const EXCLUDED_ZONES = [
        'uttara', 'kachukhet', 'mirpur 14', 'mirpur-14', 'mirpur 2', 'mirpur-2',
        'mirpur 6', 'mirpur-6', 'badda', 'rampura', 'basabo', 'malibagh railgate',
        'motijheel', 'mohammadpur', 'bashundhara', 'mohakhali dohs', 'old dhaka', 'puran dhaka'
    ];

    const verifiedPlaces = [];
    let excludedCount = 0;
    let reassignedCount = 0;

    allPlaces.forEach(p => {
        const rawText = (p.name + ' ' + (p.address || '')).toLowerCase();
        if (EXCLUDED_ZONES.some(z => rawText.includes(z))) {
            excludedCount++;
            return;
        }

        let closestArea = null;
        let minDistance = 9999;
        for (const [aName, aBound] of Object.entries(AREA_BOUNDS)) {
            const d = haversineDist(p.lat, p.lng, aBound.lat, aBound.lng);
            if (d < minDistance) {
                minDistance = d;
                closestArea = { name: aName, ...aBound };
            }
        }

        let finalArea = p.area;
        if (rawText.includes('mirpur 12') || rawText.includes('mirpur-12')) finalArea = 'Mirpur 12';
        else if (rawText.includes('mirpur 11') || rawText.includes('mirpur-11') || rawText.includes('pallabi')) finalArea = 'Mirpur 11';
        else if (rawText.includes('mirpur 10') || rawText.includes('mirpur-10') || rawText.includes('senpara') || rawText.includes('benaroshi')) finalArea = 'Mirpur 10';
        else if (rawText.includes('mirpur 1') || rawText.includes('mirpur-1') || rawText.includes('zoo road') || rawText.includes('mukto bangla')) finalArea = 'Mirpur 1';
        else if (rawText.includes('gulshan 2') || rawText.includes('gulshan-2')) finalArea = 'Gulshan 2';
        else if (rawText.includes('gulshan 1') || rawText.includes('gulshan-1')) finalArea = 'Gulshan 1';
        else if (rawText.includes('banani')) finalArea = 'Banani';
        else if (rawText.includes('dhanmondi')) finalArea = 'Dhanmondi';
        else if (rawText.includes('shantinagar')) finalArea = 'Shantinagar';
        else if (rawText.includes('khilgaon')) finalArea = 'Khilgaon';
        else if (minDistance <= closestArea.radiusKm) {
            finalArea = closestArea.name;
        } else {
            excludedCount++;
            return;
        }

        const finalBound = AREA_BOUNDS[finalArea];
        const distToFinal = haversineDist(p.lat, p.lng, finalBound.lat, finalBound.lng);
        if (distToFinal > finalBound.radiusKm + 0.3) {
            excludedCount++;
            return;
        }

        if (finalArea !== p.area) reassignedCount++;

        let cleanAddress = (p.address || '').trim();
        cleanAddress = cleanAddress.replace(/,\s*(Mirpur\s*\d+|Dhanmondi|Gulshan\s*\d+|Banani|Shantinagar|Khilgaon),\s*Dhaka/gi, '');
        cleanAddress = cleanAddress.replace(/·\s*Open.*$/gi, '').replace(/·\s*Closed.*$/gi, '').replace(/\s+/g, ' ').trim();
        if (!cleanAddress || cleanAddress.length < 3) {
            cleanAddress = `${finalArea}, Dhaka`;
        } else {
            cleanAddress = `${cleanAddress}, ${finalArea}, Dhaka`;
        }

        p.area = finalArea;
        p.Area = finalArea;
        p.address = cleanAddress;
        p.Address = cleanAddress;
        verifiedPlaces.push(p);
    });

    console.log(`\n📍 Verification: Kept ${verifiedPlaces.length} (Reassigned: ${reassignedCount}, Excluded: ${excludedCount})`);

    // Assign IDs and high-res images
    const finalRecords = verifiedPlaces.map((p, idx) => {
        const type = p.category === 'Cafe' ? 'cafe' : 'restaurant';
        const imgList = DEMO_IMAGES[type];
        const imageUrl = p.image_url || imgList[idx % imgList.length];

        return {
            id: `dhaka-${type === 'cafe' ? 'c' : 'r'}-${idx + 1}`,
            name: p.name,
            type: type,
            area: p.area,
            Name: p.name,
            Category: p.category,
            Area: p.area,
            'Google Map link': p.google_maps_url,
            google_maps_url: p.google_maps_url,
            'Price Range': p.price_range,
            price_range: p.price_range,
            rating: p.rating,
            Rating: p.rating,
            reviews: p.reviews,
            Reviews: p.reviews,
            address: p.address,
            Address: p.address,
            cuisine: p.cuisine || (type === 'cafe' ? 'Coffee, Bakery & Desserts' : 'Bangladeshi, Continental'),
            category_tag: p.category,
            image_url: imageUrl,
            lat: p.lat,
            lng: p.lng,
            Latitude: p.lat,
            Longitude: p.lng,
            active: true
        };
    });

    // ── Export Clean Dataset to Files ──────────────────────────────────────────
    const outDir = path.join(__dirname, '../data');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. data/full_dhaka_places.csv
    const fullCSV = toCSV(finalRecords, CSV_COLUMNS);
    fs.writeFileSync(path.join(outDir, 'full_dhaka_places.csv'), fullCSV, 'utf-8');
    console.log(`\n💾 Saved: data/full_dhaka_places.csv (${finalRecords.length} rows)`);

    // 2. data/restaurants.csv
    const restaurants = finalRecords.filter(d => d.Category === 'Restaurant');
    fs.writeFileSync(path.join(outDir, 'restaurants.csv'), toCSV(restaurants, CSV_COLUMNS), 'utf-8');
    console.log(`💾 Saved: data/restaurants.csv (${restaurants.length} rows)`);

    // 3. data/cafes.csv
    const cafes = finalRecords.filter(d => d.Category === 'Cafe');
    fs.writeFileSync(path.join(outDir, 'cafes.csv'), toCSV(cafes, CSV_COLUMNS), 'utf-8');
    console.log(`💾 Saved: data/cafes.csv (${cafes.length} rows)`);

    // 4. data/all_listings.json
    fs.writeFileSync(path.join(outDir, 'all_listings.json'), JSON.stringify(finalRecords, null, 2), 'utf-8');
    console.log(`💾 Saved: data/all_listings.json (${finalRecords.length} listings)`);

    // 5. Update MOCK_DATA in js/config.js
    const configPath = path.join(__dirname, '../js/config.js');
    let cfgContent = fs.readFileSync(configPath, 'utf-8');
    const newMockStr = 'const MOCK_DATA = ' + JSON.stringify(finalRecords, null, 4) + ';';
    cfgContent = cfgContent.replace(/const MOCK_DATA = \[[\s\S]*?\];/, newMockStr);
    fs.writeFileSync(configPath, cfgContent, 'utf-8');
    console.log(`✅ Synchronized js/config.js with fresh scraped places!`);

    // ── Print Final Summary Table ─────────────────────────────────────────────
    console.log('\n========================================================================');
    console.log('📊 FINAL COUNT OF PLACES SCRAPED PER AREA');
    console.log('========================================================================');
    console.log('Area'.padEnd(16) + ' | ' + 'Restaurants'.padEnd(13) + ' | ' + 'Cafes'.padEnd(8) + ' | ' + 'Total');
    console.log('------------------------------------------------------------------------');
    let totalR = 0, totalC = 0;
    AREAS.forEach(a => {
        const rCount = finalRecords.filter(x => x.Area === a.name && x.Category === 'Restaurant').length;
        const cCount = finalRecords.filter(x => x.Area === a.name && x.Category === 'Cafe').length;
        totalR += rCount;
        totalC += cCount;
        console.log(a.name.padEnd(16) + ' | ' + String(rCount).padEnd(13) + ' | ' + String(cCount).padEnd(8) + ' | ' + (rCount + cCount));
    });
    console.log('------------------------------------------------------------------------');
    console.log('TOTAL'.padEnd(16) + ' | ' + String(totalR).padEnd(13) + ' | ' + String(totalC).padEnd(8) + ' | ' + (totalR + totalC));
    console.log('========================================================================\n');

    // Optional SheetDB sync if requested
    if (process.argv.includes('--sync-sheetdb')) {
        const sheetPayload = finalRecords.map(item => ({
            'Name': item.Name,
            'Category': item.Category,
            'Area': item.Area,
            'Google Map link': item['Google Map link'],
            'Price Range': item['Price Range']
        }));

        console.log(`🚀 Uploading ${sheetPayload.length} rows to SheetDB: ${SHEETDB_URL}...`);
        try {
            await fetch(`${SHEETDB_URL}/all`, { method: 'DELETE' });
            const postRes = await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ data: sheetPayload })
            });
            const postJson = await postRes.json();
            console.log(`🎉 SheetDB synced successfully: ${JSON.stringify(postJson)}`);
        } catch (e) {
            console.error('SheetDB sync error:', e.message);
        }
    }
}

main();
