const fs = require('fs');
const path = require('path');

function parseReviewNum(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().replace(/,/g, '').replace(/[()]/g, '').trim();
    const match = str.match(/(\d+(?:\.\d+)?)\s*([KM])?/i);
    if (!match) return 0;
    const num = parseFloat(match[1]) || 0;
    const suffix = (match[2] || '').toUpperCase();
    if (suffix === 'K') return num * 1000;
    if (suffix === 'M') return num * 1000000;
    return num;
}

// Load current all_listings.json
const rootDir = path.join(__dirname, '..');
const jsonPath = path.join(rootDir, 'data', 'all_listings.json');
const listings = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log(`Original listings count: ${listings.length}`);

// Sort comparator: Higher rating (score) -> Higher review count -> Name
function compareVenues(a, b) {
    const rA = typeof a.rating === 'number' ? a.rating : (parseFloat(a.rating || a.Rating) || 0);
    const rB = typeof b.rating === 'number' ? b.rating : (parseFloat(b.rating || b.Rating) || 0);
    const rDiff = rB - rA;
    if (Math.abs(rDiff) > 0.001) return rDiff;

    const cA = parseReviewNum(a.reviews || a.Reviews);
    const cB = parseReviewNum(b.reviews || b.Reviews);
    const cDiff = cB - cA;
    if (cDiff !== 0) return cDiff;

    const nA = (a.name || a.Name || '').toLowerCase();
    const nB = (b.name || b.Name || '').toLowerCase();
    return nA.localeCompare(nB);
}

const sortedListings = [...listings].sort(compareVenues);

// Sample check Banani cafes
const bananiCafes = sortedListings.filter(p => {
    const area = (p.area || p.Area || '').toLowerCase();
    const type = (p.type || p.Category || '').toLowerCase();
    return area === 'banani' && (type.includes('cafe') || type.includes('coffee') || type.includes('bakery'));
});

console.log('\nTop 10 Banani Cafes after sort:');
bananiCafes.slice(0, 10).forEach((p, i) => {
    console.log(`${i+1}. [${p.rating} ★ | ${p.reviews} rev] ${p.name}`);
});

// Write back to all_listings.json
fs.writeFileSync(jsonPath, JSON.stringify(sortedListings, null, 2), 'utf8');
console.log(`\n✅ Saved sorted dataset to ${jsonPath}`);

// Also update js/config.js
const configPath = path.join(rootDir, 'js', 'config.js');
let configContent = fs.readFileSync(configPath, 'utf8');
const dataPrefix = 'const MOCK_DATA = ';
const prefixIdx = configContent.indexOf(dataPrefix);
if (prefixIdx !== -1) {
    const endMarker = '];\n\n    return {';
    const endIdx = configContent.indexOf(endMarker, prefixIdx);
    if (endIdx !== -1) {
        configContent = configContent.slice(0, prefixIdx + dataPrefix.length) +
            JSON.stringify(sortedListings, null, 4) +
            configContent.slice(endIdx + 1); // keep '];\n\n    return {'
        fs.writeFileSync(configPath, configContent, 'utf8');
        console.log(`✅ Updated js/config.js with sorted MOCK_DATA`);
    } else {
        console.warn('Could not find endMarker in config.js');
    }
} else {
    console.warn('Could not find dataPrefix in config.js');
}

// Also update data/full_dhaka_places.csv
const csvPath = path.join(rootDir, 'data', 'full_dhaka_places.csv');
const csvHeaders = ['Name', 'Category', 'Area', 'Google Map link', 'Rating', 'Reviews', 'Address', 'Latitude', 'Longitude'];

function escapeCsv(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

const csvLines = [csvHeaders.join(',')];
sortedListings.forEach(p => {
    const row = [
        escapeCsv(p.name || p.Name),
        escapeCsv(p.type === 'cafe' ? 'Cafe' : (p.Category || 'Restaurant')),
        escapeCsv(p.area || p.Area),
        escapeCsv(p.google_maps_url || p['Google Map link']),
        escapeCsv(p.rating || p.Rating),
        escapeCsv(p.reviews || p.Reviews),
        escapeCsv(p.address || p.Address),
        escapeCsv(p.lat || p.Latitude),
        escapeCsv(p.lng || p.Longitude)
    ];
    csvLines.push(row.join(','));
});

fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
console.log(`✅ Updated data/full_dhaka_places.csv (${sortedListings.length} rows)`);
