const fs = require('fs');
const html = fs.readFileSync('scripts/maps_sample.html', 'utf-8');

// Look for window.APP_INITIALIZATION_STATE
const appInitMatch = html.match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[[\s\S]*?\]);/);
if (appInitMatch) {
    console.log('Found APP_INITIALIZATION_STATE!');
    console.log('Length:', appInitMatch[1].length);
} else {
    console.log('No APP_INITIALIZATION_STATE found directly.');
}

// Let's search for restaurant names or string patterns in the HTML
const regex = /\[\"([^\"]+?)\",null,null,null,null,null,null,null,null,\[([0-9\.]+),([0-9\.]+)\]/g;
let m;
let count = 0;
while ((m = regex.exec(html)) !== null && count < 10) {
    console.log(`Found place: ${m[1]} at ${m[2]}, ${m[3]}`);
    count++;
}

// Let's search for patterns with ratings or review counts
const matches = html.match(/\[null,null,([1-5]\.[0-9]),([0-9]+)\]/g);
console.log('Rating matches:', matches ? matches.length : 0);
if (matches) console.log(matches.slice(0, 5));
