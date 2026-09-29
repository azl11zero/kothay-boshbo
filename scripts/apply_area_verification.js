const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/all_listings.json'), 'utf-8'));

// Exact bounding centers for the 10 Dhaka areas
const AREAS_GEO = [
    { name: 'Mirpur 1',    lat: 23.8045, lng: 90.3540, radiusKm: 1.6 },
    { name: 'Mirpur 10',   lat: 23.8070, lng: 90.3685, radiusKm: 1.2 },
    { name: 'Mirpur 11',   lat: 23.8180, lng: 90.3645, radiusKm: 1.3 },
    { name: 'Mirpur 12',   lat: 23.8280, lng: 90.3620, radiusKm: 1.5 },
    { name: 'Dhanmondi',   lat: 23.7461, lng: 90.3742, radiusKm: 2.0 },
    { name: 'Gulshan 1',   lat: 23.7785, lng: 90.4150, radiusKm: 1.4 },
    { name: 'Gulshan 2',   lat: 23.7936, lng: 90.4135, radiusKm: 1.5 },
    { name: 'Banani',      lat: 23.7937, lng: 90.4066, radiusKm: 1.3 },
    { name: 'Shantinagar', lat: 23.7380, lng: 90.4130, radiusKm: 1.5 },
    { name: 'Khilgaon',    lat: 23.7510, lng: 90.4220, radiusKm: 1.5 }
];

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function detectAreaFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('mirpur 12') || lower.includes('mirpur-12')) return 'Mirpur 12';
    if (lower.includes('mirpur 11') || lower.includes('mirpur-11') || lower.includes('pallabi')) return 'Mirpur 11';
    if (lower.includes('mirpur 10') || lower.includes('mirpur-10') || lower.includes('senpara') || lower.includes('benaroshi')) return 'Mirpur 10';
    if (lower.includes('mirpur 1') || lower.includes('mirpur-1') || lower.includes('zoo road') || lower.includes('mukto bangla') || lower.includes('chiriakhana')) return 'Mirpur 1';
    
    if (lower.includes('gulshan 2') || lower.includes('gulshan-2') || lower.includes('madani')) return 'Gulshan 2';
    if (lower.includes('gulshan 1') || lower.includes('gulshan-1') || lower.includes('police plaza') || lower.includes('shooting club')) return 'Gulshan 1';
    if (lower.includes('banani') || lower.includes('kamal ataturk') || lower.includes('road 11, banani')) return 'Banani';
    if (lower.includes('dhanmondi') || lower.includes('satmasjid') || lower.includes('shimanto') || lower.includes('road 27')) return 'Dhanmondi';
    if (lower.includes('shantinagar') || lower.includes('bailey road') || lower.includes('twin towers') || lower.includes('kakrail')) return 'Shantinagar';
    if (lower.includes('khilgaon') || lower.includes('taltola') || lower.includes('shahid baki')) return 'Khilgaon';
    return null;
}

const EXCLUDED_ZONES = [
    'uttara', 'kachukhet', 'mirpur 14', 'mirpur-14', 'mirpur 2', 'mirpur-2',
    'mirpur 6', 'mirpur-6', 'badda', 'rampura', 'basabo', 'malibagh railgate',
    'motijheel', 'mohammadpur', 'bashundhara', 'mohakhali dohs', 'old dhaka', 'puran dhaka'
];

let reassigned = 0;
let excluded = 0;
const verifiedPlaces = [];

data.forEach((p, idx) => {
    const rawText = (p.name + ' ' + (p.address || '') + ' ' + (p.snippet || '')).toLowerCase();

    // Check if place explicitly belongs to an excluded external neighborhood
    if (EXCLUDED_ZONES.some(z => rawText.includes(z))) {
        excluded++;
        return;
    }

    let closestArea = null;
    let minDistance = 9999;

    AREAS_GEO.forEach(a => {
        const d = haversineKm(p.lat, p.lng, a.lat, a.lng);
        if (d < minDistance) {
            minDistance = d;
            closestArea = a;
        }
    });

    const textHintArea = detectAreaFromText(p.name + ' ' + (p.address || ''));
    let finalArea = p.area;

    if (textHintArea) {
        const targetCenter = AREAS_GEO.find(a => a.name === textHintArea);
        const distToText = haversineKm(p.lat, p.lng, targetCenter.lat, targetCenter.lng);
        if (distToText <= 2.5) {
            finalArea = textHintArea;
        } else if (minDistance <= closestArea.radiusKm) {
            finalArea = closestArea.name;
        }
    } else if (minDistance <= closestArea.radiusKm) {
        finalArea = closestArea.name;
    } else {
        excluded++;
        return;
    }

    const finalCenter = AREAS_GEO.find(a => a.name === finalArea);
    const distToFinal = haversineKm(p.lat, p.lng, finalCenter.lat, finalCenter.lng);
    if (distToFinal > finalCenter.radiusKm + 0.3) {
        excluded++;
        return;
    }

    if (finalArea !== p.area) {
        reassigned++;
    }

    // Clean address
    let cleanAddress = (p.address || p.Address || '').trim();
    cleanAddress = cleanAddress.replace(/,\s*(Mirpur\s*\d+|Dhanmondi|Gulshan\s*\d+|Banani|Shantinagar|Khilgaon),\s*Dhaka/gi, '');
    cleanAddress = cleanAddress.replace(/·\s*Open.*$/gi, '').replace(/·\s*Closed.*$/gi, '').replace(/\s+/g, ' ').trim();
    if (!cleanAddress || cleanAddress.length < 3) {
        cleanAddress = `${finalArea}, Dhaka`;
    } else {
        cleanAddress = `${cleanAddress}, ${finalArea}, Dhaka`;
    }

    const cat = (p.category || p.Category || (p.type === 'cafe' ? 'Cafe' : 'Restaurant'));

    verifiedPlaces.push({
        ...p,
        area: finalArea,
        Area: finalArea,
        type: cat === 'Cafe' ? 'cafe' : 'restaurant',
        category: cat,
        Category: cat,
        address: cleanAddress,
        Address: cleanAddress,
        distToCenterKm: parseFloat(distToFinal.toFixed(2))
    });
});

console.log('========================================================================');
console.log('✅ STRICT GEOLOCATION & AREA VALIDATION COMPLETE');
console.log('========================================================================');
console.log(`Original places:              ${data.length}`);
console.log(`Excluded (out of boundaries): ${excluded}`);
console.log(`Reassigned to true area:      ${reassigned}`);
console.log(`Verified strictly in-area:    ${verifiedPlaces.length}`);
console.log('========================================================================\n');

// Print per area table
console.log('Area'.padEnd(16) + ' | ' + 'Restaurants'.padEnd(13) + ' | ' + 'Cafes'.padEnd(8) + ' | ' + 'Total');
console.log('-----------------------------------------------------------------');
let totR = 0, totC = 0;
AREAS_GEO.forEach(a => {
    const r = verifiedPlaces.filter(x => x.area === a.name && x.type === 'restaurant').length;
    const c = verifiedPlaces.filter(x => x.area === a.name && x.type === 'cafe').length;
    totR += r;
    totC += c;
    console.log(a.name.padEnd(16) + ' | ' + String(r).padEnd(13) + ' | ' + String(c).padEnd(8) + ' | ' + (r + c));
});
console.log('-----------------------------------------------------------------');
console.log('TOTAL'.padEnd(16) + ' | ' + String(totR).padEnd(13) + ' | ' + String(totC).padEnd(8) + ' | ' + (totR + totC));
console.log('========================================================================\n');

// ── Export verified places ──────────────────────────────────────────────────
const outDir = path.join(__dirname, '../data');
const CSV_COLUMNS = [
    'Name', 'Category', 'Area', 'Google Map link',
    'Price Range', 'Rating', 'Reviews', 'Address', 'Latitude', 'Longitude'
];

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

// 1. full_dhaka_places.csv
fs.writeFileSync(path.join(outDir, 'full_dhaka_places.csv'), toCSV(verifiedPlaces, CSV_COLUMNS), 'utf-8');
console.log(`💾 Saved verified dataset (${verifiedPlaces.length} rows) to data/full_dhaka_places.csv`);

// 2. restaurants.csv
const restaurants = verifiedPlaces.filter(d => d.Category === 'Restaurant');
fs.writeFileSync(path.join(outDir, 'restaurants.csv'), toCSV(restaurants, CSV_COLUMNS), 'utf-8');
console.log(`💾 Saved data/restaurants.csv (${restaurants.length} rows)`);

// 3. cafes.csv
const cafes = verifiedPlaces.filter(d => d.Category === 'Cafe');
fs.writeFileSync(path.join(outDir, 'cafes.csv'), toCSV(cafes, CSV_COLUMNS), 'utf-8');
console.log(`💾 Saved data/cafes.csv (${cafes.length} rows)`);

// 4. all_listings.json
fs.writeFileSync(path.join(outDir, 'all_listings.json'), JSON.stringify(verifiedPlaces, null, 2), 'utf-8');
console.log(`💾 Saved data/all_listings.json (${verifiedPlaces.length} listings)`);

// 5. Update js/config.js
const configPath = path.join(__dirname, '../js/config.js');
let cfgContent = fs.readFileSync(configPath, 'utf-8');
const newMockStr = 'const MOCK_DATA = ' + JSON.stringify(verifiedPlaces, null, 4) + ';';
cfgContent = cfgContent.replace(/const MOCK_DATA = \[[\s\S]*?\];/, newMockStr);
fs.writeFileSync(configPath, cfgContent, 'utf-8');
console.log(`✅ Synchronized js/config.js with verified places!`);
