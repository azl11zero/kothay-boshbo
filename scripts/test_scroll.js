const puppeteer = require('puppeteer-core');

async function testScroll() {
    console.log('Testing sidebar scrolling on Google Maps...');
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US,en']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const query = 'restaurants in Dhanmondi, Dhaka';
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('div[role="feed"], div.Nv2PK', { timeout: 15000 });

    const countBefore = await page.$$eval('div.Nv2PK', els => els.length);
    console.log(`Cards before scroll: ${countBefore}`);

    // Auto-scroll the sidebar
    await page.evaluate(async () => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return;
        for (let i = 0; i < 8; i++) {
            feed.scrollTop = feed.scrollHeight;
            await new Promise(r => setTimeout(r, 1200));
        }
    });

    const countAfter = await page.$$eval('div.Nv2PK', els => els.length);
    console.log(`Cards after scroll: ${countAfter}`);

    await browser.close();
}

testScroll();
