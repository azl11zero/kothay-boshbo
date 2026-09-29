const areas = [
    { name: 'Mirpur 1', lat: 23.8045, lng: 90.3540, radius: 1500 },
    { name: 'Mirpur 10', lat: 23.8070, lng: 90.3685, radius: 1500 },
    { name: 'Mirpur 11', lat: 23.8180, lng: 90.3645, radius: 1500 },
    { name: 'Mirpur 12', lat: 23.8270, lng: 90.3610, radius: 1500 },
    { name: 'Dhanmondi', lat: 23.7461, lng: 90.3742, radius: 2000 },
    { name: 'Gulshan 1', lat: 23.7785, lng: 90.4150, radius: 1500 },
    { name: 'Gulshan 2', lat: 23.7936, lng: 90.4135, radius: 1500 },
    { name: 'Banani', lat: 23.7940, lng: 90.4045, radius: 1500 },
    { name: 'Shantinagar', lat: 23.7380, lng: 90.4130, radius: 1500 },
    { name: 'Khilgaon', lat: 23.7510, lng: 90.4220, radius: 1500 }
];

async function checkArea(a) {
    const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"restaurant|cafe|fast_food"](around:${a.radius},${a.lat},${a.lng});
      way["amenity"~"restaurant|cafe|fast_food"](around:${a.radius},${a.lat},${a.lng});
    );
    out center tags;
    `;

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query)
        });
        const data = await res.json();
        const named = data.elements.filter(e => e.tags && (e.tags.name || e.tags['name:en']));
        console.log(`${a.name}: ${data.elements.length} total elements, ${named.length} with names.`);
        if (named.length > 0) {
            console.log('Sample names:', named.slice(0, 5).map(e => e.tags.name || e.tags['name:en']));
        }
        return named;
    } catch (e) {
        console.error('Error for ' + a.name, e.message);
        return [];
    }
}

async function run() {
    for (const a of areas.slice(0, 3)) {
        await checkArea(a);
    }
}

run();
