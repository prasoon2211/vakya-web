#!/usr/bin/env node
/**
 * Download dictionary databases from R2 at startup
 *
 * This script checks if dictionary databases exist locally.
 * If not, it downloads them from R2 storage.
 *
 * Expected R2 structure:
 *   dictionary/dictionary-de.db
 *   dictionary/dictionary-es.db
 *   dictionary/dictionary-fr.db
 */

const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const LANGUAGES = ['de', 'es', 'fr'];
const DICT_DIR = path.join(process.cwd(), 'lib/dictionary');

// R2 configuration from environment
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

function getS3Client() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.log('[Dictionary] R2 credentials not configured, skipping download');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

async function downloadFile(s3, key, localPath) {
  try {
    // Check if file exists in R2
    try {
      await s3.send(new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }));
    } catch {
      console.log(`[Dictionary] File not found in R2: ${key}`);
      return false;
    }

    console.log(`[Dictionary] Downloading ${key}...`);
    const startTime = Date.now();

    const response = await s3.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));

    if (!response.Body) {
      console.error(`[Dictionary] Empty response for ${key}`);
      return false;
    }

    // Ensure directory exists
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Stream to file
    const writeStream = fs.createWriteStream(localPath);
    await pipeline(response.Body, writeStream);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const size = fs.statSync(localPath).size;
    console.log(`[Dictionary] Downloaded ${key} (${(size / 1024 / 1024).toFixed(1)} MB) in ${elapsed}s`);

    return true;
  } catch (err) {
    console.error(`[Dictionary] Failed to download ${key}:`, err);
    return false;
  }
}

async function main() {
  console.log('[Dictionary] Checking for dictionary databases...');

  // Check which databases need to be downloaded
  const missing = [];
  for (const lang of LANGUAGES) {
    const localPath = path.join(DICT_DIR, `dictionary-${lang}.db`);
    if (!fs.existsSync(localPath)) {
      missing.push(lang);
    } else {
      const size = fs.statSync(localPath).size;
      console.log(`[Dictionary] Found dictionary-${lang}.db (${(size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }

  if (missing.length === 0) {
    console.log('[Dictionary] All dictionaries present, no download needed');
    return;
  }

  console.log(`[Dictionary] Missing: ${missing.map(l => `dictionary-${l}.db`).join(', ')}`);

  const s3 = getS3Client();
  if (!s3) {
    console.log('[Dictionary] Cannot download - R2 not configured');
    return;
  }

  // Download missing databases
  for (const lang of missing) {
    const key = `dicts/dictionary-${lang}.db`;
    const localPath = path.join(DICT_DIR, `dictionary-${lang}.db`);
    await downloadFile(s3, key, localPath);
  }

  console.log('[Dictionary] Download complete');
}

main().catch((err) => {
  console.error('[Dictionary] Download failed:', err);
  // Don't exit with error - app can still run without dictionaries
  // (will fall back to AI analysis)
});
