async function testTbmMap() {
    const query = encodeURIComponent('restaurants in Dhanmondi Dhaka');
    const url = `https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=bd&q=${query}`;
    
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        const text = await res.text();
        console.log('Status:', res.status, 'Length:', text.length);
        fs.writeFileSync('scripts/tbm_sample.txt', text, 'utf-8');
        console.log('Wrote tbm_sample.txt');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

const fs = require('fs');
testTbmMap();
