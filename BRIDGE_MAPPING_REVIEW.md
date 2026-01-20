# Bridge Sentence Mapping Algorithm - Review Request

## Problem Statement

We have a language learning app that:
1. Takes an article in a source language (e.g., German)
2. Translates it to a target language (e.g., German at B1 level) with an AI
3. Generates an "English bridge" translation (literal English translation of the German)
4. Generates TTS audio for the German text
5. Uses Whisper to get word-level timestamps

In **Reading Mode**, the user sees:
- The German text with the current word highlighted (synced to audio)
- An "English context" panel showing the corresponding English bridge sentence

**The Problem**: We need to map each German sentence to its corresponding English bridge sentence. The texts are generated separately by AI, so:
- Sentence counts may differ
- Sentence boundaries may not align perfectly
- We can't assume 1:1 correspondence

## Visual Example of the Bug

The user reported that once the alignment drifts, it stays wrong:

```
German displayed: "Auch über Technologie und KI haben wir geredet."
                  (= "We also talked about technology and AI")

English shown:    "While he drinks his martini, he explains the situation."
                  (Completely wrong - off by many sentences)
```

## Data Structures

### Input 1: Word Timestamps (from Whisper)
```typescript
interface WordTimestamp {
  word: string;      // e.g., "Technologie"
  start: number;     // start time in seconds
  end: number;       // end time in seconds
}
// Example: [{word: "Auch", start: 0.0, end: 0.2}, {word: "über", start: 0.2, end: 0.4}, ...]
```

### Input 2: Bridge Text (English)
```typescript
// A single string of English text, e.g.:
"He says that this end is coming faster than almost everyone believes. While he drinks his martini, he explains the situation. 'Did you read the news about the Sandie Peggie case? There, the judge allegedly used AI. Believe me, this is only the beginning. AI will hit us all.'"
```

### Input 3: Target Language
```typescript
// e.g., "German"
```

### Output: Mapping Array
```typescript
// mapping[i] = bridge sentence index for translated sentence i
// e.g., [0, 0, 1, 2, 2, 3, 4, 5, 5, 6, ...]
```

## The Algorithm (Current Implementation)

File: `/Users/prasoon/work/vakya-web/lib/audio/bridge-mapping.ts`

### Step 1: Parse Sentences

**Translated sentences** (from timestamps):
```typescript
function parseTranslatedSentences(timestamps: WordTimestamp[]): TranslatedSentence[] {
  // Groups words into sentences based on punctuation
  // A sentence ends when a word ends with '.', '!', or '?'
}
```

**Bridge sentences** (from text):
```typescript
function parseBridgeSentences(text: string): BridgeSentence[] {
  // Splits on sentence-ending punctuation using regex: /[^.!?]*[.!?]+/g
  // Pre-extracts content words for each sentence
}
```

### Step 2: Extract Content Words

For each German sentence, we extract "content words" (nouns, verbs, etc.) and try to translate them:

```typescript
function extractAndTranslateContentWords(sentence, targetLanguage, fillerWords): {
  englishWords: string[];  // Dictionary-translated words
  sourceWords: string[];   // Original words (for cognate matching)
}
```

- Filters out filler words (der, die, das, ist, sind, etc.)
- Looks up words in a German→English dictionary
- Keeps original words ≥4 chars for cognate matching

For English bridge sentences:
```typescript
function extractEnglishContentWords(text: string): Set<string>
// Extracts words ≥3 chars, filters English filler words
```

### Step 3: Score Sentence Pairs

```typescript
function scoreBridgeSentence(bridgeSentence, translatedWords, sourceWords): number {
  let matches = 0;
  const matchedBridgeWords = new Set<string>();

  // Dictionary matches (exact)
  for (word of translatedWords) {
    if (bridgeSentence.contentWords.has(word.toLowerCase())) {
      matches++;
      matchedBridgeWords.add(word);
    }
  }

  // Cognate matches (fuzzy - Levenshtein distance)
  for (sourceWord of sourceWords) {
    for (bridgeWord of bridgeSentence.contentWords) {
      if (matchedBridgeWords.has(bridgeWord)) continue;  // Don't double-count
      if (areCognates(sourceWord, bridgeWord)) {
        matches += 0.8;
        matchedBridgeWords.add(bridgeWord);
        break;
      }
    }
  }

  return matches;
}
```

**Cognate matching**:
```typescript
function areCognates(word1: string, word2: string): boolean {
  // Both must be ≥4 chars
  // Length difference ≤3
  // Levenshtein distance / maxLen ≤ 0.2 (or 0.25 for 8+ char words)
  // Examples that match: "Technologie"↔"technology", "Information"↔"information"
}
```

### Step 4: Find Best Match for Each Sentence

```typescript
for (let tIdx = 0; tIdx < numTranslated; tIdx++) {
  const expectedIdx = Math.floor((tIdx / numTranslated) * numBridge);

  // Search within ±20% of expected position (min ±8)
  const searchRadius = Math.max(8, Math.ceil(numBridge * 0.2));

  let bestIdx = expectedIdx;
  let bestScore = 0;

  for (let bIdx = searchStart; bIdx <= searchEnd; bIdx++) {
    const score = scoreBridgeSentence(bridgeSentences[bIdx], englishWords, sourceWords);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = bIdx;
    }
  }

  matches.push({ bestIdx, bestScore, englishWords, sourceWords });
}
```

### Step 5: Select Anchors (High-Confidence Matches)

```typescript
const ANCHOR_THRESHOLD = 1.5;  // Need ~2 word matches

for (match of matches) {
  if (match.bestScore >= ANCHOR_THRESHOLD) {
    anchorCandidates.push({ tIdx, bIdx: match.bestIdx, score: match.bestScore });
  }
}
```

### Step 6: Find Best Monotonic Anchor Sequence (Weighted LIS)

We need anchors in monotonic order (if sentence A comes before B, A's bridge must come before B's bridge). We use dynamic programming to find the subsequence with highest total score:

```typescript
// DP for weighted longest increasing subsequence
for (let i = 0; i < n; i++) {
  dp[i] = anchorCandidates[i].score;
  for (let j = 0; j < i; j++) {
    if (anchorCandidates[j].bIdx < anchorCandidates[i].bIdx) {
      const newScore = dp[j] + anchorCandidates[i].score;
      if (newScore > dp[i]) {
        dp[i] = newScore;
        parent[i] = j;
      }
    }
  }
}

// Backtrack to get best sequence
```

### Step 7: Add Boundary Anchors

```typescript
// Add first sentence anchor (soft - only if compatible)
if (firstMatch.bestScore >= 1 && firstMatch.bestIdx fits monotonicity) {
  validAnchors.unshift({ tIdx: 0, bIdx: firstMatch.bestIdx });
} else {
  validAnchors.unshift({ tIdx: 0, bIdx: 0 });
}

// Add last sentence anchor (soft)
if (lastMatch.bestScore >= 1 && lastMatch.bestIdx fits monotonicity) {
  validAnchors.push({ tIdx: last, bIdx: lastMatch.bestIdx });
} else {
  validAnchors.push({ tIdx: last, bIdx: numBridge - 1 });
}
```

### Step 8: Interpolate Between Anchors

```typescript
for (each pair of consecutive anchors) {
  for (tIdx between them) {
    // Linear interpolation
    const progress = (tIdx - startAnchor.tIdx) / tRange;
    const interpolatedIdx = startAnchor.bIdx + Math.round(progress * bRange);

    // Prefer content match if within tolerance
    if (match.bestScore >= 1) {
      const maxTolerance = Math.min(3, Math.max(1, Math.ceil(bRange * 0.15)));
      if (|match.bestIdx - interpolatedIdx| <= maxTolerance) {
        mapping[tIdx] = match.bestIdx;
        continue;
      }
    }

    mapping[tIdx] = interpolatedIdx;
  }
}
```

### Step 9: Final Smoothing

```typescript
// Prevent backward jumps
for (let tIdx = 1; tIdx < numTranslated; tIdx++) {
  if (mapping[tIdx] < mapping[tIdx - 1] - 1) {
    mapping[tIdx] = mapping[tIdx - 1];
  }
}
```

## Known Issues We've Fixed

### 1. Double-Counting (FIXED)
**Before**: If "System" matched via dictionary AND cognate, score = 1 + 0.8 = 1.8
**After**: Track matched bridge words, cognate skips already-matched words

### 2. Dictionary Lookup Used Unparsed Word (FIXED)
**Before**: `lookupWord(word, ...)` with punctuation attached
**After**: `lookupWord(cleanWord, ...)`

### 3. Greedy Anchor Selection (FIXED)
**Before**: First valid anchor wins, even if lower score
```
Sentence 5 → Bridge 10 (score 1.6) - KEPT
Sentence 8 → Bridge 8 (score 2.5) - REJECTED (8 < 10)
```
**After**: Weighted LIS finds highest total-score monotonic sequence

### 4. Forced First/Last Anchors (FIXED)
**Before**: Always 0→0 and last→last, even if wrong
**After**: Soft anchors, prefer content matches if they fit

### 5. Huge Interpolation Tolerance (FIXED)
**Before**: `max(2, bRange * 0.3)` = up to 15 sentences for large ranges
**After**: `min(3, max(1, bRange * 0.15))` = max 3 sentences

## Potential Remaining Issues

### 1. Abbreviations Create False Sentence Boundaries
"Dr. Smith said..." or "The U.S. government..." splits incorrectly.

### 2. Search Radius Limits
Only searches ±20% around expected position. If texts diverge significantly, might miss correct match.

### 3. Sentence Count Mismatch
If translator combines 2 sentences into 1, or splits 1 into 2, the 1:1 mapping assumption fails.

### 4. Dictionary Coverage
Many domain-specific words, compound words (German has many), and proper nouns aren't in dictionary.

### 5. Cognate False Positives/Negatives
- False positive: "halt" vs "hold" (rejected, distance too high)
- False negative: "Haus" vs "house" (rejected, 2 edits in 4-5 char word)

### 6. The Threshold 1.5 is Arbitrary
Why 1.5? What if most sentences only match 1 word?

### 7. Linear Interpolation Assumes Uniform Distribution
If one section has many short sentences and another has few long ones, linear interpolation is wrong.

## Questions for Review

1. **Is the Weighted LIS approach correct?** Does it properly handle the case where a lower-scoring early anchor should be skipped in favor of a higher-scoring later one?

2. **Should we use a different scoring function?** Currently it's just count of matches. Should we normalize by sentence length? Weight certain matches higher?

3. **Is the anchor threshold (1.5) appropriate?** Should it be adaptive based on overall match quality?

4. **How should we handle sentence count mismatch?** Is there a way to detect and handle cases where the translator merged/split sentences?

5. **Is the search radius (±20%) appropriate?** Should it be adaptive?

6. **Should we use a different interpolation strategy?** Currently linear. Would something else work better?

7. **Are there edge cases in the LIS backtracking?** What if `bestEnd = -1` (no candidates)?

8. **Is the smoothing pass (step 9) correct?** It only prevents backward jumps of >1. Is that the right heuristic?

## How to Test

1. Run the app locally: `npm run dev`
2. Add an article (URL or paste text)
3. Wait for translation and audio generation
4. Open Reading Mode
5. Enable "English context" panel
6. Play audio and watch if highlighted English matches the German

Console logs show:
```
[BridgeMapping] Computing mapping for 45 translated → 42 bridge sentences
[BridgeMapping] Found 12 anchors (from 18 candidates): 0→0, 5→4, 12→11, ...
[BridgeMapping] Final mapping: 0, 0, 1, 1, 2, 3, 4, 4, 5, ...
```

## File Locations

- Algorithm: `/Users/prasoon/work/vakya-web/lib/audio/bridge-mapping.ts`
- Reading Mode UI: `/Users/prasoon/work/vakya-web/components/article/reading-mode.tsx`
- Audio generation (calls mapping): `/Users/prasoon/work/vakya-web/app/api/articles/[id]/audio/route.ts`
- Dictionary lookup: `/Users/prasoon/work/vakya-web/lib/dictionary/lookup-sqlite.ts`

## Full Algorithm Code

See `/Users/prasoon/work/vakya-web/lib/audio/bridge-mapping.ts` for the complete implementation.
