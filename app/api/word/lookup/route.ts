import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  lookupWord,
  isSupportedLanguage,
  type DictionaryEntry,
  type SupportedLanguage,
} from "@/lib/dictionary/lookup-sqlite";

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

    // Check if language is supported
    if (!isSupportedLanguage(language)) {
      return NextResponse.json({
        found: false,
        word,
        message: `Language "${language}" is not supported. Supported: German, Spanish, French`,
      });
    }

    // Look up in Wiktionary SQLite database (1.4M+ entries, instant)
    const entry: DictionaryEntry | null = lookupWord(word, language as SupportedLanguage);

    if (entry) {
      // Extract gender/article based on language
      let genderInfo = { gender: null as string | null, article: null as string | null };
      if (language === 'German') {
        genderInfo = extractGermanGender(entry);
      } else if (language === 'French') {
        genderInfo = extractFrenchGender(entry);
      } else if (language === 'Spanish') {
        genderInfo = extractSpanishGender(entry);
      }

      // Parse forms into structured data
      const parsedForms = parseForms(entry.forms, language as SupportedLanguage);

      return NextResponse.json({
        found: true,
        word: entry.word,
        language,
        // Wiktionary provides English definitions/translations
        translation: entry.definition,
        definitions: entry.definitions,
        partOfSpeech: entry.partOfSpeech || null,
        forms: entry.forms || null,
        parsedForms,
        ipa: entry.ipa || null,
        audioUrl: entry.audioUrl || null,
        article: genderInfo.article,
        gender: genderInfo.gender,
      });
    }

    // Word not found
    return NextResponse.json({
      found: false,
      word,
      message: "Word not found in dictionary",
    });
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
