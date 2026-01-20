import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { alignWordsToOriginal, WhisperWord, WordTimestamp } from "@/lib/audio/align-timestamps";
import { computeBridgeSentenceMap } from "@/lib/audio/bridge-mapping";

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
  bridge?: string;
}

// Language-specific TTS instructions for natural pronunciation
const TTS_INSTRUCTIONS: Record<string, string> = {
  German: "Speak in German with clear, native German pronunciation. Use a calm, measured pace suitable for language learners. Enunciate clearly and naturally.",
  Spanish: "Speak in Spanish with clear, native Spanish pronunciation. Use a calm, measured pace suitable for language learners. Enunciate clearly and naturally.",
  French: "Speak in French with clear, native French pronunciation. Use a calm, measured pace suitable for language learners. Enunciate clearly and naturally.",
};

// Conservative chunk size to stay well under 2000 token limit
// German compound words tokenize heavily, so we use ~1000 chars as target
const TARGET_CHUNK_CHARS = 1000;

// Split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentences (preserving the punctuation)
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];

  for (const sentence of sentences) {
    // If adding this sentence would exceed target and we have content, start new chunk
    if (currentChunk.length > 0 && currentChunk.length + sentence.length > TARGET_CHUNK_CHARS) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
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
    if (!article.translatedContent) {
      return NextResponse.json(
        { error: "Article translation not complete" },
        { status: 400 }
      );
    }
    try {
      blocks = JSON.parse(article.translatedContent);
    } catch {
      return NextResponse.json(
        { error: "Invalid article content" },
        { status: 400 }
      );
    }

    // Combine translated text (no truncation - we'll chunk it)
    const translatedText = blocks
      .map((block) => block.translated)
      .join("\n\n");

    // Split into chunks at sentence boundaries to stay under token limit
    const chunks = splitTextIntoChunks(translatedText);
    console.log(`[Audio] Splitting text into ${chunks.length} chunks for TTS`);

    // Generate audio for all chunks in parallel
    const ttsInstructions = TTS_INSTRUCTIONS[article.targetLanguage] || TTS_INSTRUCTIONS.German;
    const audioBuffers = await Promise.all(
      chunks.map(async (chunk, index) => {
        console.log(`[Audio] Generating TTS for chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`);
        const mp3 = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "coral",
          input: chunk,
          instructions: ttsInstructions,
        });
        return Buffer.from(await mp3.arrayBuffer());
      })
    );

    // Concatenate all audio buffers
    const buffer = Buffer.concat(audioBuffers);
    console.log(`[Audio] Combined ${audioBuffers.length} audio chunks into ${buffer.length} bytes`);

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

    // Transcribe audio with Whisper to get word-level timestamps
    let audioTimestamps: string | null = null;
    try {
      const audioFile = await toFile(buffer, "audio.mp3", { type: "audio/mpeg" });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
      });

      // The verbose_json response includes a 'words' array when timestamp_granularities includes "word"
      // TypeScript types don't fully reflect this, so we cast the response
      const verboseResponse = transcription as {
        words?: Array<{ word: string; start: number; end: number }>;
      };

      if (verboseResponse.words && verboseResponse.words.length > 0) {
        // Align transcribed words to original text
        const whisperWords: WhisperWord[] = verboseResponse.words.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }));

        const aligned = alignWordsToOriginal(translatedText, whisperWords);
        audioTimestamps = JSON.stringify(aligned);
        console.log(`[Audio] Generated ${aligned.length} word timestamps for article ${id}`);
      } else {
        console.warn("[Audio] Whisper transcription returned no words");
      }
    } catch (transcriptionError) {
      // Log error but don't fail - audio still works without timestamps
      console.error("[Audio] Whisper transcription failed:", transcriptionError);
    }

    // Estimate duration (rough: ~150 words per minute)
    const wordCount = translatedText.split(/\s+/).length;
    const estimatedDuration = Math.round((wordCount / 150) * 60);

    // Compute bridge sentence mapping if we have timestamps and bridge text
    let bridgeSentenceMap: string | null = null;
    if (audioTimestamps) {
      try {
        const timestamps: WordTimestamp[] = JSON.parse(audioTimestamps);
        const bridgeText = blocks
          .map((block) => block.bridge || "")
          .filter(Boolean)
          .join(" ");

        if (bridgeText) {
          const mapping = await computeBridgeSentenceMap(timestamps, bridgeText, article.targetLanguage);
          if (mapping.length > 0) {
            bridgeSentenceMap = JSON.stringify(mapping);
            console.log(`[Audio] Computed bridge mapping for ${mapping.length} sentences`);
          }
        }
      } catch (mappingError) {
        console.error("[Audio] Bridge mapping computation failed:", mappingError);
      }
    }

    // Update article with audio key, timestamps, and bridge mapping
    await db
      .update(articles)
      .set({
        audioUrl: audioKey,
        audioDurationSeconds: estimatedDuration,
        audioTimestamps,
        bridgeSentenceMap,
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
