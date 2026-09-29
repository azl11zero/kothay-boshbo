const puppeteer = require('puppeteer-core');

async function test() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--lang=en-US,en'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const query = 'restaurants in Dhanmondi, Dhaka';
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Check if consent button appears
        try {
            const consentBtn = await page.$('button[aria-label*="Accept all"], form[action*="consent"] button');
            if (consentBtn) {
                await consentBtn.click();
                await page.waitForTimeout(2000);
            }
        } catch (e) {}

        // Wait for results feed
        await page.waitForSelector('div[role="feed"], div.Nv2PK', { timeout: 15000 });
        console.log('Found feed/cards container!');

        // Get initial items count
        let items = await page.$$eval('div.Nv2PK', els => els.map(el => {
            const linkEl = el.querySelector('a.hfpxzc');
            const nameEl = el.querySelector('.qBF1Pd') || linkEl;
            const ratingEl = el.querySelector('.MW4etd');
            const reviewsEl = el.querySelector('.UY7F9');
            
            // Look for price or details
            const textContainers = el.querySelectorAll('.W4Efsd');
            let infoText = '';
            textContainers.forEach(tc => { infoText += ' ' + tc.innerText; });

            return {
                name: nameEl ? (nameEl.innerText || nameEl.getAttribute('aria-label')) : '',
                link: linkEl ? linkEl.href : '',
                rating: ratingEl ? ratingEl.innerText : '',
                reviews: reviewsEl ? reviewsEl.innerText.replace(/[()]/g, '') : '',
                snippet: infoText.trim()
            };
        }));

        console.log(`Initial items scraped: ${items.length}`);
        console.log('First 3 items:', items.slice(0, 3));

    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

test();
