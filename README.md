# inhaiku.lt

Turn today's news headlines into tiny poems with a retro Nokia-style webapp. Choose your country, news category, and haiku language. Powered by Google Gemini and RSS feeds.

## Features
- Converts top news headlines into haiku poems using generative AI
- Selectable country, news category, and haiku language
- Retro Nokia-style UI, mobile-first and responsive
- Favorites and history for generated haiku
- Share haiku to social media
- Serverless API (Vercel) for news and haiku generation

## Demo
![inhaiku.lt screenshot](preview.jpg)

## Getting Started

### Prerequisites
- Node.js 18+
- Vercel CLI (for deployment)

### Install
```sh
npm install
```

### Development
```sh
npm run dev
```

### Production
```sh
npm start
```

### Deploy to Vercel
```sh
vercel deploy
```

## Project Structure
```
api/           # Serverless API endpoints (news, haiku)
public/        # Static frontend (HTML, CSS, JS)
  css/
  js/
```

## API Endpoints
- `/api/news` — Fetches news headlines by country/category (uses RSS)
- `/api/haiku` — Generates a haiku from a headline (uses Google Gemini)

## Configuration
- Set your Google Gemini API key as an environment variable: `GOOGLE_API_KEY`

## License
MIT

---
Created by [nefas.tv](https://nefas.tv)
