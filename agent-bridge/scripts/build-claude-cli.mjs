#!/usr/bin/env node
/**
 * Build script for Claude CLI binary
 *
 * This script patches the Claude Code CLI to embed yoga.wasm as base64,
 * then compiles it with Bun to create a standalone binary.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentBridgeDir = dirname(__dirname);
const binariesDir = join(agentBridgeDir, '..', 'src-tauri', 'binaries');

// Ensure binaries directory exists
mkdirSync(binariesDir, { recursive: true });

console.log('📦 Building Claude CLI binary with embedded yoga.wasm...');

// Read the original CLI
const cliPath = join(agentBridgeDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
const wasmPath = join(agentBridgeDir, 'node_modules', '@anthropic-ai', 'claude-code', 'yoga.wasm');

console.log('  Reading CLI source...');
const cli = readFileSync(cliPath, 'utf8');

// Read yoga.wasm and convert to base64
console.log('  Embedding yoga.wasm as base64...');
const wasmBuffer = readFileSync(wasmPath);
const wasmBase64 = wasmBuffer.toString('base64');

// Replace the yoga.wasm loading pattern
// Original: await idQ(ndQ(import.meta.url).resolve("./yoga.wasm"))
// New: Buffer.from("base64data","base64")
const patched = cli.replace(
  'await idQ(ndQ(import.meta.url).resolve("./yoga.wasm"))',
  `Buffer.from("${wasmBase64}","base64")`
);

if (patched === cli) {
  console.error('❌ Failed to patch yoga.wasm loading - pattern not found');
  process.exit(1);
}

// Write patched file to temp location
const patchedPath = '/tmp/claude-cli-patched.js';
writeFileSync(patchedPath, patched);
console.log(`  Patched CLI size: ${patched.length} bytes (was ${cli.length})`);

// Compile with Bun
const outputPath = join(binariesDir, 'claude-aarch64-apple-darwin');
console.log('  Compiling with Bun...');

try {
  execSync(`bun build --compile --minify --target=bun-darwin-arm64 ${patchedPath} --outfile ${outputPath}`, {
    stdio: 'inherit',
    cwd: agentBridgeDir
  });
  console.log('✅ Claude CLI binary built successfully');
} catch (error) {
  console.error('❌ Failed to compile Claude CLI:', error.message);
  process.exit(1);
}
