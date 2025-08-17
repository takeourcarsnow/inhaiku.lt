// api/haiku.js
// Vercel serverless function for haiku generation

const { GoogleGenerativeAI } = require('@google/generative-ai');

const LANG_DISPLAY_NAME = {
  en: 'English', lt: 'Lithuanian', lv: 'Latvian', et: 'Estonian',
  pl: 'Polish', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  no: 'Norwegian', sv: 'Swedish', da: 'Danish', fi: 'Finnish',
  cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', el: 'Greek',
  hr: 'Croatian', sl: 'Slovene', sr: 'Serbian',
  uk: 'Ukrainian', tr: 'Turkish',
  ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)', 'zh-HK': 'Chinese (Hong Kong)',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key missing on server' });
    return;
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const { headline, lang } = req.body || {};
  if (!headline || typeof headline !== 'string') {
    res.status(400).json({ error: 'headline is required' });
    return;
  }
  const langCode = (lang && lang !== 'auto') ? String(lang) : 'en';
  const langName = LANG_DISPLAY_NAME[langCode] || 'English';
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `
You are a haiku generator.
Write exactly one haiku based on the news headline below.
Constraints:
- Write in ${langName}.
- Exactly 3 lines (no title).
- Aim for the 5-7-5 spirit (do not explain).
- No extra text, no quotes, no hashtags, no code fences.
- Calm, evocative tone.

Headline: ${headline}
`.trim();
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text
      .replace(/^```[\s\S]*?```/g, '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 3);
    const haiku = lines.join('\n');
    res.json({ haiku, lang: langCode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate haiku' });
  }
};
