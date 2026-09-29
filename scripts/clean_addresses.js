const fs = require('fs');

const list = JSON.parse(fs.readFileSync('data/all_listings.json', 'utf-8'));

const allAreas = ['Mirpur 12', 'Mirpur 11', 'Mirpur 10', 'Mirpur 1', 'Gulshan 2', 'Gulshan 1', 'Banani', 'Dhanmondi', 'Shantinagar', 'Khilgaon'];

list.forEach(item => {
    let addr = (item.address || item.Address || '').trim();

    // Strip duplicate mentions of area and Dhaka
    addr = addr.replace(/,\s*Dhaka/gi, '');
    
    allAreas.forEach(a => {
        // If it starts with another area name that isn't item.area, strip it
        if (a !== item.area && addr.startsWith(a)) {
            addr = addr.substring(a.length).replace(/^[,·\s]+/, '').trim();
        }
        // Remove repeated mentions of item.area
        const re = new RegExp(`(^|[,·\\s]+)${a}`, 'gi');
        addr = addr.replace(re, ' ');
    });

    addr = addr.replace(/·\s*Open.*$/gi, '').replace(/·\s*Closed.*$/gi, '').replace(/\s+/g, ' ').trim();
    addr = addr.replace(/^[,·\s]+|[,·\s]+$/g, '').trim();

    if (!addr || addr.length < 3) {
        item.address = `${item.area}, Dhaka`;
        item.Address = `${item.area}, Dhaka`;
    } else {
        item.address = `${addr}, ${item.area}, Dhaka`;
        item.Address = `${addr}, ${item.area}, Dhaka`;
    }
});

fs.writeFileSync('data/all_listings.json', JSON.stringify(list, null, 2), 'utf-8');

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

fs.writeFileSync('data/full_dhaka_places.csv', toCSV(list, CSV_COLUMNS), 'utf-8');
fs.writeFileSync('data/restaurants.csv', toCSV(list.filter(x => x.Category === 'Restaurant'), CSV_COLUMNS), 'utf-8');
fs.writeFileSync('data/cafes.csv', toCSV(list.filter(x => x.Category === 'Cafe'), CSV_COLUMNS), 'utf-8');

const cfg = fs.readFileSync('js/config.js', 'utf-8');
const newCfg = cfg.replace(/const MOCK_DATA = \[[\s\S]*?\];/, 'const MOCK_DATA = ' + JSON.stringify(list, null, 4) + ';');
fs.writeFileSync('js/config.js', newCfg, 'utf-8');

console.log('✅ Cleaned all address strings to avoid duplicate area mentions.');
