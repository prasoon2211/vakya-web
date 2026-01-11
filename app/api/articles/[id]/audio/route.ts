import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

interface TranslationBlock {
  original: string;
  translated: string;
}

// GET - Get signed URL for existing audio
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get article
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: { audioUrl: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    if (!article.audioUrl) {
      return NextResponse.json({ error: "No audio available" }, { status: 404 });
    }

    // Generate signed URL (valid for 1 hour)
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: article.audioUrl, // audioUrl now stores just the key
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({ audioUrl: signedUrl });
  } catch (error) {
    console.error("Error getting audio URL:", error);
    return NextResponse.json({ error: "Failed to get audio URL" }, { status: 500 });
  }
}

// POST - Generate audio for article
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get article
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Check if audio already exists
    if (article.audioUrl) {
      // Return a fresh signed URL
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: article.audioUrl,
      });
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      return NextResponse.json({ audioUrl: signedUrl });
    }

    // Parse translated content
    let blocks: TranslationBlock[] = [];
    try {
      blocks = JSON.parse(article.translatedContent);
    } catch {
      return NextResponse.json(
        { error: "Invalid article content" },
        { status: 400 }
      );
    }

    // Combine translated text
    const translatedText = blocks
      .map((block) => block.translated)
      .join("\n\n")
      .slice(0, 4096); // OpenAI TTS limit

    // Generate audio with OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: translatedText,
      speed: 1.0,
    });

    // Convert to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());

    // Upload to R2 - store just the key, not full URL
    const audioKey = `audio/${id}.mp3`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: audioKey,
        Body: buffer,
        ContentType: "audio/mpeg",
      })
    );

    // Estimate duration (rough: ~150 words per minute)
    const wordCount = translatedText.split(/\s+/).length;
    const estimatedDuration = Math.round((wordCount / 150) * 60);

    // Update article with audio key (not full URL)
    await db
      .update(articles)
      .set({
        audioUrl: audioKey,
        audioDurationSeconds: estimatedDuration,
      })
      .where(eq(articles.id, id));

    // Return signed URL for immediate playback
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: audioKey,
    });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({ audioUrl: signedUrl });
  } catch (error) {
    console.error("Audio generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}
