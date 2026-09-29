const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/all_listings.json', 'utf-8'));

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

// Check text hints in name & raw address
function detectAreaFromText(text) {
    const lower = text.toLowerCase();
    
    // Explicit mentions (highest confidence)
    if (lower.includes('mirpur 12') || lower.includes('mirpur-12') || lower.includes('mirpur 12,')) return 'Mirpur 12';
    if (lower.includes('mirpur 11') || lower.includes('mirpur-11') || lower.includes('pallabi') || lower.includes('mirpur 11,')) return 'Mirpur 11';
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

// Disqualify clearly out-of-bounds neighborhoods
const EXCLUDED_ZONES = [
    'uttara', 'mirpur 14', 'mirpur-14', 'kachukhet', 'mirpur 2', 'mirpur-2',
    'mirpur 6', 'mirpur-6', 'badda', 'rampura', 'basabo', 'malibagh railgate',
    'motijheel', 'mohammadpur', 'bashundhara', 'mohakhali dohs', 'old dhaka', 'puran dhaka'
];

let kept = 0;
let reassigned = 0;
let excluded = 0;

const cleanPlaces = [];

data.forEach(p => {
    const rawText = (p.name + ' ' + p.address + ' ' + (p.snippet || '')).toLowerCase();

    // Check if explicitly in an excluded zone far away
    const isExcluded = EXCLUDED_ZONES.some(z => rawText.includes(z));

    // Calculate distance to all 10 areas
    let closestArea = null;
    let minDistance = 9999;

    AREAS_GEO.forEach(a => {
        const d = haversineKm(p.lat, p.lng, a.lat, a.lng);
        if (d < minDistance) {
            minDistance = d;
            closestArea = a;
        }
    });

    const textHintArea = detectAreaFromText(p.name + ' ' + p.address);

    let finalArea = p.area;

    // Logic:
    // 1. If text explicitly indicates an area and coords are within reasonable reach (< 2.5km), trust textHintArea
    if (textHintArea) {
        const targetCenter = AREAS_GEO.find(a => a.name === textHintArea);
        const distToText = haversineKm(p.lat, p.lng, targetCenter.lat, targetCenter.lng);
        if (distToText <= 2.5) {
            finalArea = textHintArea;
        } else if (minDistance <= closestArea.radiusKm) {
            finalArea = closestArea.name;
        }
    } else if (minDistance <= closestArea.radiusKm) {
        // Coords are inside closestArea
        finalArea = closestArea.name;
    } else {
        // Too far from all 10 areas
        excluded++;
        return;
    }

    // If coordinates are too far from the final assigned area (> radiusKm + 0.3km), exclude
    const finalCenter = AREAS_GEO.find(a => a.name === finalArea);
    const distToFinal = haversineKm(p.lat, p.lng, finalCenter.lat, finalCenter.lng);
    if (distToFinal > finalCenter.radiusKm + 0.3) {
        excluded++;
        return;
    }

    if (finalArea !== p.area) {
        reassigned++;
    }

    // Clean address: remove any previously appended mismatched area suffix
    let cleanAddress = p.address || '';
    cleanAddress = cleanAddress.replace(/,\s*(Mirpur\s*\d+|Dhanmondi|Gulshan\s*\d+|Banani|Shantinagar|Khilgaon),\s*Dhaka/gi, '');
    cleanAddress = cleanAddress.replace(/·\s*Open.*$/gi, '').replace(/·\s*Closed.*$/gi, '').trim();
    if (!cleanAddress || cleanAddress.length < 3) {
        cleanAddress = `${finalArea}, Dhaka`;
    } else {
        cleanAddress = `${cleanAddress}, ${finalArea}, Dhaka`;
    }

    cleanPlaces.push({
        ...p,
        area: finalArea,
        Area: finalArea,
        address: cleanAddress,
        Address: cleanAddress,
        distToCenterKm: parseFloat(distToFinal.toFixed(2))
    });
    kept++;
});

console.log('========================================================================');
console.log('📍 GEOLOCATION & AREA VALIDATION REPORT');
console.log('========================================================================');
console.log(`Original places:      ${data.length}`);
console.log(`Kept (strictly in 10 areas): ${kept}`);
console.log(`Reassigned to true area:     ${reassigned}`);
console.log(`Excluded (out of bounds):    ${excluded}`);
console.log('========================================================================\n');

// Print count per area
console.log('Area'.padEnd(16) + ' | ' + 'Restaurants'.padEnd(13) + ' | ' + 'Cafes'.padEnd(8) + ' | ' + 'Total');
console.log('-----------------------------------------------------------------');
let totR = 0, totC = 0;
AREAS_GEO.forEach(a => {
    const r = cleanPlaces.filter(x => x.area === a.name && (x.type === 'restaurant' || x.Category === 'Restaurant')).length;
    const c = cleanPlaces.filter(x => x.area === a.name && (x.type === 'cafe' || x.Category === 'Cafe')).length;
    totR += r;
    totC += c;
    console.log(a.name.padEnd(16) + ' | ' + String(r).padEnd(13) + ' | ' + String(c).padEnd(8) + ' | ' + (r + c));
});
console.log('-----------------------------------------------------------------');
console.log('TOTAL'.padEnd(16) + ' | ' + String(totR).padEnd(13) + ' | ' + String(totC).padEnd(8) + ' | ' + (totR + totC));
console.log('========================================================================\n');
