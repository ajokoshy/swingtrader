# SwingEdge PRO — NSE Swing Trading Signal App

AI-powered swing trading signals for Indian equities (NSE).

## Tech Stack
- React 18 + Vite (pure JavaScript, zero TypeScript)
- Recharts for all charts
- Netlify Functions for Yahoo Finance proxy (fixes CORS)
- Claude AI for trade summaries

## Project Structure
```
swingpro/
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Main app component
│   ├── api.js            # All API calls (Yahoo Finance + Claude)
│   ├── analysis.js       # Signal engine (scoring + trade levels)
│   ├── indicators.js     # Technical indicators (RSI, MACD, EMA, etc.)
│   ├── components.jsx    # Reusable UI components
│   └── index.css         # Global styles + animations
├── netlify/
│   └── functions/
│       └── yahoo-proxy.js  # Server-side Yahoo Finance proxy (CORS fix)
├── index.html
├── vite.config.js
├── netlify.toml
└── package.json
```

## Local Development
```bash
npm install
npm run dev
```

## Deploy to Netlify (Zero Config)

### Option 1 — StackBlitz (Recommended, no installation)
1. Go to stackblitz.com → New Project → React
2. Replace all src/ files with this project's files
3. Update package.json dependencies
4. Connect to GitHub → deploy on Netlify

### Option 2 — GitHub + Netlify
```bash
git init
git add .
git commit -m "SwingEdge PRO"
git remote add origin https://github.com/YOUR_USERNAME/swingpro.git
git push -u origin main
```
Then on Netlify:
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

## Netlify Environment Variables
No secrets needed — the Claude AI API key is handled by the claude.ai 
artifact environment automatically.

## CORS Solution
Yahoo Finance API blocks direct browser requests in production.
This is solved by routing all Yahoo calls through a Netlify Function
(netlify/functions/yahoo-proxy.js) which makes the request server-side.
