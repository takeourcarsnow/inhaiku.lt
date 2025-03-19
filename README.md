# Lietuviškų Naujienų Haiku

This is a PWA application that transforms Lithuanian news headlines into haiku poetry format using generative AI.

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
4. Run the development server:
   ```
   npm run dev
   ```

## Deployment

### Vercel

1. Make sure you have the Vercel CLI installed:
   ```
   npm i -g vercel
   ```
2. Add your environment variables in the Vercel project settings
3. Deploy:
   ```
   vercel --prod
   ```

### Troubleshooting Vercel Deployment

If you encounter deployment issues:

1. Make sure all required files exist:
   - `/public/offline.html`
   - `/public/icons/icon-192.png`
   - `/public/icons/icon-512.png`
   - `/public/icons/badge-72.png`
   - `/public/preview.jpg`

2. Check that your environment variables are set in the Vercel dashboard

3. Make sure your package.json has a build script

## License

MIT 