# Vakya Web Clipper Chrome Extension

Clip articles from any webpage and send them to Vakya for translation and learning.

## Features

- Extract article content from any webpage (including paywalled sites you're subscribed to)
- Edit article title before sending
- Select target language and CEFR level
- Seamless authentication via Clerk Sync Host

## Development Setup

### 1. Install Dependencies

```bash
cd extension
npm install
```

### 2. Configure Environment

Copy `.env.development` and add your Clerk publishable key:

```env
PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY
PLASMO_PUBLIC_VAKYA_SYNC_HOST=http://localhost:3000
PLASMO_PUBLIC_VAKYA_API_URL=http://localhost:3000/api
```

### 3. Run Development Build

```bash
npm run dev
```

### 4. Load in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-dev` folder

## Production Build

```bash
npm run build
npm run package  # Creates .zip for Chrome Web Store
```

## Architecture

### Authentication Flow
Uses Clerk's Sync Host feature to share authentication state with the main Vakya web app:
1. User logs into vakya-web.fly.dev
2. Extension syncs auth state automatically via Clerk
3. API calls use Bearer token authentication

### Content Extraction
Uses [Defuddle](https://github.com/kepano/defuddle) library (same as Obsidian Clipper) to:
- Extract main article content
- Remove navigation, ads, and boilerplate
- Get metadata (title, author, publish date)

### API Integration
Sends extracted content to `/api/translate` with:
```json
{
  "type": "text",
  "text": "<extracted content>",
  "title": "<article title>",
  "targetLanguage": "German",
  "cefrLevel": "B1"
}
```

## Folder Structure

```
extension/
├── src/
│   ├── popup.tsx              # Main popup UI
│   ├── popup.css              # Styles
│   ├── background/
│   │   └── index.ts           # Service worker (token management)
│   ├── contents/
│   │   └── extractor.ts       # Content script (extraction)
│   ├── components/
│   │   ├── ClipPreview.tsx
│   │   ├── LanguageSelector.tsx
│   │   └── LoginPrompt.tsx
│   └── lib/
│       ├── extractor.ts       # Defuddle wrapper
│       ├── api.ts             # Vakya API client
│       └── storage.ts         # Chrome storage helpers
├── assets/
│   └── icon.svg
├── package.json
└── tsconfig.json
```

## Clerk Configuration

The extension requires these Clerk settings:

1. **Add Extension Origin**: In Clerk Dashboard → Settings → Paths, add your extension origin:
   - Development: `chrome-extension://YOUR_DEV_EXTENSION_ID`
   - Production: `chrome-extension://YOUR_PROD_EXTENSION_ID`

2. **Generate CRX Key** (for consistent extension ID):
   ```bash
   plasmo key
   ```
   Add the public key to `package.json` under `manifest.key`.

## Troubleshooting

### "Could not access this page"
- Refresh the page and try again
- Some internal browser pages (chrome://, extension pages) cannot be accessed

### "Not authenticated"
- Visit vakya-web.fly.dev and log in
- Wait a few seconds for sync, then try clipping again

### Content extraction fails
- The page may not have article-like content
- Try on pages with clear article structure (news sites, blogs)
