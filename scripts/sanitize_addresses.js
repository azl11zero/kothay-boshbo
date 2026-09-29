const fs = require('fs');

const files = ['data/full_dhaka_places.csv', 'data/restaurants.csv', 'data/cafes.csv'];
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf-8');
    content = content.replace(/"([^"]*)"/g, (match, inner) => {
        const clean = inner.replace(/[\r\n]+/g, ' · ').replace(/\s+/g, ' ').trim();
        return `"${clean}"`;
    });
    fs.writeFileSync(f, content, 'utf-8');
});

const list = JSON.parse(fs.readFileSync('data/all_listings.json', 'utf-8'));
list.forEach(item => {
    if (item.address) item.address = item.address.replace(/[\r\n]+/g, ' · ').replace(/\s+/g, ' ').trim();
    if (item.Address) item.Address = item.Address.replace(/[\r\n]+/g, ' · ').replace(/\s+/g, ' ').trim();
});
fs.writeFileSync('data/all_listings.json', JSON.stringify(list, null, 2), 'utf-8');

const cfg = fs.readFileSync('js/config.js', 'utf-8');
const newCfg = cfg.replace(/const MOCK_DATA = \[[\s\S]*?\];/, 'const MOCK_DATA = ' + JSON.stringify(list, null, 4) + ';');
fs.writeFileSync('js/config.js', newCfg, 'utf-8');
console.log('✅ Sanitized all address fields to clean single lines.');
