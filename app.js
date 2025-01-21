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

// Vercel-specific configuration
if (process.env.VERCEL) {
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        next();
    });
}

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.VERCEL ? 50 : 100,
    message: { error: 'Per daug užklausų. Bandykite vėliau.' }
});

// Middleware
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            frameSrc: ["'none'"]
        }
    }
}));
app.use(compression());
app.use(express.static('public'));
app.use('/api', limiter);

// News sources configuration
const NEWS_SOURCES = [
    {
        url: 'https://www.15min.lt',
        selector: '.article-title'
    },
    {
        url: 'https://www.delfi.lt',
        selector: '.headline-title'
    },
    {
        url: 'https://www.lrt.lt',
        selector: '.news-title'
    }
];

// News cache
const newsCache = {
    headlines: [],
    timestamp: null,
    expiryTime: 5 * 60 * 1000,
    usedIndices: new Set(),
    
    isExpired() {
        return !this.timestamp || (Date.now() - this.timestamp) >= this.expiryTime;
    },
    
    reset() {
        this.headlines = [];
        this.timestamp = null;
        this.usedIndices.clear();
    }
};

// Fetch news headlines
async function fetchLithuanianNews() {
    try {
        if (newsCache.isExpired() || newsCache.usedIndices.size >= newsCache.headlines.length) {
            newsCache.reset();
            
            const headlines = [];
            for (const source of NEWS_SOURCES) {
                try {
                    const response = await axios.get(source.url, {
                        timeout: 5000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; NewsHaikuBot/1.0)',
                            'Accept-Language': 'lt'
                        }
                    });
                    
                    const $ = cheerio.load(response.data);
                    
                    $(source.selector).each((i, element) => {
                        let headline = $(element).text().trim();
                        headline = headline.replace(/\s*\(\d+.*$|\s+\d+.*$/, '').trim();
                        if (headline && headline.length > 10) {
                            headlines.push(headline);
                        }
                    });
                } catch (error) {
                    console.error(`Error fetching from ${source.url}:`, error.message);
                }
            }

            if (headlines.length === 0) {
                throw new Error('Nepavyko gauti naujienų');
            }

            newsCache.headlines = headlines;
            newsCache.timestamp = Date.now();
        }

        const availableIndices = Array.from(Array(newsCache.headlines.length).keys())
            .filter(i => !newsCache.usedIndices.has(i));

        if (availableIndices.length === 0) {
            newsCache.reset();
            return fetchLithuanianNews();
        }

        const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        newsCache.usedIndices.add(randomIndex);

        return newsCache.headlines[randomIndex];

    } catch (error) {
        console.error('Error in fetchLithuanianNews:', error);
        throw new Error('Nepavyko gauti naujienų');
    }
}

// Generate haiku
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
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE"
                }
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

// API endpoints
app.get('/api/haiku', async (req, res) => {
    try {
        const headline = await fetchLithuanianNews();
        const haiku = await generateHaiku(headline);
        
        res.json({ 
            headline, 
            haiku,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Nepavyko apdoroti užklausos',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Įvyko vidinė klaida'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version,
        cacheStats: {
            totalHeadlines: newsCache.headlines.length,
            usedHeadlines: newsCache.usedIndices.size,
            cacheAge: newsCache.timestamp ? (Date.now() - newsCache.timestamp) / 1000 : null
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Serverio klaida',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Įvyko vidinė klaida'
    });
});

// Start server
if (!process.env.VERCEL) {
    const server = app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Performing graceful shutdown...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}

// Handle uncaught exceptions
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