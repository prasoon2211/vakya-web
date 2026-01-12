import { GoogleGenAI, FileState } from "@google/genai";

// Lazy-init Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

interface ExtractedPDF {
  title: string;
  content: string;
  pageCount?: number;
}

/**
 * Extract text content from a PDF using Gemini Vision
 * @param pdfBuffer - The PDF file as a Buffer
 * @param filename - Original filename (for context)
 * @returns Extracted title and text content
 */
export async function extractTextFromPDF(
  pdfBuffer: Buffer,
  filename: string
): Promise<ExtractedPDF> {
  const gemini = getGemini();
  if (!gemini) {
    throw new Error("Gemini client not available - missing GOOGLE_AI_API_KEY");
  }

  console.log(`[PDF] Starting extraction for ${filename} (${pdfBuffer.length} bytes)`);

  try {
    // Upload the PDF file to Gemini
    // Convert Buffer to ArrayBuffer for Blob compatibility
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;
    const uploadResult = await gemini.files.upload({
      file: new Blob([arrayBuffer], { type: "application/pdf" }),
      config: {
        displayName: filename,
      },
    });

    const uploadedFile = uploadResult;
    if (!uploadedFile || !uploadedFile.name) {
      throw new Error("Failed to upload PDF to Gemini");
    }

    console.log(`[PDF] File uploaded: ${uploadedFile.name}`);

    // Wait for file processing to complete
    let file = await gemini.files.get({ name: uploadedFile.name! });
    while (file.state === FileState.PROCESSING) {
      console.log(`[PDF] Processing...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      file = await gemini.files.get({ name: uploadedFile.name! });
    }

    if (file.state === FileState.FAILED) {
      throw new Error("PDF processing failed");
    }

    console.log(`[PDF] File ready, extracting text...`);

    // Extract text using Gemini Vision
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: file.uri!,
                mimeType: "application/pdf",
              },
            },
            {
              text: `Extract all the text content from this PDF document.

Your task:
1. Extract ALL text from the document, preserving paragraph structure
2. Identify the document title (if present)
3. Ignore headers, footers, page numbers, and decorative elements
4. Preserve the logical reading order

Return your response as JSON:
{
  "title": "The document title or a suitable title based on content",
  "content": "The full text content with paragraphs separated by double newlines",
  "pageCount": number of pages (if determinable)
}

IMPORTANT: Extract the COMPLETE text - do not summarize or truncate.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini");
    }

    const parsed = JSON.parse(responseText);

    console.log(`[PDF] Extracted: "${parsed.title}" (${parsed.content?.length || 0} chars)`);

    // Clean up the uploaded file
    try {
      await gemini.files.delete({ name: uploadedFile.name! });
      console.log(`[PDF] Cleaned up uploaded file`);
    } catch (cleanupError) {
      // Non-fatal, just log
      console.warn(`[PDF] Failed to cleanup file:`, cleanupError);
    }

    return {
      title: parsed.title || filename.replace(/\.pdf$/i, ""),
      content: parsed.content || "",
      pageCount: parsed.pageCount,
    };
  } catch (error) {
    console.error("[PDF] Extraction error:", error);
    throw error;
  }
}
