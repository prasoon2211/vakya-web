#!/usr/bin/env node
/**
 * Download dictionary databases from R2 at startup
 *
 * This script checks if dictionary databases exist locally AND if they match
 * the version on R2 (using hash/ETag comparison). Downloads if:
 * - File doesn't exist locally
 * - File exists but hash differs from R2 (updated version available)
 *
 * Expected R2 structure:
 *   dicts/dictionary-de.db
 *   dicts/dictionary-es.db
 *   dicts/dictionary-fr.db
 *
 * Hash manifest file (local):
 *   lib/dictionary/.dict-hashes.json
 */

const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const LANGUAGES = ['de', 'es', 'fr'];
const DICT_DIR = path.join(process.cwd(), 'lib/dictionary');
const HASH_FILE = path.join(DICT_DIR, '.dict-hashes.json');

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

/**
 * Load saved hashes from local manifest file
 */
function loadLocalHashes() {
  try {
    if (fs.existsSync(HASH_FILE)) {
      return JSON.parse(fs.readFileSync(HASH_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Dictionary] Failed to load hash manifest:', err.message);
  }
  return {};
}

/**
 * Save hashes to local manifest file
 */
function saveLocalHashes(hashes) {
  try {
    fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2));
  } catch (err) {
    console.warn('[Dictionary] Failed to save hash manifest:', err.message);
  }
}

/**
 * Calculate MD5 hash of a local file
 */
function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Get ETag (hash) from R2 for a given key
 * R2 ETag for non-multipart uploads is the MD5 hash in quotes
 */
async function getR2Hash(s3, key) {
  try {
    const response = await s3.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));

    // ETag comes in quotes, remove them
    const etag = response.ETag?.replace(/"/g, '') || null;

    // Also check for custom metadata (x-amz-meta-hash)
    const customHash = response.Metadata?.hash || response.Metadata?.md5 || null;

    return {
      etag,
      customHash,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
    };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Download file from R2
 */
async function downloadFile(s3, key, localPath, r2Info) {
  try {
    console.log(`[Dictionary] Downloading ${key}...`);
    const startTime = Date.now();

    const response = await s3.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));

    if (!response.Body) {
      console.error(`[Dictionary] Empty response for ${key}`);
      return null;
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

    // Calculate and return hash of downloaded file
    const localHash = await calculateFileHash(localPath);
    return localHash;
  } catch (err) {
    console.error(`[Dictionary] Failed to download ${key}:`, err);
    return null;
  }
}

async function main() {
  console.log('[Dictionary] Checking for dictionary databases (with hash verification)...');

  const localHashes = loadLocalHashes();
  const s3 = getS3Client();

  if (!s3) {
    console.log('[Dictionary] Cannot check R2 - credentials not configured');
    // Still report what we have locally
    for (const lang of LANGUAGES) {
      const localPath = path.join(DICT_DIR, `dictionary-${lang}.db`);
      if (fs.existsSync(localPath)) {
        const size = fs.statSync(localPath).size;
        console.log(`[Dictionary] Found dictionary-${lang}.db (${(size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
    return;
  }

  const updatedHashes = { ...localHashes };
  let downloadCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const lang of LANGUAGES) {
    const key = `dicts/dictionary-${lang}.db`;
    const localPath = path.join(DICT_DIR, `dictionary-${lang}.db`);
    const fileExists = fs.existsSync(localPath);

    try {
      // Get R2 metadata
      const r2Info = await getR2Hash(s3, key);

      if (!r2Info) {
        console.log(`[Dictionary] File not found in R2: ${key}`);
        if (fileExists) {
          const size = fs.statSync(localPath).size;
          console.log(`[Dictionary] Using local dictionary-${lang}.db (${(size / 1024 / 1024).toFixed(1)} MB)`);
        }
        continue;
      }

      // Determine if we need to download
      let needsDownload = false;
      let reason = '';

      if (!fileExists) {
        needsDownload = true;
        reason = 'file missing locally';
      } else {
        // File exists, compare hashes
        const localHash = localHashes[lang]?.hash;
        const r2Hash = r2Info.customHash || r2Info.etag;

        if (!localHash) {
          // No stored hash, calculate it
          const calculatedHash = await calculateFileHash(localPath);
          if (calculatedHash !== r2Hash) {
            needsDownload = true;
            reason = `hash mismatch (local: ${calculatedHash?.slice(0, 8)}... vs r2: ${r2Hash?.slice(0, 8)}...)`;
          } else {
            // Hash matches, just update manifest
            updatedHashes[lang] = {
              hash: calculatedHash,
              size: fs.statSync(localPath).size,
              lastUpdated: new Date().toISOString(),
            };
            skipCount++;
            const size = fs.statSync(localPath).size;
            console.log(`[Dictionary] dictionary-${lang}.db is up to date (${(size / 1024 / 1024).toFixed(1)} MB)`);
          }
        } else if (localHash !== r2Hash) {
          needsDownload = true;
          reason = `updated version available (${r2Hash?.slice(0, 8)}...)`;
        } else {
          skipCount++;
          const size = fs.statSync(localPath).size;
          console.log(`[Dictionary] dictionary-${lang}.db is up to date (${(size / 1024 / 1024).toFixed(1)} MB)`);
        }
      }

      if (needsDownload) {
        console.log(`[Dictionary] ${lang}: ${reason}`);
        const newHash = await downloadFile(s3, key, localPath, r2Info);

        if (newHash) {
          updatedHashes[lang] = {
            hash: newHash,
            r2ETag: r2Info.etag,
            size: fs.statSync(localPath).size,
            lastUpdated: new Date().toISOString(),
          };
          downloadCount++;
        } else {
          errorCount++;
        }
      }
    } catch (err) {
      console.error(`[Dictionary] Error checking ${lang}:`, err.message);
      errorCount++;
    }
  }

  // Save updated hash manifest
  saveLocalHashes(updatedHashes);

  // Summary
  console.log('[Dictionary] Check complete:');
  if (downloadCount > 0) console.log(`  - Downloaded: ${downloadCount}`);
  if (skipCount > 0) console.log(`  - Up to date: ${skipCount}`);
  if (errorCount > 0) console.log(`  - Errors: ${errorCount}`);
}

main().catch((err) => {
  console.error('[Dictionary] Download failed:', err);
  // Don't exit with error - app can still run without dictionaries
  // (will fall back to AI analysis)
});
