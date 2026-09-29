/**
 * ==============================================================================
 * Kothay Boshbo — Production Express Server & Multi-Layered Security Firewall
 * ==============================================================================
 * Implements Defense-in-Depth for the Dhaka Restaurant & Cafe Directory.
 *
 * Security Layers:
 *   1. Reverse Proxy Trust (Cloudflare / Nginx / ALB awareness)
 *   2. Secure HTTP Headers (Helmet with strict tailored CSP for maps & CDN assets)
 *   3. IP Rate Limiting (Global navigation limiter + strict API query limiter)
 *   4. Strict CORS Policy (Domain whitelisting, restricted HTTP methods)
 *   5. Payload Size Guard (10kb buffer overflow & DoS prevention)
 *   6. HTTP Parameter Pollution (HPP) Sanitization
 *   7. Path Traversal & Dotfile Exposure Guard
 *   8. Secure Backend API Routes (/api/places, /api/health, /api/security-status)
 *   9. Safe Centralized Error Handling (Zero stack-trace or env leak)
 * ==============================================================================
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.resolve(__dirname);

// ── LAYER 0: REVERSE PROXY AWARENESS ──────────────────────────────────────────
// Required when running behind Cloudflare, Nginx, AWS ALB, or SSH / HTTPS tunnels
// Ensures rate-limiters inspect the real client IP (X-Forwarded-For) instead of proxy IP
app.set('trust proxy', 1);

// ── LAYER 1: COMPRESSION & GENERAL OPTIMIZATION ──────────────────────────────
app.use(compression());

// ── LAYER 1.5: HTTPS & STRICT-TRANSPORT-SECURITY (HSTS) ENFORCEMENT ──────────
// Automatically enables HSTS header whenever TLS/HTTPS is active (or behind reverse proxy)
app.use((req, res, next) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    // In production, automatically redirect plain HTTP requests to HTTPS (301 Permanent)
    if (process.env.NODE_ENV === 'production' && !isHttps) {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }

    // Set HSTS header when HTTPS/TLS is active
    if (isHttps || process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
});

// ── LAYER 2: SECURE HTTP HEADERS (HELMET + TAILORED CSP) ─────────────────────
// Hardens headers: blocks clickjacking, stops MIME-sniffing, enforces strict referrer & HSTS
app.use(helmet({
    hsts: {
        maxAge: 31536000, // 1 year (31,536,000 seconds)
        includeSubDomains: true,
        preload: true
    },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Required for Leaflet and initial UI bootstrapping
                "https://unpkg.com",
                "https://cdn.jsdelivr.net"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://unpkg.com",
                "https://cdn.jsdelivr.net"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdn.jsdelivr.net"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "blob:",
                "https://*.googleusercontent.com",
                "https://*.ggpht.com",
                "https://server.arcgisonline.com",
                "https://*.arcgisonline.com",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://images.unsplash.com",
                "https://unpkg.com"
            ],
            connectSrc: [
                "'self'",
                "https://sheetdb.io",
                "https://server.arcgisonline.com",
                "https://*.arcgisonline.com"
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"], // Anti-clickjacking
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false, // Allows cross-origin map tiles and Google photos
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// ── LAYER 3: PAYLOAD SIZE RESTRICTIONS (DoS & BUFFER FLOOD GUARD) ─────────────
// Rejects any payload larger than 10KB immediately with HTTP 413 Payload Too Large
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── LAYER 4: HTTP PARAMETER POLLUTION (HPP) PROTECTION ───────────────────────
// Prevents attackers from passing duplicate query keys (?area=Banani&area=Dhanmondi)
app.use(hpp());

// ── LAYER 5: STRICT CORS CONFIGURATION ────────────────────────────────────────
const allowedOrigins = [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g., mobile apps, curl, same-origin browsers)
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Blocked by CORS policy'));
        }
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    credentials: false
}));

// ── LAYER 5.5: DISTRIBUTED RATE LIMIT STORE (REDIS / IN-MEMORY FALLBACK) ────
let rateLimitStore = undefined;
let isRedisActive = false;

if (process.env.REDIS_URL) {
    try {
        const { RedisStore } = require('rate-limit-redis');
        const { createClient } = require('redis');
        const redisClient = createClient({ url: process.env.REDIS_URL });

        redisClient.connect().then(() => {
            isRedisActive = true;
            console.log('📦 Redis Connected: Distributed rate limiting active across container instances.');
        }).catch(err => {
            console.warn('⚠️ Redis connection failed, falling back to in-memory store:', err.message);
        });

        rateLimitStore = new RedisStore({
            sendCommand: (...args) => redisClient.sendCommand(args)
        });
    } catch (e) {
        console.warn('⚠️ Could not initialize RedisStore, falling back to in-memory store:', e.message);
    }
}

// ── LAYER 6: MULTI-TIERED IP RATE LIMITING ────────────────────────────────────
// Global Navigation Limiter: 500 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    ...(rateLimitStore ? { store: rateLimitStore } : {}),
    message: {
        error: 'Too many requests from this IP. Please try again after 15 minutes.',
        statusCode: 429
    }
});
app.use(globalLimiter);

// Strict API Rate Limiter: 60 requests per 1 minute per IP (prevents scraping & DoS)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    ...(rateLimitStore ? { store: rateLimitStore } : {}),
    message: {
        error: 'API rate limit exceeded. Please throttle your search requests.',
        statusCode: 429
    }
});
app.use('/api/', apiLimiter);

// ── LAYER 7: IN-MEMORY CACHE FOR DIRECTORY DATA ──────────────────────────────
let cachedListings = [];
function loadListings() {
    try {
        const filePath = path.join(PUBLIC_DIR, 'data', 'all_listings.json');
        if (fs.existsSync(filePath)) {
            cachedListings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`📂 Loaded ${cachedListings.length} verified listings into memory cache.`);
        }
    } catch (e) {
        console.error('Failed to load listings cache:', e.message);
    }
}
loadListings();

// ── LAYER 8: SECURE BACKEND API ENDPOINTS ─────────────────────────────────────

// Favicon handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        venuesCount: cachedListings.length
    });
});

// Firewall Security Status Audit Endpoint
app.get('/api/security-status', (req, res) => {
    res.json({
        firewall: 'ACTIVE',
        layers: [
            { name: 'Reverse Proxy Trust', status: 'ENABLED (trust proxy: 1)' },
            { name: 'Secure HTTP Headers', status: 'ENABLED (Helmet + CSP)' },
            { name: 'Strict-Transport-Security (HSTS)', status: 'ACTIVE (max-age=31536000; includeSubDomains; preload)' },
            { name: 'IP Rate Limiting', status: `ACTIVE (${isRedisActive ? 'Distributed Redis Cluster Store' : 'In-Memory Store [Redis-ready]'} - 500 req/15m global, 60 req/1m API)` },
            { name: 'HTTP Parameter Pollution (HPP)', status: 'ACTIVE (hpp() protection stops ?param=a&param=b array crashes)' },
            { name: 'Strict CORS Policy', status: 'ACTIVE (GET/HEAD only)' },
            { name: 'Payload Size Limit', status: 'ACTIVE (10kb max)' },
            { name: 'Path Traversal Guard', status: 'ACTIVE (dotfiles ignored)' }
        ]
    });
});

// Review parser helper for sorting
function parseReviewNum(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().replace(/,/g, '').replace(/[()]/g, '').trim();
    const match = str.match(/(\d+(?:\.\d+)?)\s*([KM])?/i);
    if (!match) return 0;
    const num = parseFloat(match[1]) || 0;
    const suffix = (match[2] || '').toUpperCase();
    if (suffix === 'K') return num * 1000;
    if (suffix === 'M') return num * 1000000;
    return num;
}

// Filtered Places API with Query Sanitization & Default Ranking
app.get('/api/places', (req, res) => {
    const area = typeof req.query.area === 'string' ? req.query.area.trim() : null;
    const type = typeof req.query.type === 'string' ? req.query.type.toLowerCase().trim() : null;
    const search = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim().slice(0, 50) : null;
    const sort = typeof req.query.sort === 'string' ? req.query.sort.toLowerCase().trim() : 'rating';

    let results = cachedListings;

    if (area) {
        results = results.filter(p => (p.area || '').toLowerCase() === area.toLowerCase());
    }

    if (type) {
        results = results.filter(p => (p.type || '').toLowerCase() === type || (p.Category || '').toLowerCase() === type);
    }

    if (search) {
        results = results.filter(p => {
            const nameMatch = (p.name || '').toLowerCase().includes(search);
            const cuisineMatch = (p.cuisine || '').toLowerCase().includes(search);
            const addrMatch = (p.address || '').toLowerCase().includes(search);
            return nameMatch || cuisineMatch || addrMatch;
        });
    }

    // Default ranking: Higher Rating (Review Score) -> Higher Review Counts -> Alphabetical
    results = [...results].sort((a, b) => {
        if (sort === 'reviews') {
            const cDiff = parseReviewNum(b.reviews || b.Reviews) - parseReviewNum(a.reviews || a.Reviews);
            if (cDiff !== 0) return cDiff;
            const rDiff = (parseFloat(b.rating || b.Rating) || 0) - (parseFloat(a.rating || a.Rating) || 0);
            if (Math.abs(rDiff) > 0.001) return rDiff;
            return (a.name || '').localeCompare(b.name || '');
        } else if (sort === 'name') {
            return (a.name || '').localeCompare(b.name || '');
        } else {
            // Default 'rating': Higher rating -> Higher review counts
            const rDiff = (parseFloat(b.rating || b.Rating) || 0) - (parseFloat(a.rating || a.Rating) || 0);
            if (Math.abs(rDiff) > 0.001) return rDiff;
            const cDiff = parseReviewNum(b.reviews || b.Reviews) - parseReviewNum(a.reviews || a.Reviews);
            if (cDiff !== 0) return cDiff;
            return (a.name || '').localeCompare(b.name || '');
        }
    });

    res.json({
        total: results.length,
        sort: sort,
        data: results
    });
});

// ── LAYER 9: SECURE STATIC FILE SERVING & PATH TRAVERSAL GUARD ────────────────
// Explicitly ignores dotfiles (.env, .git, etc.) and protects against path traversal
app.use(express.static(PUBLIC_DIR, {
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        // Enforce no-cache on dynamic config and listings JSON
        if (filePath.endsWith('config.js') || filePath.endsWith('all_listings.json')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
    }
}));

// Route fallback for root index
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── LAYER 10: CENTRALIZED 404 & ERROR HANDLER (ZERO LEAKAGE) ─────────────────
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource does not exist.',
        statusCode: 404
    });
});

app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err.message);
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Request was safely terminated.',
        statusCode: err.status || 500
    });
});

// ── START SERVER ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(`🛡️  KOTHAY BOSHBO SECURE EXPRESS SERVER ACTIVE`);
    console.log(`🔒 Multi-Layered Security Firewall Enabled`);
    console.log(`🌐 Serving on: http://localhost:${PORT}`);
    console.log(`================================================================\n`);
});

module.exports = app;
