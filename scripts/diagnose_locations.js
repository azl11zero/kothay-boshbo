const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/all_listings.json', 'utf-8'));

const AREA_CENTERS = {
    'Mirpur 1':    { lat: 23.8045, lng: 90.3540, maxDistKm: 1.8 },
    'Mirpur 10':   { lat: 23.8070, lng: 90.3685, maxDistKm: 1.5 },
    'Mirpur 11':   { lat: 23.8180, lng: 90.3645, maxDistKm: 1.5 },
    'Mirpur 12':   { lat: 23.8270, lng: 90.3610, maxDistKm: 1.8 },
    'Dhanmondi':   { lat: 23.7461, lng: 90.3742, maxDistKm: 2.2 },
    'Gulshan 1':   { lat: 23.7785, lng: 90.4150, maxDistKm: 1.5 },
    'Gulshan 2':   { lat: 23.7936, lng: 90.4135, maxDistKm: 1.8 },
    'Banani':      { lat: 23.7940, lng: 90.4045, maxDistKm: 1.5 },
    'Shantinagar': { lat: 23.7380, lng: 90.4130, maxDistKm: 1.8 },
    'Khilgaon':    { lat: 23.7510, lng: 90.4220, maxDistKm: 1.8 }
};

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

console.log(`Total places loaded: ${data.length}`);

let misplacedCount = 0;
let textMismatchCount = 0;
const issues = [];

data.forEach(p => {
    const center = AREA_CENTERS[p.area];
    if (!center) return;

    const dist = haversineKm(p.lat, p.lng, center.lat, center.lng);
    const addr = (p.address || '').toLowerCase();
    const name = (p.name || '').toLowerCase();

    // Check if distance is too far (> maxDistKm)
    let closestArea = p.area;
    let minDistance = dist;

    for (const [aName, aCenter] of Object.entries(AREA_CENTERS)) {
        const d = haversineKm(p.lat, p.lng, aCenter.lat, aCenter.lng);
        if (d < minDistance) {
            minDistance = d;
            closestArea = aName;
        }
    }

    if (dist > center.maxDistKm) {
        misplacedCount++;
        issues.push({
            name: p.name,
            assignedArea: p.area,
            closestArea: closestArea,
            distToAssigned: dist.toFixed(2) + 'km',
            distToClosest: minDistance.toFixed(2) + 'km',
            address: p.address,
            lat: p.lat,
            lng: p.lng
        });
    }
});

console.log(`\nPlaces exceeding their area's boundary radius: ${misplacedCount} / ${data.length}`);
console.log('Sample of 10 misplaced places:');
console.log(JSON.stringify(issues.slice(0, 10), null, 2));
