const fs = require('fs');
const state = JSON.parse(fs.readFileSync('scripts/app_state.json', 'utf-8'));

// Check strings and arrays in state
function findPlaces(obj, depth = 0) {
    if (!obj || depth > 8) return [];
    let places = [];
    if (Array.isArray(obj)) {
        // If it's an array with place info, often has name as string, coordinates, etc.
        for (let item of obj) {
            places = places.concat(findPlaces(item, depth + 1));
        }
    } else if (typeof obj === 'string') {
        if (obj.length > 3 && obj.length < 50 && (obj.includes('Restaurant') || obj.includes('Cafe') || obj.includes('Kabab') || obj.includes('Biryani') || obj.includes('Bistro'))) {
            places.push(obj);
        }
    }
    return places;
}

const found = findPlaces(state);
console.log('Sample found strings:', found.slice(0, 15));
