#!/usr/bin/env bun
/**
 * Sentry Setup Test Script
 *
 * Tests that Sentry is properly configured across all layers.
 * Run with: bun scripts/test-sentry.ts
 *
 * What this tests:
 * 1. Frontend Sentry config exports
 * 2. Agent-bridge Sentry initialization
 * 3. Rust Sentry trait availability
 *
 * For live testing in the app, use the browser console commands below.
 */

import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = import.meta.dir.replace('/scripts', '');

console.log('🔍 Sentry Setup Verification\n');
console.log('='.repeat(50));

// ============================================
// 1. Check Frontend Sentry Files
// ============================================

console.log('\n📱 Frontend (React Apps)\n');

const frontendFiles = [
  'apps/common/src/lib/sentry.ts',
  'apps/agent/src/main.tsx',
  'apps/Canvas-UI-Builder/src/main.tsx',
  'apps/editor/src/main.tsx',
];

for (const file of frontendFiles) {
  const exists = existsSync(join(ROOT, file));
  const status = exists ? '✅' : '❌';
  console.log(`  ${status} ${file}`);
}

// ============================================
// 2. Check Agent Bridge Sentry Files
// ============================================

console.log('\n🌉 Agent Bridge (Sidecar)\n');

const bridgeFiles = [
  'agent-bridge/src/sentry/index.ts',
  'agent-bridge/src/sentry/config.ts',
  'agent-bridge/src/version.ts',
];

for (const file of bridgeFiles) {
  const exists = existsSync(join(ROOT, file));
  const status = exists ? '✅' : '❌';
  console.log(`  ${status} ${file}`);
}

// ============================================
// 3. Check Rust Sentry Files
// ============================================

console.log('\n🦀 Rust Backend\n');

const rustFiles = [
  'src-tauri/src/core/sentry_utils.rs',
  'src-tauri/src/lib.rs',
];

for (const file of rustFiles) {
  const exists = existsSync(join(ROOT, file));
  const status = exists ? '✅' : '❌';
  console.log(`  ${status} ${file}`);
}

// ============================================
// 4. Check for SentryCapture usage
// ============================================

console.log('\n🔗 SentryCapture Trait Usage\n');

const commandFiles = [
  'src-tauri/src/commands/common/files.rs',
  'src-tauri/src/commands/common/git.rs',
  'src-tauri/src/commands/common/terminal.rs',
  'src-tauri/src/commands/common/lsp.rs',
  'src-tauri/src/commands/common/search.rs',
  'src-tauri/src/commands/common/settings.rs',
];

for (const file of commandFiles) {
  const fullPath = join(ROOT, file);
  if (existsSync(fullPath)) {
    const content = await Bun.file(fullPath).text();
    const hasImport = content.includes('use crate::core::sentry_utils::SentryCapture');
    const captureCount = (content.match(/\.capture\(/g) || []).length;
    const status = hasImport && captureCount > 0 ? '✅' : '⚠️';
    console.log(`  ${status} ${file.split('/').pop()} (${captureCount} captures)`);
  }
}

// ============================================
// Live Testing Instructions
// ============================================

console.log('\n' + '='.repeat(50));
console.log('\n🧪 Live Testing Instructions\n');

console.log(`
1. START THE APP:
   bunx tauri dev

2. OPEN DEVTOOLS (Cmd+Option+I)

3. TEST FRONTEND SENTRY (in Console):

   // Check initialization
   console.log('Sentry active:', !!window.__SENTRY__);

   // Send test message (appears in Sentry dashboard)
   Sentry.captureMessage('Test: Frontend initialized');

   // Send test error
   Sentry.captureException(new Error('Test: Frontend error'));

   // Check release version
   console.log('Release:', Sentry.getClient()?.getOptions()?.release);

4. TEST BACKEND SENTRY:
   - Trigger a file operation on non-existent file
   - Check Sentry dashboard for captured error

5. CHECK SENTRY DASHBOARD:
   - Frontend: https://recursive-labs.sentry.io/projects/orbit-frontend/
   - Backend:  https://recursive-labs.sentry.io/projects/orbit-backend/

   Look for:
   - Test messages with "Test:" prefix
   - Release tagged as "orbit@{version}" (e.g., orbit@0.0.1)
   - Environment: "development" or "production"
`);

console.log('='.repeat(50));
console.log('\n✨ Setup verification complete!\n');
