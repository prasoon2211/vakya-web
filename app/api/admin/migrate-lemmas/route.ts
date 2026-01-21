import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, savedWords, wordContexts } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { lemmatizeWord, cleanWord } from "@/lib/dictionary/lemmatizer";

interface MigrationStats {
  totalWords: number;
  lemmasBackfilled: number;
  duplicatesFound: number;
  duplicatesMerged: number;
  contextsMigrated: number;
  punctuationCleaned: number;
  errors: string[];
}

// GET /api/admin/migrate-lemmas?dryRun=true
// Backfills lemma data and merges duplicates
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin (you may want to add proper admin check)
    const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];
    // For now, allow any authenticated user to run this (remove in production if needed)

    const { searchParams } = new URL(request.url);
    const isDryRun = searchParams.get("dryRun") === "true";

    const stats: MigrationStats = {
      totalWords: 0,
      lemmasBackfilled: 0,
      duplicatesFound: 0,
      duplicatesMerged: 0,
      contextsMigrated: 0,
      punctuationCleaned: 0,
      errors: [],
    };

    // Get all saved words
    const allWords = await db.query.savedWords.findMany({
      orderBy: (sw, { desc }) => [desc(sw.masteryLevel), desc(sw.createdAt)],
    });

    stats.totalWords = allWords.length;

    // Group words by user and language for duplicate detection
    const wordsByUserLang: Map<string, typeof allWords> = new Map();

    for (const word of allWords) {
      const key = `${word.userId}:${word.targetLanguage}`;
      if (!wordsByUserLang.has(key)) {
        wordsByUserLang.set(key, []);
      }
      wordsByUserLang.get(key)!.push(word);
    }

    // Process each user+language group
    for (const [key, userWords] of wordsByUserLang) {
      const [, language] = key.split(":");

      // PHASE 1: Compute lemmas for all words and group them
      const lemmaToWords: Map<string, Array<{
        dbWord: typeof userWords[0];
        computedLemma: string;
        computedFormType: string | null;
        cleanedOriginal: string;
      }>> = new Map();

      for (const word of userWords) {
        // Clean punctuation from the stored word
        const cleanedWord = cleanWord(word.word);
        if (cleanedWord !== word.word.toLowerCase()) {
          stats.punctuationCleaned++;
        }
        const result = lemmatizeWord(cleanedWord, language);
        const lemma = result.lemma;
        const formType = result.formType;

        if (!lemmaToWords.has(lemma)) {
          lemmaToWords.set(lemma, []);
        }
        lemmaToWords.get(lemma)!.push({
          dbWord: word,
          computedLemma: lemma,
          computedFormType: formType,
          cleanedOriginal: cleanedWord,
        });
      }

      // PHASE 2: Process each lemma group - merge duplicates FIRST, then update
      for (const [lemma, wordGroup] of lemmaToWords) {
        if (wordGroup.length > 1) {
          // DUPLICATES FOUND - need to merge
          stats.duplicatesFound += wordGroup.length - 1;

          // Sort: highest mastery first, then oldest
          const sorted = [...wordGroup].sort((a, b) => {
            if (a.dbWord.masteryLevel !== b.dbWord.masteryLevel) {
              return b.dbWord.masteryLevel - a.dbWord.masteryLevel;
            }
            return new Date(a.dbWord.createdAt).getTime() - new Date(b.dbWord.createdAt).getTime();
          });

          const keepEntry = sorted[0];
          const duplicateEntries = sorted.slice(1);

          // Collect all forms seen and context sentences from ALL entries
          const allFormsSeen = new Set<string>();
          const allContexts: { sentence: string; form: string; articleId: string | null }[] = [];

          for (const entry of wordGroup) {
            const w = entry.dbWord;
            // Add the cleaned word
            allFormsSeen.add(entry.cleanedOriginal);
            // Add originalForm if set (also cleaned)
            if (w.originalForm) allFormsSeen.add(cleanWord(w.originalForm));
            // Add any existing formsSeen (also cleaned)
            if (w.formsSeen) {
              try {
                const forms = JSON.parse(w.formsSeen) as string[];
                forms.forEach(f => {
                  const cleaned = cleanWord(f);
                  if (cleaned) allFormsSeen.add(cleaned);
                });
              } catch {
                // ignore parse errors
              }
            }

            // Collect context
            if (w.contextSentence) {
              allContexts.push({
                sentence: w.contextSentence,
                form: cleanWord(w.originalForm || w.word),
                articleId: w.sourceArticleId,
              });
            }
          }

          if (!isDryRun) {
            try {
              // FIRST: Delete duplicates (to avoid unique constraint violation)
              for (const dup of duplicateEntries) {
                await db.delete(savedWords).where(eq(savedWords.id, dup.dbWord.id));
                stats.duplicatesMerged++;
              }

              // THEN: Update the kept word with merged data AND correct lemma
              await db.update(savedWords)
                .set({
                  word: lemma,  // Update word column to lemma
                  lemma,
                  originalForm: cleanWord(keepEntry.dbWord.originalForm || keepEntry.dbWord.word),
                  formType: keepEntry.computedFormType || keepEntry.dbWord.formType,
                  formsSeen: JSON.stringify([...allFormsSeen]),
                  encounterCount: wordGroup.reduce((sum, e) => sum + e.dbWord.encounterCount, 0),
                  translation: keepEntry.dbWord.translation || duplicateEntries.find(d => d.dbWord.translation)?.dbWord.translation,
                  notes: keepEntry.dbWord.notes || duplicateEntries.find(d => d.dbWord.notes)?.dbWord.notes,
                  example: keepEntry.dbWord.example || duplicateEntries.find(d => d.dbWord.example)?.dbWord.example,
                })
                .where(eq(savedWords.id, keepEntry.dbWord.id));

              stats.lemmasBackfilled++;

              // Migrate all contexts to word_contexts table
              for (const ctx of allContexts) {
                try {
                  await db.insert(wordContexts).values({
                    savedWordId: keepEntry.dbWord.id,
                    contextSentence: ctx.sentence,
                    encounteredForm: ctx.form,
                    sourceArticleId: ctx.articleId,
                  });
                  stats.contextsMigrated++;
                } catch {
                  // Context might already exist
                }
              }
            } catch (err) {
              stats.errors.push(`Failed to merge duplicates for ${lemma}: ${(err as Error).message}`);
            }
          } else {
            stats.duplicatesMerged += duplicateEntries.length;
            stats.contextsMigrated += allContexts.length;
            stats.lemmasBackfilled++;
          }
        } else {
          // SINGLE WORD - just update lemma and word column
          const entry = wordGroup[0];
          const w = entry.dbWord;
          const needsUpdate = !w.lemma || w.lemma !== lemma || w.word !== lemma;

          // Clean existing formsSeen
          let cleanedFormsSeen: string[] = [];
          if (w.formsSeen) {
            try {
              const forms = JSON.parse(w.formsSeen) as string[];
              cleanedFormsSeen = forms.map(f => cleanWord(f)).filter(f => f);
            } catch {
              cleanedFormsSeen = [entry.cleanedOriginal];
            }
          } else {
            cleanedFormsSeen = [entry.cleanedOriginal];
          }

          if (needsUpdate) {
            if (!isDryRun) {
              try {
                await db.update(savedWords)
                  .set({
                    word: lemma,  // Update word column to lemma
                    lemma,
                    originalForm: cleanWord(w.originalForm || w.word),
                    formType: entry.computedFormType || w.formType,
                    formsSeen: JSON.stringify(cleanedFormsSeen),
                  })
                  .where(eq(savedWords.id, w.id));
              } catch (err) {
                stats.errors.push(`Failed to update ${w.word}: ${(err as Error).message}`);
              }
            }
            stats.lemmasBackfilled++;
          }

          // Migrate context if exists
          if (w.contextSentence) {
            const existingContext = await db.query.wordContexts.findFirst({
              where: and(
                eq(wordContexts.savedWordId, w.id),
                eq(wordContexts.contextSentence, w.contextSentence)
              ),
            });

            if (!existingContext) {
              if (!isDryRun) {
                try {
                  await db.insert(wordContexts).values({
                    savedWordId: w.id,
                    contextSentence: w.contextSentence,
                    encounteredForm: cleanWord(w.originalForm || w.word),
                    sourceArticleId: w.sourceArticleId,
                  });
                  stats.contextsMigrated++;
                } catch {
                  // Ignore
                }
              } else {
                stats.contextsMigrated++;
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: isDryRun,
      stats,
      message: isDryRun
        ? "Dry run complete. Call without ?dryRun=true to apply changes."
        : "Migration complete.",
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: "Migration failed", details: (error as Error).message },
      { status: 500 }
    );
  }
}
