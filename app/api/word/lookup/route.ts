import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  lookupWord,
  isSupportedLanguage,
  type DictionaryEntry,
  type SupportedLanguage,
} from "@/lib/dictionary/lookup-sqlite";
import { lemmatizeWord, getFormRelationDescription, formatFormType, cleanWord } from "@/lib/dictionary/lemmatizer";
import { db, users, savedWords, wordContexts } from "@/lib/db";
import { eq, and, or, sql, desc } from "drizzle-orm";

// Extract gender and article from German nouns
function extractGermanGender(entry: DictionaryEntry): { gender: string | null; article: string | null } {
  const pos = entry.partOfSpeech?.toLowerCase() || '';
  const forms = entry.forms?.toLowerCase() || '';

  // Check part of speech for gender indicators
  if (pos.includes('masculine') || forms.includes(' m ') || forms.includes(' m,')) {
    return { gender: 'masculine', article: 'der' };
  }
  if (pos.includes('feminine') || forms.includes(' f ') || forms.includes(' f,')) {
    return { gender: 'feminine', article: 'die' };
  }
  if (pos.includes('neuter') || forms.includes(' n ') || forms.includes(' n,')) {
    return { gender: 'neuter', article: 'das' };
  }

  // Check forms field for gender markers like "m", "f", "n"
  const genderMatch = forms.match(/\b([mfn])\b/);
  if (genderMatch) {
    const g = genderMatch[1];
    if (g === 'm') return { gender: 'masculine', article: 'der' };
    if (g === 'f') return { gender: 'feminine', article: 'die' };
    if (g === 'n') return { gender: 'neuter', article: 'das' };
  }

  return { gender: null, article: null };
}

// Extract gender and article from French nouns
function extractFrenchGender(entry: DictionaryEntry): { gender: string | null; article: string | null } {
  const pos = entry.partOfSpeech?.toLowerCase() || '';
  const forms = entry.forms?.toLowerCase() || '';

  if (pos.includes('masculine') || forms.includes(' m ') || forms.includes(' m,')) {
    return { gender: 'masculine', article: 'le' };
  }
  if (pos.includes('feminine') || forms.includes(' f ') || forms.includes(' f,')) {
    return { gender: 'feminine', article: 'la' };
  }

  const genderMatch = forms.match(/\b([mf])\b/);
  if (genderMatch) {
    if (genderMatch[1] === 'm') return { gender: 'masculine', article: 'le' };
    if (genderMatch[1] === 'f') return { gender: 'feminine', article: 'la' };
  }

  return { gender: null, article: null };
}

// Extract gender and article from Spanish nouns
function extractSpanishGender(entry: DictionaryEntry): { gender: string | null; article: string | null } {
  const pos = entry.partOfSpeech?.toLowerCase() || '';
  const forms = entry.forms?.toLowerCase() || '';

  if (pos.includes('masculine') || forms.includes(' m ') || forms.includes(' m,')) {
    return { gender: 'masculine', article: 'el' };
  }
  if (pos.includes('feminine') || forms.includes(' f ') || forms.includes(' f,')) {
    return { gender: 'feminine', article: 'la' };
  }

  const genderMatch = forms.match(/\b([mf])\b/);
  if (genderMatch) {
    if (genderMatch[1] === 'm') return { gender: 'masculine', article: 'el' };
    if (genderMatch[1] === 'f') return { gender: 'feminine', article: 'la' };
  }

  return { gender: null, article: null };
}

// Parse forms string into structured data
function parseForms(forms: string | null, language: SupportedLanguage): Record<string, string> | null {
  if (!forms) return null;

  const result: Record<string, string> = {};

  // Common patterns in Wiktionary forms data
  // German: "plural: Hunde, genitive: Hundes"
  // French: "plural: chiens, feminine: chienne"

  const parts = forms.split(/[,;]/);
  for (const part of parts) {
    const colonMatch = part.match(/^\s*([^:]+):\s*(.+)\s*$/);
    if (colonMatch) {
      const key = colonMatch[1].trim().toLowerCase();
      const value = colonMatch[2].trim();
      if (value && !value.match(/^[mfn]$/)) { // Skip single gender markers
        result[key] = value;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// GET - Dictionary lookup (supports German, Spanish, French)
// Uses Wiktionary data with 1.4M+ entries
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const word = searchParams.get("word");
    const language = searchParams.get("language") || "German";

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 });
    }

    // Clean and normalize word: remove punctuation, lowercase, trim
    const cleanedWord = cleanWord(word.trim());
    if (!cleanedWord) {
      return NextResponse.json({ error: "Word is empty after cleaning" }, { status: 400 });
    }

    // Get user to check saved words
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    // Normalize word: lowercase
    const normalizedWord = cleanedWord.toLowerCase();

    // Get lemma info for this word
    const lemmaResult = isSupportedLanguage(language)
      ? lemmatizeWord(cleanedWord, language)
      : null;
    const lemma = lemmaResult?.lemma || normalizedWord;
    const formType = lemmaResult?.formType || null;
    const isBaseForm = lemmaResult?.isBaseForm ?? true;

    // Check if word (or its lemma) is already saved by user
    let alreadySaved = false;
    let savedWordInfo: {
      id: string;
      word: string;
      lemma: string | null;
      masteryLevel: number;
      formsSeen: string[];
      encounterCount: number;
    } | null = null;

    if (user) {
      // Check for saved word by lemma (preferred) or exact word
      // Note: We compare with cleaned/normalized words since we now clean on save
      const existingSaved = await db.query.savedWords.findFirst({
        where: and(
          eq(savedWords.userId, user.id),
          eq(savedWords.targetLanguage, language),
          or(
            // Check by lemma
            eq(savedWords.lemma, lemma),
            // Check by word field
            eq(savedWords.word, lemma),
            eq(savedWords.word, normalizedWord),
            // Fallback for old entries: check with punctuation stripped from saved word
            sql`REGEXP_REPLACE(LOWER(${savedWords.word}), '[.,!?;:"""''„«»()\\[\\]{}]+$', '') = ${normalizedWord}`
          )
        ),
      });

      if (existingSaved) {
        alreadySaved = true;
        const formsSeen: string[] = existingSaved.formsSeen
          ? JSON.parse(existingSaved.formsSeen)
          : [existingSaved.originalForm || existingSaved.word];

        savedWordInfo = {
          id: existingSaved.id,
          word: existingSaved.word,
          lemma: existingSaved.lemma,
          masteryLevel: existingSaved.masteryLevel,
          formsSeen,
          encounterCount: existingSaved.encounterCount,
        };
      }
    }

    // Check if language is supported
    if (!isSupportedLanguage(language)) {
      return NextResponse.json({
        found: false,
        word: cleanedWord,
        message: `Language "${language}" is not supported. Supported: German, Spanish, French`,
        alreadySaved,
        savedWordInfo,
      });
    }

    // Look up in Wiktionary SQLite database (1.4M+ entries, instant)
    const entry: DictionaryEntry | null = lookupWord(cleanedWord, language as SupportedLanguage);

    if (entry) {
      // For German, prefer direct database fields from TU Chemnitz enhancement
      // Fall back to extraction functions if not present
      // IMPORTANT: Only apply gender/article for nouns, not verbs or other parts of speech
      let genderInfo = { gender: null as string | null, article: null as string | null };
      const pos = entry.partOfSpeech?.toLowerCase() || '';
      const isNoun = pos.includes('noun');

      if (isNoun) {
        if (language === 'German') {
          // Prefer enhanced database fields
          if (entry.article && entry.gender) {
            const genderMap: Record<string, string> = { m: 'masculine', f: 'feminine', n: 'neuter' };
            genderInfo = {
              gender: genderMap[entry.gender] || entry.gender,
              article: entry.article,
            };
          } else {
            // Fall back to extraction
            genderInfo = extractGermanGender(entry);
          }
        } else if (language === 'French') {
          genderInfo = extractFrenchGender(entry);
        } else if (language === 'Spanish') {
          genderInfo = extractSpanishGender(entry);
        }
      }

      // Parse forms into structured data
      const parsedForms = parseForms(entry.forms, language as SupportedLanguage);

      // Build enhanced parsed forms with TU Chemnitz data
      const enhancedParsedForms = { ...parsedForms };
      if (language === 'German') {
        if (entry.plural && !enhancedParsedForms?.plural) {
          enhancedParsedForms.plural = entry.plural;
        }
        if (entry.genitive && !enhancedParsedForms?.genitive) {
          enhancedParsedForms.genitive = entry.genitive;
        }
        if (entry.pastParticiple) {
          enhancedParsedForms.pastParticiple = entry.pastParticiple;
        }
        if (entry.preterite) {
          enhancedParsedForms.preterite = entry.preterite;
        }
      }

      // Generate form relationship description if this is an inflected form
      const formRelation = !isBaseForm && lemma !== normalizedWord
        ? getFormRelationDescription(normalizedWord, lemma, formType, language)
        : null;

      return NextResponse.json({
        found: true,
        word: entry.word,
        language,
        // Wiktionary provides English definitions/translations
        translation: entry.definition,
        definitions: entry.definitions,
        partOfSpeech: entry.partOfSpeech || null,
        forms: entry.forms || null,
        parsedForms: Object.keys(enhancedParsedForms || {}).length > 0 ? enhancedParsedForms : null,
        ipa: entry.ipa || null,
        audioUrl: entry.audioUrl || null,
        article: genderInfo.article,
        gender: genderInfo.gender,
        alreadySaved,
        savedWordInfo,
        // Lemma info
        lemma,
        formType,
        formTypeDisplay: formatFormType(formType),
        isBaseForm,
        formRelation,
        // Additional German-specific fields
        ...(language === 'German' && {
          plural: entry.plural || enhancedParsedForms?.plural || null,
          genitive: entry.genitive || enhancedParsedForms?.genitive || null,
          pastParticiple: entry.pastParticiple || null,
          preterite: entry.preterite || null,
        }),
      });
    }

    // Word not found - still return lemma info if available
    return NextResponse.json({
      found: false,
      word: cleanedWord,
      message: "Word not found in dictionary",
      alreadySaved,
      savedWordInfo,
      // Still include lemma info even if word not found
      lemma: lemmaResult?.lemma || normalizedWord,
      formType: lemmaResult?.formType || null,
      formTypeDisplay: formatFormType(lemmaResult?.formType || null),
      isBaseForm: lemmaResult?.isBaseForm ?? true,
    });
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
