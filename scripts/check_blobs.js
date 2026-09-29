const fs = require('fs');
const html = fs.readFileSync('scripts/maps_sample.html', 'utf-8');

// Also look for window.APP_INITIALIZATION_STATE or `)]}'`
const stateMatch = html.match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[[\s\S]*?\]);/);
if (stateMatch) {
    try {
        const state = JSON.parse(stateMatch[1]);
        console.log('Parsed state length:', state.length);
        fs.writeFileSync('scripts/app_state.json', JSON.stringify(state, null, 2));
        console.log('Saved app_state.json');
    } catch (e) {
        console.log('Failed to JSON parse state:', e.message);
    }
}

// Look for data blobs like `var _ =` or `)]}'`
const dataBlobs = html.match(/\)\]\}'\s*\n([\s\S]*?)<\/script>/g);
console.log('Data blobs count:', dataBlobs ? dataBlobs.length : 0);
