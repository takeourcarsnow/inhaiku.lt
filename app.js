require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Improved Cache implementation
class Cache {
    constructor(maxAge) {
        this.store = new Map();
        this.maxAge = maxAge;
        this.cleanup();
    }

    set(key, value) {
        this.store.set(key, {
            timestamp: Date.now(),
            data: value
        });
    }

    get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        if (Date.now() - item.timestamp > this.maxAge) {
            this.store.delete(key);
            return null;
        }
        return item.data;
    }

    clear() {
        this.store.clear();
    }

    cleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.store.entries()) {
                if (now - value.timestamp > this.maxAge) {
                    this.store.delete(key);
                }
            }
        }, 60000);
    }
}

// Cache configurations
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const HAIKU_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const newsCache = new Cache(CACHE_DURATION);
const haikuCache = new Cache(HAIKU_CACHE_DURATION);

// Circuit Breaker implementation
class CircuitBreaker {
    constructor(timeout = 5000) {
        this.failures = new Map();
        this.timeout = timeout;
    }

    async execute(source, operation) {
        const failure = this.failures.get(source);
        if (failure && Date.now() - failure < this.timeout) {
            throw new Error(`Circuit breaker open for ${source}`);
        }

        try {
            const result = await operation();
            this.failures.delete(source);
            return result;
        } catch (error) {
            this.failures.set(source, Date.now());
            throw error;
        }
    }
}

const circuitBreaker = new CircuitBreaker();

// Retry logic
async function fetchWithRetry(url, config, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios.get(url, config);
        } catch (error) {
            if (i === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Track used headlines
const usedHeadlinesTracker = {
    headlines: new Set(),
    maxSize: 100,
    
    add(headline) {
        this.headlines.add(headline);
        if (this.headlines.size > this.maxSize) {
            const iterator = this.headlines.values();
            for (let i = 0; i < this.headlines.size - this.maxSize; i++) {
                this.headlines.delete(iterator.next().value);
            }
        }
    },
    
    has(headline) {
        return this.headlines.has(headline);
    },
    
    clear() {
        this.headlines.clear();
    }
};

let lastUsedSource = null;
// News sources configuration
const NEWS_SOURCES = {
    currentIndex: 0,
    sources: [
        {
            name: 'Delfi.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.delfi.lt/rss/feeds/daily.xml',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                },
                {
                    type: 'rss',
                    url: 'https://www.delfi.lt/rss/feeds/lithuania.xml',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        },
        {
            name: '15min.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.15min.lt/rss',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        },
        {
            name: 'LRT.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.lrt.lt/rss/news/news',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        },
        {
            name: 'Alfa.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.alfa.lt/feed/',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        },
        {
            name: 'Diena.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.diena.lt/rss.xml',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        },
        {
            name: 'VZ.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.vz.lt/rss',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        },
        {
            name: 'Bernardinai.lt',
            methods: [
                {
                    type: 'rss',
                    url: 'https://www.bernardinai.lt/feed/',
                    parse: function($) {
                        const headlines = new Set();
                        $('item title').each(function(_, element) {
                            headlines.add($(element).text().trim());
                        });
                        return Array.from(headlines);
                    }
                }
            ],
            timeout: 5000
        }
    ],

    getNextSource: function() {
        if (lastUsedSource) {
            const lastIndex = this.sources.findIndex(s => s.name === lastUsedSource);
            this.currentIndex = (lastIndex + 1) % this.sources.length;
        }
        
        const source = this.sources[this.currentIndex];
        lastUsedSource = source.name;
        return source;
    },

    getCurrentSource: function() {
        return this.sources[this.currentIndex];
    },

    fetchFromSource: async function(source) {
        let lastError = null;
        let allHeadlines = [];

        const axiosConfig = {
            timeout: source.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
                'Accept-Language': 'lt,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            maxRedirects: 5,
            validateStatus: function(status) {
                return status >= 200 && status < 400;
            },
            responseType: 'text'
        };

        for (const method of source.methods) {
            try {
                console.log(`Fetching from ${source.name} using ${method.type} method...`);
                
                const response = await fetchWithRetry(method.url, axiosConfig);

                if (response.status === 200) {
                    const $ = cheerio.load(response.data, { xmlMode: method.type === 'rss' });
                    const headlines = method.parse($);
                    const cleanedHeadlines = headlines
                        .map(headline => this.cleanHeadline(headline, source.name))
                        .filter(headline => {
                            const wordCount = headline.split(/\s+/).filter(word => word.length > 0).length;
                            return (
                                headline.length > 10 && 
                                headline.length < 200 &&
                                wordCount >= 3 &&
                                !usedHeadlinesTracker.has(headline) &&
                                !headline.includes('...') &&
                                !headline.includes('„') &&
                                !headline.includes('"') &&
                                !/^\d+/.test(headline) &&
                                !/[?!]$/.test(headline)
                            );
                        });

                    allHeadlines = [...new Set([...allHeadlines, ...cleanedHeadlines])];
                    if (allHeadlines.length >= 10) break;
                }
            } catch (error) {
                console.error(`Error fetching from ${source.name} using ${method.type}:`, error.message);
                lastError = error;
            }
        }

        if (allHeadlines.length === 0) {
            throw lastError || new Error(`Failed to fetch from ${source.name}`);
        }

        return {
            headlines: allHeadlines,
            source: source.name
        };
    },

    cleanHeadline: function(headline, sourceName) {
        let cleaned = headline
            .replace(/\s*\(\d+.*$|\s+\d+.*$/, '')
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^(VIDEO|FOTO|TIESIOGIAI|TIESIOGINĖ TRANSLIACIJA):?\s*/i, '')
            .replace(/^(\d+:)?\s*/, '')
            .replace(/\s*\|.*$/, '')
            .trim();

        switch(sourceName) {
            case 'VZ.lt':
                cleaned = cleaned.replace(/^VŽ |^VŽ: /, '');
                break;
            case 'LRT.lt':
                cleaned = cleaned.replace(/^LRT |^LRT: /, '');
                break;
            case 'Bernardinai.lt':
                cleaned = cleaned.replace(/^Bernardinai.lt: /, '');
                break;
        }

        return cleaned;
    }
};

// Middleware setup
if (process.env && process.env['VERCEL']) {
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        next();
    });
}

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env && process.env['VERCEL'] ? 50 : 100,
    message: { error: 'Per daug užklausų. Bandykite vėliau.' }
});

app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            connectSrc: [
                "'self'", 
                "https://www.delfi.lt",
                "https://www.15min.lt",
                "https://www.lrt.lt",
                "https://www.alfa.lt",
                "https://www.diena.lt",
                "https://www.vz.lt",
                "https://www.bernardinai.lt"
            ],
            imgSrc: ["'self'", "data:", "https:"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(express.static('public'));
app.use('/api', limiter);

// Fetch news headlines
async function fetchLithuanianNews() {
    const maxAttempts = NEWS_SOURCES.sources.length;
    const triedSources = new Set();

    while (triedSources.size < maxAttempts) {
        const source = NEWS_SOURCES.getNextSource();
        
        if (triedSources.has(source.name)) continue;
        triedSources.add(source.name);

        try {
            const cached = newsCache.get(source.name);
            if (cached) {
                const availableHeadlines = cached.headlines.filter(h => !usedHeadlinesTracker.has(h));
                if (availableHeadlines.length > 0) {
                    const headline = availableHeadlines[Math.floor(Math.random() * availableHeadlines.length)];
                    usedHeadlinesTracker.add(headline);
                    return { headline, source: cached.source };
                }
            }

            const result = await circuitBreaker.execute(source.name, async () => {
                return await NEWS_SOURCES.fetchFromSource(source);
            });

            newsCache.set(source.name, result);

            const availableHeadlines = result.headlines.filter(h => !usedHeadlinesTracker.has(h));
            if (availableHeadlines.length > 0) {
                const headline = availableHeadlines[Math.floor(Math.random() * availableHeadlines.length)];
                usedHeadlinesTracker.add(headline);
                return { headline, source: result.source };
            }
        } catch (error) {
            console.error(`Error fetching from ${source.name}:`, error.message);
        }
    }

    newsCache.clear();
    usedHeadlinesTracker.clear();
    throw new Error('Nepavyko gauti naujienų iš visų šaltinių');
}

// Generate haiku
async function generateHaiku(headline) {
    try {
        const cached = haikuCache.get(headline);
        if (cached) return cached;

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.9,
                topK: 40,
                topP: 0.8,
                maxOutputTokens: 100,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        });

        const prompt = `Paversk šią lietuvišką naujienų antraštę į haiku (5-7-5 skiemenų) lietuvių kalba: "${headline}". 
        Haiku turi būti poetiškas ir susijęs su antraštės tema, bet nebūtinai tiesioginis vertimas. 
        Atsakyk tik haiku, be jokių paaiškinimų.
        Haiku turi būti trijose eilutėse.`;

        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Haiku generation timeout')), 10000))
        ]);

        const haiku = result.response.text().trim();
        
        const lines = haiku.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length !== 3) {
            throw new Error('Invalid haiku format');
        }

        haikuCache.set(headline, haiku);
        return haiku;
    } catch (error) {
        console.error('Error in generateHaiku:', error);
        throw new Error('Nepavyko sugeneruoti haiku');
    }
}

// Cache cleanup
function cleanupCaches() {
    if (usedHeadlinesTracker.headlines.size > 90) {
        usedHeadlinesTracker.clear();
        newsCache.clear();
    }
}

setInterval(cleanupCaches, 300000); // Every 5 minutes

// API endpoints
app.get('/api/haiku', async (req, res) => {
    const startTime = Date.now();
    
    try {
        console.log(`New request from ${req.ip} at ${new Date().toISOString()}`);

        const newsResult = await fetchLithuanianNews();
        const haiku = await generateHaiku(newsResult.headline);

        const responseTime = Date.now() - startTime;
        console.log(`Request completed in ${responseTime}ms`);

        res.json({
            headline: newsResult.headline,
            haiku,
            source: newsResult.source,
            responseTime
        });
    } catch (error) {
        console.error('API Error:', error);
        
        const statusCode = error.code === 'ECONNREFUSED' ? 503 : error.response?.status || 500;

        res.status(statusCode).json({
            error: error.message || 'Nepavyko gauti naujienų',
            source: NEWS_SOURCES.getCurrentSource().name,
            timestamp: new Date().toISOString()
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        cacheStats: {
            news: newsCache.store.size,
            haiku: haikuCache.store.size,
            usedHeadlines: usedHeadlinesTracker.headlines.size
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', {
        error: err,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    res.status(500).json({
        error: 'Įvyko serverio klaida',
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start server with proper error handling
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}).on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

module.exports = app;
