#!/usr/bin/env node
/**
 * Build script for Claude CLI binary
 *
 * Downloads the official Claude Code binary from Anthropic's distribution.
 * This is more robust than patching the source code ourselves.
 */

import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, chmodSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { get as httpsGet } from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentBridgeDir = dirname(__dirname);
const binariesDir = join(agentBridgeDir, '..', 'src-tauri', 'binaries');

// Base URL for Claude Code distribution
const DIST_BASE = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases';

// Platform mappings
const PLATFORMS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
};

/**
 * Fetch text content from a URL
 */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Download a file to disk
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    httpsGet(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      res.on('error', (err) => {
        file.close();
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

/**
 * Calculate SHA256 hash of a file
 */
function sha256File(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Download Claude CLI for a specific platform
 */
async function downloadClaudeCli(platform, version, manifest) {
  const tauriTriple = PLATFORMS[platform];
  if (!tauriTriple) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const outputPath = join(binariesDir, `claude-${tauriTriple}`);

  // Check if already downloaded with correct checksum
  const expectedHash = manifest.platforms[platform]?.checksum;
  if (existsSync(outputPath) && expectedHash) {
    const actualHash = sha256File(outputPath);
    if (actualHash === expectedHash) {
      console.log(`  ✓ ${platform} already up-to-date`);
      return;
    }
  }

  console.log(`  Downloading ${platform}...`);

  const url = `${DIST_BASE}/${version}/${platform}/claude`;
  await downloadFile(url, outputPath);

  // Verify checksum
  if (expectedHash) {
    const actualHash = sha256File(outputPath);
    if (actualHash !== expectedHash) {
      throw new Error(`Checksum mismatch for ${platform}: expected ${expectedHash}, got ${actualHash}`);
    }
    console.log(`  ✓ ${platform} checksum verified`);
  }

  // Make executable
  chmodSync(outputPath, 0o755);
}

async function main() {
  console.log('📦 Downloading official Claude CLI binaries...\n');

  // Ensure binaries directory exists
  mkdirSync(binariesDir, { recursive: true });

  // Get latest stable version
  console.log('  Fetching latest version...');
  const version = (await fetchText(`${DIST_BASE}/stable`)).trim();
  console.log(`  Latest version: ${version}\n`);

  // Get manifest with checksums
  console.log('  Fetching manifest...');
  const manifestText = await fetchText(`${DIST_BASE}/${version}/manifest.json`);
  const manifest = JSON.parse(manifestText);
  console.log('');

  // Determine which platform to download
  const currentPlatform = `${process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;

  // For now, just download the current platform
  // TODO: Add cross-platform support if needed
  await downloadClaudeCli(currentPlatform, version, manifest);

  console.log('\n✅ Claude CLI binary downloaded successfully');
  console.log(`   Version: ${version}`);
  console.log(`   Location: ${binariesDir}`);
}

main().catch((error) => {
  console.error('❌ Failed to download Claude CLI:', error.message);
  process.exit(1);
});
