// api/news.js
// Vercel serverless function for news headlines

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

const allowedCats = new Set([
  'business',
  'entertainment',
  'general',
  'health',
  'science',
  'sports',
  'technology',
]);

const COUNTRY_DEFAULT_LANG = {
  US: 'en', GB: 'en', IE: 'en', CA: 'en', AU: 'en', NZ: 'en',
  LT: 'lt', LV: 'lv', EE: 'et',
  PL: 'pl', DE: 'de', FR: 'fr', ES: 'es', IT: 'it', PT: 'pt', NL: 'nl',
  NO: 'no', SE: 'sv', DK: 'da', FI: 'fi',
  CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', BG: 'bg', GR: 'el',
  HR: 'hr', SI: 'sl', RS: 'sr',
  UA: 'uk', TR: 'tr',
  BR: 'pt', MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es',
  JP: 'ja', KR: 'ko', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK',
  IN: 'en', ZA: 'en',
};

const gTopicByCategory = {
  business: 'BUSINESS',
  entertainment: 'ENTERTAINMENT',
  health: 'HEALTH',
  science: 'SCIENCE',
  sports: 'SPORTS',
  technology: 'TECHNOLOGY',
  general: null,
};

function cleanCountry(code) {
  const m = String(code || '').trim().toUpperCase().match(/^[A-Z]{2}$/);
  return m ? m[0] : 'US';
}

function defaultLangForCountry(country) {
  return COUNTRY_DEFAULT_LANG[country] || 'en';
}

function hlFor(country, lang) {
  return `${lang}-${country}`;
}

function feedsFor({ country = 'US', category = 'general', lang }) {
  const cat = allowedCats.has(category) ? category : 'general';
  const c = cleanCountry(country);
  const l = lang || defaultLangForCountry(c);
  const topic = gTopicByCategory[cat];

  const google = topic
    ? `https://news.google.com/rss/headlines/section/topic/${topic}?hl=${encodeURIComponent(hlFor(c, l))}&gl=${encodeURIComponent(c)}&ceid=${encodeURIComponent(`${c}:${l}`)}`
    : `https://news.google.com/rss?hl=${encodeURIComponent(hlFor(c, l))}&gl=${encodeURIComponent(c)}&ceid=${encodeURIComponent(`${c}:${l}`)}`;

  const guardian = 'https://www.theguardian.com/world/rss';
  const bbc = cat === 'sports'
    ? 'https://feeds.bbci.co.uk/sport/rss.xml'
    : 'https://feeds.bbci.co.uk/news/rss.xml';
  const aljazeera = 'https://www.aljazeera.com/xml/rss/all.xml';

  const list = [];
  list.push({ name: `Google News ${c}`, url: google });
  list.push({ name: 'BBC', url: bbc });
  list.push({ name: 'The Guardian', url: guardian });
  list.push({ name: 'Al Jazeera', url: aljazeera });
  return list;
}

function sanitizeTitle(title = '') {
  return String(title)
    .replace(/\s*[-–—]\s*(BBC News|Reuters|The Guardian|NPR|AP News|Al Jazeera).*$/i, '')
    .replace(/\s*\|\s*(BBC|Reuters|The Guardian|NPR|AP|Al Jazeera).*$/i, '')
    .trim();
}

function resolveGoogleNewsLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.includes('news.google.') && u.searchParams.get('url')) {
      return u.searchParams.get('url');
    }
  } catch {}
  return link;
}

function normalizeItems(rawItems, provider) {
  if (!Array.isArray(rawItems)) rawItems = [rawItems].filter(Boolean);
  return rawItems.map(it => {
    let title = '';
    let link = '';
    if (typeof it?.title === 'string') title = it.title;
    else if (it?.title?.content) title = it.title.content;
    else if (it?.title?.cdata) title = it.title.cdata;
    if (typeof it?.link === 'string') {
      link = it.link;
    } else if (Array.isArray(it?.link)) {
      const alt = it.link.find(l => (l.rel ? String(l.rel).toLowerCase() === 'alternate' : true) && (l.href || l.url));
      link = (alt?.href || alt?.url || it.link[0]?.href || it.link[0]?.url || '');
      if (!link && typeof it.link[0] === 'string') link = it.link[0];
    } else if (it?.link && typeof it.link === 'object') {
      link = it.link.href || it.link.url || '';
    }
    if (!link) link = it?.guid?.content || it?.guid || it?.id || '';
    title = sanitizeTitle(title);
    if (link) link = resolveGoogleNewsLink(link);
    return {
      title,
      source: provider,
      url: link || '#',
    };
  }).filter(x => x.title && x.url);
}

async function fetchWithTimeout(url, timeoutMs = 7000, headers = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Nokia3310 News Haiku/1.1)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(id);
  }
}

async function fetchFeed(url, providerName) {
  const xml = await fetchWithTimeout(url);
  const data = parser.parse(xml);
  if (data?.rss?.channel?.item) {
    return normalizeItems(data.rss.channel.item, providerName);
  }
  if (data?.feed?.entry) {
    return normalizeItems(data.feed.entry, providerName);
  }
  return [];
}

function dedupeByTitle(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const category = String(req.query.category || 'technology').toLowerCase();
  const country = cleanCountry(req.query.country || 'US');
  const lang = defaultLangForCountry(country);
  const feeds = feedsFor({ country, category, lang });

  let collected = [];
  for (const f of feeds) {
    try {
      const items = await fetchFeed(f.url, f.name);
      if (items && items.length) {
        collected = items;
        break;
      }
    } catch (e) {
      // try next
    }
  }

  collected = dedupeByTitle(collected).slice(0, 14);

  if (!collected.length) {
    return res.json({
      headlines: [
        { title: "Satellites watch storms gather over Atlantic", source: "Sample", url: "#" },
        { title: "Researchers map ancient city with ground radar", source: "Sample", url: "#" },
        { title: "New chip design promises battery-sipping laptops", source: "Sample", url: "#" },
        { title: "Ocean heat reaches record highs, scientists warn", source: "Sample", url: "#" },
        { title: "Breakthrough in recycling rare-earth magnets", source: "Sample", url: "#" },
        { title: "Open-source community ships major release", source: "Sample", url: "#" },
      ]
    });
  }

  res.json({ headlines: collected, country, category });
};
