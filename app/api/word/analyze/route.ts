import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST - AI word analysis
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { word, contextSentence, targetLanguage } = body;

    if (!word || !targetLanguage) {
      return NextResponse.json(
        { error: "Word and target language are required" },
        { status: 400 }
      );
    }

    // Get user's native language
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { nativeLanguage: true, cefrLevel: true },
    });

    const nativeLanguage = user?.nativeLanguage || "English";
    const cefrLevel = user?.cefrLevel || "B1";

    const prompt = `Analyze the word "${word}" in ${targetLanguage}${contextSentence ? ` appearing in this context: "${contextSentence}"` : ""}.
The learner speaks ${nativeLanguage} and is learning ${targetLanguage} at ${cefrLevel} level.

Return ONLY a valid JSON object with these exact keys:
{
  "translation": "translation in ${nativeLanguage}",
  "pos": "part of speech (noun/verb/adjective/adverb/preposition/conjunction/article/pronoun)",
  "article": "grammatical article if applicable (e.g., der/die/das for German nouns) or null",
  "gender": "grammatical gender if applicable (masculine/feminine/neuter) or null",
  "example": "a simple example sentence in ${targetLanguage} using this word",
  "explanation": "brief explanation of usage, any irregularities, or helpful notes appropriate for a ${cefrLevel} learner (in ${nativeLanguage})"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a language learning assistant. Provide accurate, helpful word analysis for language learners. Always respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json(
        { error: "Invalid response format from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      word,
      ...analysis,
    });
  } catch (error) {
    console.error("Word analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
