async function testMapsSearch() {
    const url = 'https://www.google.com/maps/search/restaurants+in+Dhanmondi+Dhaka';
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        const html = await res.text();
        console.log('Status:', res.status, 'HTML length:', html.length);
        
        // Google Maps embeds data in window.APP_INITIALIZATION_STATE or strings
        const fs = require('fs');
        fs.writeFileSync('scripts/maps_sample.html', html, 'utf-8');
        console.log('Wrote maps_sample.html');
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

testMapsSearch();
