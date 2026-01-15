import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email"),
  nativeLanguage: text("native_language").default("English").notNull(),
  targetLanguage: text("target_language").default("German").notNull(),
  cefrLevel: text("cefr_level").default("B1").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sourceType: text("source_type").default("url").notNull(), // 'url' | 'text' | 'pdf'
    sourceUrl: text("source_url"), // nullable for text input
    pdfUrl: text("pdf_url"), // R2 key for stored PDF files
    title: text("title"),
    originalContent: text("original_content"),
    translatedContent: text("translated_content"),
    targetLanguage: text("target_language").notNull(),
    sourceLanguage: text("source_language"), // Detected language of original content
    cefrLevel: text("cefr_level").notNull(),
    // Translation status tracking
    // Status: queued, fetching, extracting, detecting, translating, completed, failed
    status: text("status").default("queued").notNull(),
    translationProgress: integer("translation_progress").default(0).notNull(), // paragraphs translated
    totalParagraphs: integer("total_paragraphs").default(0).notNull(),
    // Error tracking
    errorMessage: text("error_message"), // User-friendly error message
    errorCode: text("error_code"), // Machine-readable error code
    retryCount: integer("retry_count").default(0).notNull(),
    // Audio
    audioUrl: text("audio_url"),
    audioDurationSeconds: integer("audio_duration_seconds"),
    audioTimestamps: text("audio_timestamps"), // JSON: WordTimestamp[] for reading mode sync
    wordCount: integer("word_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_articles_user_id").on(table.userId),
    index("idx_articles_created_at").on(table.createdAt),
  ]
);

export const savedWords = pgTable(
  "saved_words",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    word: text("word").notNull(),
    contextSentence: text("context_sentence"),
    translation: text("translation"),
    partOfSpeech: text("part_of_speech"),
    article: text("article"),
    example: text("example"),
    notes: text("notes"),
    sourceArticleId: uuid("source_article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    masteryLevel: integer("mastery_level").default(0).notNull(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    targetLanguage: text("target_language").notNull(),
  },
  (table) => [
    index("idx_saved_words_user_id").on(table.userId),
    index("idx_saved_words_next_review").on(table.nextReviewAt),
    unique("saved_words_user_word_lang").on(
      table.userId,
      table.word,
      table.targetLanguage
    ),
  ]
);

// Cache for AI word translations (reusable across users)
export const wordCache = pgTable(
  "word_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    word: text("word").notNull(),
    targetLanguage: text("target_language").notNull(),
    cefrLevel: text("cefr_level").notNull(),
    translation: text("translation"),
    partOfSpeech: text("part_of_speech"),
    article: text("article"), // for German der/die/das
    example: text("example"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("word_cache_unique").on(table.word, table.targetLanguage, table.cefrLevel),
    index("idx_word_cache_lookup").on(table.word, table.targetLanguage),
  ]
);

// Type exports for use in application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type SavedWord = typeof savedWords.$inferSelect;
export type NewSavedWord = typeof savedWords.$inferInsert;
export type WordCache = typeof wordCache.$inferSelect;
export type NewWordCache = typeof wordCache.$inferInsert;

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const CEFR_LEVELS: { value: CEFRLevel; label: string; description: string }[] = [
  { value: "A1", label: "A1 - Beginner", description: "Basic vocabulary, simple sentences" },
  { value: "A2", label: "A2 - Elementary", description: "Simple past and future tenses" },
  { value: "B1", label: "B1 - Intermediate", description: "Common expressions, opinions" },
  { value: "B2", label: "B2 - Upper Intermediate", description: "Complex sentences, idioms" },
  { value: "C1", label: "C1 - Advanced", description: "Nuanced, near-native expression" },
  { value: "C2", label: "C2 - Mastery", description: "Full native-level fluency" },
];

// Supported target languages (limited to those with offline dictionaries)
export const LANGUAGES = [
  "German",
  "Spanish",
  "French",
] as const;

export type TargetLanguage = typeof LANGUAGES[number];

// Source types for articles
export const SOURCE_TYPES = ["url", "text", "pdf"] as const;
export type SourceType = typeof SOURCE_TYPES[number];

// Article status types
export const ARTICLE_STATUSES = [
  "queued",
  "fetching",
  "extracting",
  "detecting",
  "translating",
  "completed",
  "failed",
] as const;
export type ArticleStatus = typeof ARTICLE_STATUSES[number];
