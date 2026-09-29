/* ============================================================
   Kothay Boshbo — Application Controller
   Matches the UI layout & interacts with Leaflet Map
   ============================================================ */

const KothayBoshboApp = (() => {
    'use strict';

    // ── Application State ──────────────────────────────────────
    const state = {
        currentType: 'restaurant',      // 'restaurant' | 'cafe'
        currentArea: 'Dhanmondi',       // Default selected area
        currentSort: 'rating',          // 'rating' | 'reviews' | 'name'
        searchQuery: '',                // Live search text
        mapViewMode: 'street',          // 'street' | 'satellite'
        allData: [],                    // Loaded listings
        markersMap: new Map(),          // id -> Leaflet marker
        leafletMap: null,               // Leaflet map instance
        tileLayers: {},                 // street & satellite layers
        areaCenterCircle: null          // Gold circle marker for area center
    };

    // ── SVG Icons ──────────────────────────────────────────────
    const GOLD_PIN_SVG = `
        <svg class="pin-marker-svg" width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 34 14 34C14 34 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#D4AF37" stroke="#121214" stroke-width="1.2"/>
            <circle cx="14" cy="13" r="6" fill="#121214"/>
            <circle cx="14" cy="13" r="3.2" fill="#F5D77F"/>
        </svg>
    `;

    // ── Helper: Parse Reviews to Number for Sorting ───────────
    function parseReviewCount(str) {
        if (!str) return 0;
        const cleaned = str.toString().replace(/,/g, '').trim().toUpperCase();
        if (cleaned.endsWith('K')) {
            return parseFloat(cleaned) * 1000;
        }
        return parseFloat(cleaned) || 0;
    }

    // ── Read URL Parameters ────────────────────────────────────
    function syncStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const typeParam = params.get('type');
        const areaParam = params.get('area');

        if (typeParam && (typeParam === 'restaurant' || typeParam === 'cafe')) {
            state.currentType = typeParam;
        }
        if (areaParam) {
            const foundArea = KothayBoshboConfig.AREAS.find(a => a.name.toLowerCase() === areaParam.toLowerCase());
            if (foundArea) {
                state.currentArea = foundArea.name;
            }
        }
    }

    function updateUrl() {
        const url = new URL(window.location);
        url.searchParams.set('type', state.currentType);
        url.searchParams.set('area', state.currentArea);
        window.history.replaceState({}, '', url);
    }

    // ── Helper: Format Fallback Data to Ensure Area & Category Keys Exist ──
    function formatFallbackData(items) {
        if (!Array.isArray(items)) return [];
        return items.filter(item => item.active !== false).map((item, idx) => ({
            ...item,
            Area: item.Area || item.area,
            Category: item.Category || (item.type === 'cafe' ? 'Cafe' : 'Restaurant'),
            area: item.area || item.Area,
            type: item.type || (item.Category && item.Category.toLowerCase().includes('cafe') ? 'cafe' : 'restaurant')
        }));
    }

    // ── Data Fetching with sessionStorage Caching (Quota Protection) ──
    async function loadData(forceRefresh = false) {
        const endpoint = KothayBoshboConfig.SHEET_ENDPOINT;

        if (!endpoint) {
            if (forceRefresh) {
                await new Promise(r => setTimeout(r, 400));
            }
            state.allData = formatFallbackData(KothayBoshboConfig.MOCK_DATA);
            return;
        }

        const CACHE_KEY = 'kothay_boshbo_data_v10';
        const CACHE_TIME_KEY = 'kothay_boshbo_timestamp_v10';
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache (protects 500 req/mo SheetDB quota)

        const cachedData = sessionStorage.getItem(CACHE_KEY);
        const cachedTime = sessionStorage.getItem(CACHE_TIME_KEY);
        const now = Date.now();

        // 1. Serve from cache if still fresh and not a forced manual refresh
        if (!forceRefresh && cachedData && cachedTime && (now - parseInt(cachedTime, 10) < CACHE_TTL)) {
            try {
                const data = JSON.parse(cachedData);
                console.log("Loaded places count from cache:", Array.isArray(data) ? data.length : 0);
                processRawData(data, true);
                return;
            } catch (e) {
                console.warn('Cache parse error, re-fetching from source:', e);
            }
        }

        // 2. Fetch from SheetDB / Google Sheets endpoint
        try {
            console.log(`🌐 Fetching from SheetDB API (forceRefresh: ${forceRefresh})...`);
            const res = await fetch(endpoint, { cache: forceRefresh ? 'reload' : 'default' });
            if (!res.ok) {
                if (res.status === 429) {
                    console.error("❌ SheetDB 429 Error: Too Many Requests! Monthly limit of 500 requests reached on SheetDB free tier.");
                } else {
                    console.error(`❌ SheetDB API Error: HTTP ${res.status} (${res.statusText})`);
                }
                throw new Error(`HTTP ${res.status} (${res.statusText})`);
            }
            const data = await res.json();
            const placesCount = Array.isArray(data) ? data.length : (data && data.data && Array.isArray(data.data) ? data.data.length : 0);
            console.log("Loaded places count from API:", placesCount);

            if (placesCount === 0) {
                console.warn("⚠️ Warning: SheetDB returned 0 items from the connected Google Sheet.");
            }

            // Save response in sessionStorage
            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
                sessionStorage.setItem(CACHE_TIME_KEY, now.toString());
            } catch (storageErr) {
                console.warn('Failed writing to sessionStorage:', storageErr);
            }

            processRawData(data, false);
        } catch (err) {
            console.error('❌ Failed fetching from SheetDB:', err.message || err);

            // Graceful fallback to cached data or mock dataset (prevents 429 quota errors from breaking site)
            if (cachedData) {
                console.info('Using stale cached data due to network/quota error.');
                try {
                    processRawData(JSON.parse(cachedData), true);
                } catch (e) {
                    state.allData = formatFallbackData(KothayBoshboConfig.MOCK_DATA);
                }
            } else {
                console.info(`Using curated Dhaka dataset (${KothayBoshboConfig.MOCK_DATA.length} venues) as fallback.`);
                state.allData = formatFallbackData(KothayBoshboConfig.MOCK_DATA);
            }
        }
    }

    /**
     * Parses, normalizes, and populates state.allData from raw data
     */
    function processRawData(data, fromCache = false) {
        let rawList = [];

        if (Array.isArray(data) && Array.isArray(data[0])) {
            rawList = parseSheetArray(data);
        } else if (Array.isArray(data)) {
            rawList = data;
        } else if (data && data.data && Array.isArray(data.data)) {
            rawList = data.data;
        }

        if (rawList.length > 0) {
            const sheetItems = rawList
                .map((item, idx) => normalizeListing(item, idx))
                .filter(item => item.active !== false);

            // Merge with curated master database so newly added areas (e.g. Uttara, Bashundhara R/A) are seamlessly included
            const existingNames = new Set(sheetItems.map(p => ((p.name || '') + '|' + (p.area || '')).toLowerCase().trim()));
            const masterList = formatFallbackData(KothayBoshboConfig.MOCK_DATA || []);
            const extraItems = masterList.filter(m => !existingNames.has(((m.name || '') + '|' + (m.area || '')).toLowerCase().trim()));

            state.allData = [...sheetItems, ...extraItems];
            console.log(`✅ Loaded ${state.allData.length} listings (${sheetItems.length} from SheetDB + ${extraItems.length} from curated dataset)`);
        } else {
            console.info('Sheet currently has no listings rows; displaying demo places.');
            state.allData = formatFallbackData(KothayBoshboConfig.MOCK_DATA);
        }
    }

    /**
     * Normalizes an object from SheetDB or Google Sheets, adapting to various
     * column name formats (e.g. "Name", "Google Map link", "Category", "Price Range").
     */
    function normalizeListing(raw, index) {
        // Case & whitespace insensitive key lookup
        const findVal = (keys, defaultVal = '') => {
            const rawKeys = Object.keys(raw);
            for (const rk of rawKeys) {
                const cleanRk = rk.toLowerCase().replace(/[\s_\-]+/g, '');
                for (const k of keys) {
                    if (cleanRk === k.toLowerCase().replace(/[\s_\-]+/g, '')) {
                        const val = raw[rk];
                        if (val !== undefined && val !== null && String(val).trim() !== '') {
                            return val;
                        }
                    }
                }
            }
            return defaultVal;
        };

        const name = findVal(['name', 'title', 'restaurantname', 'cafename'], 'Unnamed Place');
        const rawCat = findVal(['category', 'type', 'placetype'], 'Restaurant').toLowerCase();
        const type = (rawCat.includes('cafe') || rawCat.includes('coffee')) ? 'cafe' : 'restaurant';

        const areaStr = findVal(['area', 'location', 'zone'], 'Dhanmondi');
        // Match against known areas
        const matchedArea = KothayBoshboConfig.AREAS.find(a =>
            a.name.toLowerCase().replace(/\s+/g, '') === areaStr.toLowerCase().replace(/\s+/g, '')
        ) || { name: areaStr, lat: 23.7461, lng: 90.3742 };

        // Check if item exists in curated master database for rich metadata fallback
        const knownMeta = (KothayBoshboConfig.MOCK_DATA || []).find(m =>
            m.name.toLowerCase().trim() === name.toLowerCase().trim()
        ) || (KothayBoshboConfig.MOCK_DATA || []).find(m =>
            m.name.toLowerCase().includes(name.toLowerCase().trim()) &&
            m.area.toLowerCase() === matchedArea.name.toLowerCase()
        );

        // Lat & Lng
        const rawLat = parseFloat(findVal(['lat', 'latitude']));
        const rawLng = parseFloat(findVal(['lng', 'lon', 'longitude']));
        const offsetAngle = (index * 137.5) * (Math.PI / 180);
        const offsetDist = 0.002 + ((index % 5) * 0.001);
        let lat = !isNaN(rawLat) && rawLat !== 0 ? rawLat : (knownMeta && knownMeta.lat ? knownMeta.lat : (matchedArea.lat + Math.cos(offsetAngle) * offsetDist));
        let lng = !isNaN(rawLng) && rawLng !== 0 ? rawLng : (knownMeta && knownMeta.lng ? knownMeta.lng : (matchedArea.lng + Math.sin(offsetAngle) * offsetDist));

        // Google Maps URL
        let mapsUrl = findVal(['googlemaplink', 'googlemapsurl', 'maplink', 'mapslink', 'link', 'url']);
        if (!mapsUrl || !mapsUrl.startsWith('http')) {
            mapsUrl = knownMeta && knownMeta.google_maps_url ? knownMeta.google_maps_url : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + matchedArea.name + ' Dhaka')}`;
        }

        // Price range
        let priceRange = findVal(['pricerange', 'price', 'cost']);
        if (!priceRange) {
            priceRange = knownMeta && knownMeta.price_range ? knownMeta.price_range : '৳ - ৳৳';
        }

        // Rating
        const rawRating = parseFloat(findVal(['rating', 'stars', 'rate']));
        const rating = !isNaN(rawRating) && rawRating > 0 ? rawRating : (knownMeta && knownMeta.rating ? knownMeta.rating : 4.3);

        // Reviews
        const reviews = findVal(['reviews', 'reviewcount', 'reviewscount'], knownMeta && knownMeta.reviews ? knownMeta.reviews : '1.4K');

        // Image URL
        let imageUrl = findVal(['imageurl', 'image', 'photo', 'photourl']);
        if (!imageUrl || !imageUrl.startsWith('http')) {
            if (knownMeta && knownMeta.image_url) {
                imageUrl = knownMeta.image_url;
            } else {
                const demoImgs = [
                    'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnmJmV_TYiNxkfcb76AYtDd1oUzGueDGUMdOc8OyRke3b0HdyY6mv4SpYHyo2Is3wYrJJYXUtIjXO4GMiThoB9RdmJbQcFwZJOsbpzJj9kLJYFN9qg0orc6ucNWmU6hMXF_aI0=w600-h400-k-no',
                    'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnv2nQ_cgKTRJ0Xqa8s9rDZM3DxX1bjX36SIlZUbjBAm7JaJafEVPC5eBCJy27Vi4DE_30X3kEp3dY1pnD3AOkR9cktmnmfOoseIfe_rNSUiNUfquZHxtsQ18mIHVnzEvP1RAdVEg=w600-h400-k-no',
                    'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnj_OQ0EicxVqZfgUbUJ4zZeMRp1zGH4BUGphocRTlWwyqlOqHgHbolGlyWpyDqSoh8VfdACNHuegWKxAacz6R6xQeZwmASNxzBkCoQRD4Rfzk05ZemKBdoyH7GBfWpgqew8FWi=w600-h400-k-no',
                    'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnpogk4nX__xJ3Yn5TltEa9VNFmKStdxXrn_toWhgEXSTUYNEJlfaDbPPrvr7gkJbzfZXV3AdqXWSSKiKYUBkPB7PzGFMdJn8dtW0_y29NAaJxVPVSElnToja6HlVHFV8zseEuzOjptQ2jk=w600-h400-k-no',
                    'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWmLL_c1_j5kloV-poqNff1kOgfMEt8x6fy9dmBbpWSbfvo8BwQVslTv2hqbaXiym0eR5pq1alxPDFfyoHg46LN01Us7p16-vT3y0utQD1NfHQEaoqvXW61AHPa30NtPc4aFUqiP=w600-h400-k-no'
                ];
                imageUrl = demoImgs[index % demoImgs.length];
            }
        }

        const verifiedArea = (knownMeta && knownMeta.area) ? knownMeta.area : matchedArea.name;
        const verifiedAddress = (knownMeta && knownMeta.address) ? knownMeta.address : (findVal(['address', 'vicinity']) || `${verifiedArea}, Dhaka`);
        const cuisine = findVal(['cuisine', 'tags'], knownMeta && knownMeta.cuisine ? knownMeta.cuisine : (type === 'cafe' ? 'Coffee, Bakery & Desserts' : 'Bangladeshi, Continental'));
        const categoryTag = findVal(['categorytag'], knownMeta && knownMeta.category_tag ? knownMeta.category_tag : (type === 'cafe' ? 'Cafe' : 'Restaurant'));
        const active = findVal(['active', 'status'], 'TRUE');

        return {
            id: findVal(['id'], knownMeta && knownMeta.id ? knownMeta.id : `place-${index + 1}`),
            name,
            type,
            area: verifiedArea,
            Name: name,
            Category: type === 'cafe' ? 'Cafe' : 'Restaurant',
            Area: verifiedArea,
            rating,
            reviews,
            price_range: priceRange,
            category_tag: categoryTag,
            cuisine,
            address: verifiedAddress,
            google_maps_url: mapsUrl,
            image_url: imageUrl,
            lat,
            lng,
            active: String(active).toUpperCase() !== 'FALSE'
        };
    }

    function parseSheetArray(rows) {
        if (rows.length < 2) return [];
        const headers = rows[0].map(h => h.toString().trim());
        const list = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const obj = {};
            headers.forEach((key, col) => {
                obj[key] = row[col] !== undefined ? row[col] : '';
            });
            list.push(obj);
        }
        return list;
    }

    // ── Leaflet Map Setup ──────────────────────────────────────
    function initMap() {
        const areaInfo = KothayBoshboConfig.AREAS.find(a => a.name === state.currentArea) || KothayBoshboConfig.AREAS[4];

        // Create Leaflet map
        state.leafletMap = L.map('dhaka-map', {
            center: [areaInfo.lat, areaInfo.lng],
            zoom: 14.5,
            zoomControl: false // Move zoom control to bottom right
        });

        // Add custom zoom control at bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(state.leafletMap);

        // Esri World Street Map (high-definition global streets, 0 watermarks, 0 403 blocks, no API key required)
        state.tileLayers.street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Sources: Esri, DeLorme, NAVTEQ, TomTom, USGS',
            maxZoom: 19
        });

        // Esri World Imagery Satellite layer
        state.tileLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
        });

        state.tileLayers.street.addTo(state.leafletMap);

        // Map vs Satellite Buttons
        const streetBtn = document.getElementById('btn-map-street');
        const satBtn = document.getElementById('btn-map-satellite');

        streetBtn.addEventListener('click', () => {
            if (state.mapViewMode === 'street') return;
            state.leafletMap.removeLayer(state.tileLayers.satellite);
            state.leafletMap.addLayer(state.tileLayers.street);
            state.mapViewMode = 'street';
            streetBtn.classList.add('active');
            satBtn.classList.remove('active');
        });

        satBtn.addEventListener('click', () => {
            if (state.mapViewMode === 'satellite') return;
            state.leafletMap.removeLayer(state.tileLayers.street);
            state.leafletMap.addLayer(state.tileLayers.satellite);
            state.mapViewMode = 'satellite';
            satBtn.classList.add('active');
            streetBtn.classList.remove('active');
        });
    }

    // ── Update Map Pins for Selected Area & Category ───────────
    function updateMapPins(listings) {
        if (!state.leafletMap) return;

        // Clear existing markers
        state.markersMap.forEach(marker => {
            state.leafletMap.removeLayer(marker);
        });
        state.markersMap.clear();

        if (state.areaCenterCircle) {
            state.leafletMap.removeLayer(state.areaCenterCircle);
            state.areaCenterCircle = null;
        }

        const areaInfo = KothayBoshboConfig.AREAS.find(a => a.name === state.currentArea);
        if (!areaInfo) return;

        // Pan/Fly to area center
        state.leafletMap.flyTo([areaInfo.lat, areaInfo.lng], 14.5, {
            duration: 0.8
        });

        // Add golden location dot for area center
        state.areaCenterCircle = L.circleMarker([areaInfo.lat, areaInfo.lng], {
            radius: 8,
            fillColor: '#D4AF37',
            color: '#FFFFFF',
            weight: 2.5,
            opacity: 1,
            fillOpacity: 0.95
        }).addTo(state.leafletMap);

        // Add pins for each listing
        const pinIcon = L.divIcon({
            className: 'custom-map-pin',
            html: GOLD_PIN_SVG,
            iconSize: [28, 34],
            iconAnchor: [14, 34],
            popupAnchor: [0, -32]
        });

        listings.forEach(place => {
            if (!place.lat || !place.lng) return;

            const reviewsText = place.reviews ? `• <span>(${place.reviews} reviews)</span>` : '';
            const popupContent = `
                <div class="map-popup-inner">
                    <h4 class="map-popup-title">${place.name}</h4>
                    <div class="map-popup-meta">
                        <span class="popup-rating">⭐ ${place.rating.toFixed(1)}</span> ${reviewsText}
                    </div>
                    <div class="map-popup-addr">${place.address || place.area}</div>
                    <a href="${place.google_maps_url}" target="_blank" rel="noopener" class="map-popup-link">
                        📍 View on Google Maps
                    </a>
                </div>
            `;

            const marker = L.marker([place.lat, place.lng], { icon: pinIcon })
                .bindPopup(popupContent)
                .addTo(state.leafletMap);

            marker.on('click', () => {
                highlightCard(place.id);
            });

            state.markersMap.set(place.id, marker);
        });
    }

    function highlightCard(id) {
        document.querySelectorAll('.listing-card').forEach(c => c.classList.remove('active-selected'));
        const el = document.getElementById(`card-${id}`);
        if (el) {
            el.classList.add('active-selected');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // ── Render Area Selector Bar ───────────────────────────────
    function renderAreaPills() {
        const container = document.getElementById('area-pills-container');
        container.innerHTML = '';

        KothayBoshboConfig.AREAS.forEach(area => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `area-pill ${area.name === state.currentArea ? 'active' : ''}`;
            btn.textContent = area.name;

            btn.addEventListener('click', () => {
                if (state.currentArea === area.name) return;
                state.currentArea = area.name;
                updateUrl();
                updateAreaPillsActiveState();
                renderListings();
            });

            container.appendChild(btn);
        });
    }

    function updateAreaPillsActiveState() {
        const pills = document.querySelectorAll('.area-pill');
        pills.forEach(pill => {
            if (pill.textContent.trim() === state.currentArea) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
    }

    // ── Category Toggles (Restaurants / Cafes) ─────────────────
    function setupTypeToggles() {
        const resBtn = document.getElementById('btn-restaurants');
        const cafeBtn = document.getElementById('btn-cafes');

        function updateToggleClasses() {
            if (state.currentType === 'restaurant') {
                resBtn.classList.add('active');
                cafeBtn.classList.remove('active');
            } else {
                cafeBtn.classList.add('active');
                resBtn.classList.remove('active');
            }
        }

        resBtn.addEventListener('click', () => {
            if (state.currentType === 'restaurant') return;
            state.currentType = 'restaurant';
            updateUrl();
            updateToggleClasses();
            renderListings();
        });

        cafeBtn.addEventListener('click', () => {
            if (state.currentType === 'cafe') return;
            state.currentType = 'cafe';
            updateUrl();
            updateToggleClasses();
            renderListings();
        });

        updateToggleClasses();
    }

    // ── Render Results List ────────────────────────────────────
    function renderListings() {
        const listContainer = document.getElementById('listings-list');
        const headingEl = document.getElementById('results-heading');
        const countEl = document.getElementById('results-count');
        const emptyView = document.getElementById('empty-view');

        const selectedArea = state.currentArea;
        const selectedCategory = state.currentType === 'cafe' ? 'Cafe' : 'Restaurant';

        // Filter data by selected category and area (case-insensitive & trimmed matching)
        let filtered = state.allData.filter(item => {
            const itemArea = (item.Area || item.area || '').toString();
            const itemCategory = (item.Category || item.category || item.type || '').toString();

            const matchesArea = itemArea && itemArea.trim().toLowerCase() === selectedArea.trim().toLowerCase();
            const matchesCategory = itemCategory && (
                itemCategory.trim().toLowerCase() === selectedCategory.trim().toLowerCase() ||
                (selectedCategory.toLowerCase() === 'restaurant' && (itemCategory.trim().toLowerCase() === 'restaurant' || itemCategory.trim().toLowerCase() === 'restaurants')) ||
                (selectedCategory.toLowerCase() === 'cafe' && (itemCategory.trim().toLowerCase() === 'cafe' || itemCategory.trim().toLowerCase() === 'cafes' || itemCategory.trim().toLowerCase().includes('coffee')))
            );

            if (!matchesArea || !matchesCategory) return false;

            // Apply live search query if present
            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const name = (item.name || '').toLowerCase();
                const cuisine = (item.cuisine || '').toLowerCase();
                const address = (item.address || '').toLowerCase();
                const categoryTag = (item.category_tag || '').toLowerCase();
                const matchesSearch = name.includes(q) || cuisine.includes(q) || address.includes(q) || categoryTag.includes(q);
                if (!matchesSearch) return false;
            }

            return true;
        });

        // Sort data
        if (state.currentSort === 'rating') {
            filtered.sort((a, b) => b.rating - a.rating);
        } else if (state.currentSort === 'reviews') {
            filtered.sort((a, b) => parseReviewCount(b.reviews) - parseReviewCount(a.reviews));
        } else if (state.currentSort === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Update heading & count text
        const typeLabel = state.currentType === 'restaurant' ? 'Restaurants' : 'Cafes';
        if (state.searchQuery) {
            headingEl.textContent = `${typeLabel} matching "${state.searchQuery}" in ${state.currentArea}`;
        } else {
            headingEl.textContent = `${typeLabel} in ${state.currentArea}`;
        }
        countEl.textContent = `Showing ${filtered.length} result${filtered.length === 1 ? '' : 's'}`;

        // Empty state handling
        if (filtered.length === 0) {
            listContainer.innerHTML = '';
            emptyView.style.display = 'block';
            const emptyTitle = emptyView.querySelector('h3');
            const emptyDesc = emptyView.querySelector('p');
            if (state.searchQuery) {
                if (emptyTitle) emptyTitle.textContent = `No matches for "${state.searchQuery}"`;
                if (emptyDesc) emptyDesc.textContent = `No ${typeLabel.toLowerCase()} found matching "${state.searchQuery}" in ${state.currentArea}. Try clearing the search or checking another area.`;
            } else {
                if (emptyTitle) emptyTitle.textContent = 'No listings found';
                if (emptyDesc) emptyDesc.textContent = 'No places found matching this criteria. Try selecting another area!';
            }
            updateMapPins([]);
            return;
        }

        emptyView.style.display = 'none';
        listContainer.innerHTML = '';

        // Build cards
        filtered.forEach(place => {
            const card = document.createElement('div');
            card.className = 'listing-card';
            card.id = `card-${place.id}`;

            // Image fallback handler
            const imgHtml = `
                <div class="card-thumb-wrap">
                    <img src="${place.image_url}" alt="${place.name}" class="card-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnmJmV_TYiNxkfcb76AYtDd1oUzGueDGUMdOc8OyRke3b0HdyY6mv4SpYHyo2Is3wYrJJYXUtIjXO4GMiThoB9RdmJbQcFwZJOsbpzJj9kLJYFN9qg0orc6ucNWmU6hMXF_aI0=w600-h400-k-no'">
                </div>
            `;

            const typeTag = place.category_tag || (place.type === 'restaurant' ? 'Restaurant' : 'Cafe');
            const cuisineStr = place.cuisine ? ` • ${place.cuisine}` : '';
            const reviewsDisplay = place.reviews ? `(${place.reviews} reviews)` : '';

            card.innerHTML = `
                ${imgHtml}
                <div class="card-content">
                    <h3 class="card-title">${place.name}</h3>

                    <div class="card-stats-line">
                        <span class="rating-badge">${place.rating.toFixed(1)} <span class="star-icon">★</span></span>
                        <span class="reviews-count">${reviewsDisplay}</span>
                    </div>

                    <div class="card-cuisine">
                        <span class="card-type-tag">${typeTag}</span>${cuisineStr}
                    </div>

                    <div class="card-location">
                        <svg class="loc-pin-icon" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        <span>${place.address || (place.area + ', Dhaka')}</span>
                    </div>

                    <a href="${place.google_maps_url}" target="_blank" rel="noopener" class="card-maps-link" onclick="event.stopPropagation();">
                        <svg class="maps-pin-svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        <span>View on Google Maps</span>
                    </a>
                </div>

                <div class="card-chevron">
                    <svg class="chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </div>
            `;

            // Clicking card centers marker on map and opens its popup
            card.addEventListener('click', () => {
                const marker = state.markersMap.get(place.id);
                if (marker && state.leafletMap) {
                    state.leafletMap.flyTo([place.lat, place.lng], 16, { duration: 0.5 });
                    marker.openPopup();
                }
                highlightCard(place.id);
            });

            listContainer.appendChild(card);
        });

        // Update map pins
        updateMapPins(filtered);
    }

    // ── Sort, Search & Refresh Listeners ───────────────────────
    function setupControls() {
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                state.currentSort = e.target.value;
                renderListings();
            });
        }

        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.classList.add('loading');
                await loadData(true);
                renderListings();
                setTimeout(() => {
                    refreshBtn.classList.remove('loading');
                }, 600);
            });
        }

        // Live Search Input & Clear Button
        const searchInput = document.getElementById('place-search-input');
        const clearBtn = document.getElementById('search-clear-btn');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.searchQuery = e.target.value.trim();
                if (clearBtn) {
                    clearBtn.style.display = state.searchQuery ? 'flex' : 'none';
                }
                renderListings();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                state.searchQuery = '';
                clearBtn.style.display = 'none';
                renderListings();
            });
        }
    }

    // ── Application Initialization ─────────────────────────────
    async function init() {
        syncStateFromUrl();
        setupTypeToggles();
        renderAreaPills();
        setupControls();
        initMap();

        await loadData();
        renderListings();
    }

    return {
        init
    };
})();

const DhakaDineApp = KothayBoshboApp;

// Boot on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    KothayBoshboApp.init();
});
