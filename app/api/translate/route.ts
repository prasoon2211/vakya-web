import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TranslationBlock {
  original: string;
  translated: string;
}

// POST - Translate an article
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, targetLanguage, cefrLevel } = body;

    if (!url || !targetLanguage || !cefrLevel) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get or create user
    let user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({ clerkId: userId })
        .returning({ id: users.id });
      user = newUser;
    }

    // Check if article already exists
    const existingArticle = await db.query.articles.findFirst({
      where: and(
        eq(articles.userId, user.id),
        eq(articles.sourceUrl, url),
        eq(articles.targetLanguage, targetLanguage),
        eq(articles.cefrLevel, cefrLevel)
      ),
      columns: { id: true },
    });

    if (existingArticle) {
      return NextResponse.json({ articleId: existingArticle.id });
    }

    // Fetch content via Jina AI
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        Accept: "application/json",
        "X-Return-Format": "markdown",
      },
    });

    if (!jinaResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch article content" },
        { status: 400 }
      );
    }

    const jinaData = await jinaResponse.json();
    const originalContent = jinaData.data?.content || jinaData.content || "";
    const title = jinaData.data?.title || jinaData.title || "Untitled";

    if (!originalContent || originalContent.length < 100) {
      return NextResponse.json(
        { error: "Article content too short or couldn't be extracted" },
        { status: 400 }
      );
    }

    // Split content into paragraphs
    const paragraphs = originalContent
      .split(/\n\n+/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0 && !p.startsWith("![") && !p.startsWith("#"));

    // Translate via OpenAI in batches
    const batchSize = 5;
    const translatedBlocks: TranslationBlock[] = [];

    for (let i = 0; i < paragraphs.length; i += batchSize) {
      const batch = paragraphs.slice(i, i + batchSize);

      const systemPrompt = `You are a language learning assistant. Translate the following paragraphs to ${targetLanguage} at CEFR level ${cefrLevel}.

Guidelines for ${cefrLevel}:
- A1: Use only basic vocabulary (500 most common words), simple present tense, short sentences
- A2: Elementary vocabulary, simple past and future, compound sentences allowed
- B1: Intermediate vocabulary, all common tenses, can express opinions
- B2: Upper-intermediate vocabulary, complex sentences, idiomatic expressions acceptable
- C1: Advanced vocabulary, nuanced expression, near-native structures
- C2: Full native-level expression, literary and technical terms acceptable

Maintain the meaning and tone of the original. Return ONLY a valid JSON array with objects containing "original" and "translated" keys for each paragraph.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Translate these paragraphs:\n\n${batch.map((p: string, idx: number) => `[${idx + 1}] ${p}`).join("\n\n")}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          const blocks = parsed.blocks || parsed.translations || parsed;
          if (Array.isArray(blocks)) {
            translatedBlocks.push(...blocks);
          }
        } catch {
          // If parsing fails, create simple blocks
          batch.forEach((original: string) => {
            translatedBlocks.push({ original, translated: original });
          });
        }
      }
    }

    // Calculate word count
    const wordCount = translatedBlocks.reduce((acc, block) => {
      return acc + (block.translated?.split(/\s+/).length || 0);
    }, 0);

    // Store in database
    const [article] = await db
      .insert(articles)
      .values({
        userId: user.id,
        sourceUrl: url,
        title,
        originalContent: JSON.stringify(translatedBlocks.map((b) => b.original)),
        translatedContent: JSON.stringify(translatedBlocks),
        targetLanguage,
        cefrLevel,
        wordCount,
      })
      .returning({ id: articles.id });

    return NextResponse.json({ articleId: article.id });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed. Please try again." },
      { status: 500 }
    );
  }
}
