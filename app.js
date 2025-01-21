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

// Initialize Gemini AI with error handling
let genAI;
try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (error) {
    console.error('Failed to initialize Gemini AI:', error);
    process.exit(1);
}

// Enhanced security headers
const securityHeaders = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "https://www.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    expectCt: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true
};

// Enhanced rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.VERCEL ? 50 : 100,
    message: { error: 'Per daug užklausų. Bandykite vėliau.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development'
});

// Middleware configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet(securityHeaders));
app.use(compression({
    level: 6,
    threshold: 0,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Static files with caching
app.use(express.static('public', {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

// News sources with improved error handling
const NEWS_SOURCES = [
    {
        url: 'https://www.15min.lt',
        selector: '.article-title',
        timeout: 5000
    },
    {
        url: 'https://www.delfi.lt',
        selector: '.headline-title',
        timeout: 5000
    },
    {
        url: 'https://www.lrt.lt',
        selector: '.news-title',
        timeout: 5000
    }
].map(source => ({
    ...source,
    fetchOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NewsHaikuBot/1.0)',
            'Accept-Language': 'lt'
        },
        timeout: source.timeout
    }
}));

// Improved news cache with TTL and memory management
class NewsCache {
    constructor(expiryTime = 5 * 60 * 1000) {
        this.headlines = [];
        this.timestamp = null;
        this.expiryTime = expiryTime;
        this.usedIndices = new Set();
        this.maxSize = 1000;
    }

    isExpired() {
        return !this.timestamp || (Date.now() - this.timestamp) >= this.expiryTime;
    }

    reset() {
        this.headlines = [];
        this.timestamp = null;
        this.usedIndices.clear();
    }

    addHeadlines(headlines) {
        this.headlines = headlines.slice(0, this.maxSize);
        this.timestamp = Date.now();
        this.usedIndices.clear();
    }

    getRandomHeadline() {
        if (this.usedIndices.size >= this.headlines.length) {
            this.usedIndices.clear();
        }

        const availableIndices = Array.from(Array(this.headlines.length).keys())
            .filter(i => !this.usedIndices.has(i));

        const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        this.usedIndices.add(randomIndex);

        return this.headlines[randomIndex];
    }
}

const newsCache = new NewsCache();

// Improved news fetching with retry mechanism
async function fetchLithuanianNews(retryCount = 3) {
    try {
        if (newsCache.isExpired()) {
            const headlines = [];
            const errors = [];

            await Promise.all(NEWS_SOURCES.map(async source => {
                try {
                    const response = await axios.get(source.url, source.fetchOptions);
                    const $ = cheerio.load(response.data);
                    
                    $(source.selector).each((i, element) => {
                        let headline = $(element).text().trim();
                        headline = headline.replace(/\s*\(\d+.*$|\s+\d+.*$/, '').trim();
                        if (headline && headline.length > 10) {
                            headlines.push(headline);
                        }
                    });
                } catch (error) {
                    errors.push(`${source.url}: ${error.message}`);
                }
            }));

            if (headlines.length === 0) {
                if (retryCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return fetchLithuanianNews(retryCount - 1);
                }
                throw new Error(`Failed to fetch news: ${errors.join(', ')}`);
            }

            newsCache.addHeadlines(headlines);
        }

        return newsCache.getRandomHeadline();

    } catch (error) {
        console.error('Error in fetchLithuanianNews:', error);
        throw new Error('Nepavyko gauti naujienų');
    }
}

// Improved haiku generation with better error handling
async function generateHaiku(headline) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-pro",
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

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Error generating haiku:', error);
        throw new Error('Nepavyko sugeneruoti haiku');
    }
}

// API endpoints with improved error handling and response formatting
app.get('/api/haiku', async (req, res) => {
    try {
        const headline = await fetchLithuanianNews();
        const haiku = await generateHaiku(headline);
        
        res.json({
            success: true,
            data: { 
                headline, 
                haiku,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Nepavyko apdoroti užklausos',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        });
    }
});

// Enhanced health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version,
        environment: process.env.NODE_ENV,
        cacheStats: {
            totalHeadlines: newsCache.headlines.length,
            usedHeadlines: newsCache.usedIndices.size,
            cacheAge: newsCache.timestamp ? (Date.now() - newsCache.timestamp) / 1000 : null,
            isExpired: newsCache.isExpired()
        }
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({
        success: false,
        error: {
            message: 'Serverio klaida',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        }
    });
});

// Graceful shutdown handling
if (!process.env.VERCEL) {
    const server = app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

    const shutdown = async () => {
        console.log('Graceful shutdown initiated...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });

        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

// Enhanced error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (!process.env.VERCEL) {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;