# Vakya Web Application - Complete Build Specification

## Overview

Build a Next.js 14+ web application called **Vakya** - a language learning platform that translates web articles into a target language at the user's proficiency level, with interactive word-level translations, vocabulary saving, and audio playback. The app should work seamlessly on desktop and mobile.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Clerk
- **AI/LLM**: OpenAI (gpt-4o-mini for translations, TTS for audio)
- **Storage**: Cloudflare R2 (audio files)
- **Content Fetching**: Jina AI Reader API (https://r.jina.ai/)
- **Dictionary**: Free Dictionary API (https://api.dictionaryapi.dev/) for instant lookups
- **Styling**: Tailwind CSS with the dark theme from the extension
- **Deployment**: Vercel

## Design System

Use the exact color palette and styling from the extension:
- Background: `linear-gradient(145deg, #0f172a 0%, #1e1b4b 100%)`
- Primary gradient: `linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)` (indigo to purple)
- Text primary: `#f1f5f9`
- Text secondary: `#94a3b8`
- Text muted: `#64748b`
- Card background: `rgba(255,255,255,0.03)` with border `rgba(255,255,255,0.06)`
- Success: `#4ade80`
- Error: `#f87171`
- Warning: `#fb923c`
- Border radius: 10-16px for cards, 8-12px for buttons/inputs

## Database Schema (Supabase)

```sql
-- Users table (synced from Clerk)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT,
  native_language TEXT DEFAULT 'English',
  target_language TEXT DEFAULT 'German',
  cefr_level TEXT DEFAULT 'B1' CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Articles table
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  title TEXT,
  original_content TEXT NOT NULL,
  translated_content TEXT NOT NULL,
  target_language TEXT NOT NULL,
  cefr_level TEXT NOT NULL,
  audio_url TEXT, -- R2 URL for generated audio
  audio_duration_seconds INTEGER,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, source_url, target_language, cefr_level)
);

-- Saved words (review list)
CREATE TABLE saved_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  context_sentence TEXT, -- The sentence where the word appeared
  translation TEXT,
  part_of_speech TEXT,
  article TEXT, -- For gendered languages (der/die/das)
  example TEXT,
  notes TEXT, -- User's personal notes
  source_article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  mastery_level INTEGER DEFAULT 0, -- 0-5 for spaced repetition
  next_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  target_language TEXT NOT NULL,
  
  UNIQUE(user_id, word, target_language)
);

-- Indexes
CREATE INDEX idx_articles_user_id ON articles(user_id);
CREATE INDEX idx_articles_created_at ON articles(created_at DESC);
CREATE INDEX idx_saved_words_user_id ON saved_words(user_id);
CREATE INDEX idx_saved_words_next_review ON saved_words(next_review_at);
```

## Application Routes

```
/                     → Landing page (unauthenticated) or Dashboard (authenticated)
/sign-in              → Clerk sign-in
/sign-up              → Clerk sign-up
/dashboard            → Main dashboard with article history
/translate            → New article translation page
/article/[id]         → Read translated article
/article/[id]/listen  → Audio player view (mobile-optimized)
/vocabulary           → Saved words list with review functionality
/settings             → User preferences
```

## Detailed Page Specifications

### 1. Landing Page (`/`)

**For unauthenticated users:**
- Hero section with tagline: "Learn languages by reading what you love"
- Brief feature highlights (3-4 cards):
  - "Translate any article to your level"
  - "Click words for instant meanings"
  - "Listen with natural AI voices"
  - "Build your vocabulary"
- CTA buttons: "Get Started" → sign-up, "Sign In"
- Demo video or animated GIF showing the word-click interaction

**For authenticated users:**
- Redirect to `/dashboard`

### 2. Dashboard (`/dashboard`)

**Layout:**
- Header: Logo, navigation (Dashboard, Vocabulary, Settings), user menu
- Main content area with two sections:

**Quick Translate Section (top):**
- Large input field with placeholder "Paste an article URL..."
- Dropdown for target language (populated from user's setting as default)
- Dropdown for CEFR level (A1, A2, B1, B2, C1, C2) - default from user settings
- "Translate" button with loading state

**Article History Section:**
- Grid of article cards (2 columns desktop, 1 column mobile)
- Each card shows:
  - Article title (truncated)
  - Source domain (e.g., "spiegel.de")
  - Target language + level badge (e.g., "German B1")
  - Word count
  - Audio icon if audio exists
  - Created date (relative: "2 hours ago")
- Click card → navigate to `/article/[id]`
- Empty state: "No articles yet. Translate your first article above!"

**Mobile considerations:**
- Sticky header with hamburger menu
- URL input should be full-width
- Cards stack vertically
- Bottom navigation bar: Home, Vocabulary, Settings

### 3. Translate Page (`/translate`)

This can be a modal or full page (accessed from dashboard).

**Flow:**
1. User pastes URL
2. Click "Translate"
3. Show loading state with steps:
   - "Fetching article..." (Jina AI)
   - "Translating to [Language] at [Level]..." (OpenAI)
4. On success, redirect to `/article/[id]`
5. On error, show error message with retry button

**API Flow:**
```
POST /api/translate
Body: { url: string, targetLanguage: string, cefrLevel: string }

1. Check if article already exists for this user/url/language/level combo
   - If yes, return existing article
2. Fetch content via Jina AI: GET https://r.jina.ai/{url}
3. Extract title and main content (Jina returns markdown)
4. Split content into paragraphs/blocks (similar to extension)
5. Translate via OpenAI in batches:
   - System prompt: "Translate to {language} at CEFR level {level}. Use vocabulary and grammar appropriate for this level. Return JSON with 'blocks' array."
6. Store in database
7. Return article ID
```

### 4. Article Reading Page (`/article/[id]`)

This is the core experience - must match the extension's interaction model.

**Layout:**
- Sticky header:
  - Back button
  - Article title (truncated)
  - Actions: Audio button, Save/Bookmark, Share
- Article content area (centered, max-width 700px, comfortable reading)
- Floating action bar (bottom on mobile):
  - "Listen" button (generates audio if not exists)
  - Progress indicator if reading

**Content Rendering:**
- Each paragraph rendered with words wrapped in clickable spans (exactly like extension)
- Words should have subtle hover state (background highlight)
- Maintain natural text flow - spans should not break word wrapping

**Word Click Interaction (critical - match extension exactly):**

When user clicks a word:
1. Show tooltip/popover anchored to the word
2. Tooltip contains:
   - Word in large text
   - Loading spinner while fetching
3. First, try FREE dictionary API for instant result:
   - `GET https://api.dictionaryapi.dev/api/v2/entries/{language}/{word}`
   - Show: translation, part of speech, phonetic
4. Show "Analyze with AI" button
5. If user clicks "Analyze with AI":
   - Call OpenAI for detailed analysis
   - Replace tooltip content with:
     - Word
     - Chips: article (der/die/das), part of speech
     - Translation
     - Example sentence
     - Usage explanation in context
   - Show "Save to Vocabulary" button

**Tooltip styling** (from extension):
```css
background: linear-gradient(145deg, #1e293b, #1e1b4b);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 14px;
box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
```

**Original Text View:**
- Hold Cmd/Ctrl (desktop) or long-press (mobile) on a paragraph
- Highlight the paragraph with outline
- Show original text in a popover/modal

**Save to Vocabulary:**
- When user clicks "Save" in tooltip:
  - Word is saved to `saved_words` table
  - Show toast confirmation
  - Button changes to "Saved ✓"

**Mobile Optimizations:**
- Larger touch targets for words
- Tooltip appears as bottom sheet instead of popover
- Long-press for original text (500ms threshold)
- Swipe down to dismiss tooltip

### 5. Audio Feature (`/article/[id]` and `/article/[id]/listen`)

**Generate Audio Button:**
- If `audio_url` is null, show "Generate Audio" button
- On click:
  - Show progress: "Generating audio..."
  - Call `POST /api/article/[id]/audio`
  - API uses OpenAI TTS API with translated content
  - Upload to R2, store URL in database
  - Return audio URL

**Audio Player (inline on article page):**
- Sticky player bar at bottom when audio exists
- Controls:
  - Play/Pause button
  - Progress bar (seekable)
  - Current time / Duration
  - Playback speed (0.75x, 1x, 1.25x, 1.5x)
  - Close button
- Highlight current sentence being spoken (if possible with timestamps)

**Dedicated Listen Page (`/article/[id]/listen`):**
- Mobile-optimized full-screen audio player
- Large play/pause button
- Waveform or simple progress visualization
- Speed controls prominent
- Article title and thumbnail
- "Back to Article" link

### 6. Vocabulary Page (`/vocabulary`)

**Layout:**
- Header with search/filter bar
- Tabs: "All Words", "Review Due", "Mastered"
- Word list (table on desktop, cards on mobile)

**Word List Columns:**
- Word (with article if applicable)
- Translation
- Part of speech
- Source article (link)
- Added date
- Mastery level (visual indicator: 0-5 dots or progress bar)
- Actions: Edit, Delete

**Word Detail Modal (click on word):**
- Full word information
- Example sentence
- Notes field (editable)
- "Review" button for spaced repetition
- Delete button

**Review Mode:**
- Simple flashcard interface
- Show word, user guesses, reveal translation
- Rate difficulty (Again, Hard, Good, Easy)
- Update `mastery_level` and `next_review_at` using SM-2 algorithm
- Track review stats

**Mobile:**
- Cards layout instead of table
- Swipe actions: left to delete, right to mark reviewed
- FAB for quick add (manual word entry)

### 7. Settings Page (`/settings`)

**Sections:**

**Profile:**
- Email (from Clerk, read-only)
- Profile picture (from Clerk)

**Language Preferences:**
- Native language (dropdown with common languages)
- Target language (dropdown)
- Default CEFR level (radio buttons with descriptions, like extension)

**Appearance:**
- Theme toggle (dark/light) - start with dark only

**Data:**
- Export vocabulary (CSV download)
- Delete all articles
- Delete account

**Save button** with success feedback

## API Routes

```
POST   /api/translate           → Fetch URL, translate, store article
GET    /api/articles            → List user's articles (paginated)
GET    /api/article/[id]        → Get single article
DELETE /api/article/[id]        → Delete article
POST   /api/article/[id]/audio  → Generate and store audio

POST   /api/word/analyze        → OpenAI analysis for a word
GET    /api/word/lookup/[word]  → Dictionary API lookup

GET    /api/vocabulary          → List saved words (with filters)
POST   /api/vocabulary          → Save a word
PATCH  /api/vocabulary/[id]     → Update word (notes, mastery)
DELETE /api/vocabulary/[id]     → Delete saved word
POST   /api/vocabulary/review   → Submit review result (update mastery)

GET    /api/settings            → Get user settings
PATCH  /api/settings            → Update user settings
```

## Key Implementation Details

### Content Fetching (Jina AI)
```typescript
const response = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
  headers: {
    'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
    'Accept': 'application/json'
  }
});
const data = await response.json();
// data.content contains markdown, data.title contains title
```

### Translation Prompt
```typescript
const systemPrompt = `You are a language learning assistant. Translate the following text to ${targetLanguage} at CEFR level ${cefrLevel}.

Guidelines for ${cefrLevel}:
- A1: Use only basic vocabulary (500 most common words), simple present tense, short sentences
- A2: Elementary vocabulary, simple past and future, compound sentences allowed
- B1: Intermediate vocabulary, all common tenses, can express opinions
- B2: Upper-intermediate vocabulary, complex sentences, idiomatic expressions acceptable
- C1: Advanced vocabulary, nuanced expression, near-native structures
- C2: Full native-level expression, literary and technical terms acceptable

Maintain the meaning and tone of the original. Preserve paragraph structure.
Return JSON: { "blocks": [{ "original": "...", "translated": "..." }, ...] }`;
```

### Word Analysis Prompt
```typescript
const prompt = `Analyze the word "${word}" in this context: "${contextSentence}".
The learner speaks ${nativeLanguage} and is learning ${targetLanguage}.

Return JSON:
{
  "translation": "translation in ${nativeLanguage}",
  "pos": "part of speech (noun/verb/adjective/etc)",
  "article": "grammatical article if applicable (e.g., der/die/das for German) or null",
  "example": "simple example sentence in ${targetLanguage}",
  "explanation": "brief explanation of usage, any irregularities, or helpful notes for a ${cefrLevel} learner"
}`;
```

### Audio Generation
```typescript
// Use OpenAI TTS
const mp3 = await openai.audio.speech.create({
  model: "tts-1",
  voice: "alloy", // or let user choose
  input: translatedText,
  speed: 1.0
});

// Upload to R2
const buffer = Buffer.from(await mp3.arrayBuffer());
await r2.put(`audio/${articleId}.mp3`, buffer, {
  httpMetadata: { contentType: 'audio/mpeg' }
});
```

### Word Rendering Component
```tsx
function TranslatedText({ content }: { content: string }) {
  const words = content.split(/(\s+)/);
  
  return (
    <p className="leading-relaxed">
      {words.map((segment, i) => {
        if (/^\s+$/.test(segment)) {
          return <span key={i}>{segment}</span>;
        }
        
        const cleanWord = segment.replace(/[^\p{L}\p{M}'-]/gu, '');
        if (!cleanWord) return <span key={i}>{segment}</span>;
        
        return (
          <WordSpan 
            key={i} 
            word={cleanWord} 
            display={segment}
          />
        );
      })}
    </p>
  );
}

function WordSpan({ word, display }: { word: string; display: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <span 
          className="cursor-pointer rounded hover:bg-indigo-500/20 transition-colors"
          onClick={() => setIsOpen(true)}
        >
          {display}
        </span>
      </PopoverTrigger>
      <PopoverContent>
        <WordTooltip word={word} onSave={() => {}} />
      </PopoverContent>
    </Popover>
  );
}
```

## Mobile-First Responsive Breakpoints

```css
/* Mobile first */
@media (min-width: 640px) { /* sm - large phones */ }
@media (min-width: 768px) { /* md - tablets */ }
@media (min-width: 1024px) { /* lg - desktop */ }
```

**Key mobile adaptations:**
- Bottom navigation instead of top nav
- Bottom sheets instead of popovers for tooltips
- Larger touch targets (min 44x44px)
- Swipe gestures where appropriate
- Sticky audio player at bottom
- Full-width inputs and buttons

## Error Handling

- Network errors: Show toast with retry button
- Translation failures: "Translation failed. Please try again."
- Invalid URL: "Please enter a valid article URL"
- Content too short: "This page doesn't have enough content to translate"
- Rate limits: "Too many requests. Please wait a moment."
- Auth errors: Redirect to sign-in

## Performance Considerations

- Use React Server Components where possible
- Lazy load article content with suspense
- Paginate article history (20 per page)
- Cache dictionary lookups in localStorage (with TTL)
- Optimistic UI updates for saving words
- Debounce search inputs
- Use `next/image` for any images
- Prefetch likely navigations

## Environment Variables

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Jina AI
JINA_API_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

## Testing Checklist

- [ ] Sign up / Sign in flow
- [ ] Translate article from URL
- [ ] Handle already-translated article
- [ ] Click word → dictionary lookup
- [ ] Click "Analyze with AI" → full analysis
- [ ] Save word to vocabulary
- [ ] View vocabulary list
- [ ] Review flashcard mode
- [ ] Generate audio for article
- [ ] Play audio with controls
- [ ] Change playback speed
- [ ] Settings save correctly
- [ ] Mobile: word tooltip as bottom sheet
- [ ] Mobile: long-press for original text
- [ ] Mobile: audio player works
- [ ] Handle offline gracefully
- [ ] Handle long articles (pagination/virtualization)

---

This prompt provides everything needed to build the complete application. Start with the database schema and auth, then build the core translation flow, then add the interactive reading experience, and finally the vocabulary and audio features.
