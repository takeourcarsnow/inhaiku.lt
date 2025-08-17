// api/haiku.js - Vercel serverless function
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const LANG_DISPLAY_NAME = {
  en: 'English', lt: 'Lithuanian', lv: 'Latvian', et: 'Estonian',
  pl: 'Polish', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  no: 'Norwegian', sv: 'Swedish', da: 'Danish', fi: 'Finnish',
  cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', el: 'Greek',
  hr: 'Croatian', sl: 'Slovene', sr: 'Serbian',
  uk: 'Ukrainian', tr: 'Turkish',
  ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)', 'zh-HK': 'Chinese (Hong Kong)',
};
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (!GEMINI_API_KEY || !genAI) {
      return res.status(500).json({ error: 'Gemini API key missing on server' });
    }
    const { headline, lang } = req.body || {};
    if (!headline || typeof headline !== 'string') {
      return res.status(400).json({ error: 'headline is required' });
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
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text
      .replace(/^```[\s\S]*?```/g, '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 3);
    const haiku = lines.join('\n');
    res.status(200).json({ haiku, lang: langCode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate haiku' });
  }
}
