#!/usr/bin/env bun

import { stat } from 'node:fs/promises';
import path from 'node:path';

interface BinarySpec {
  baseName: string;
  required: boolean;
}

const MIN_BINARY_SIZE_BYTES = 1_000_000;
const BINARY_DIR = path.join(process.cwd(), 'src-tauri', 'binaries');
const BINARY_SPECS: BinarySpec[] = [
  { baseName: 'agent-bridge', required: true },
  { baseName: 'claude', required: true },
];

function parseTargetTriple(): string {
  const platformArgIndex = process.argv.findIndex((arg) => arg === '--platform');
  if (platformArgIndex !== -1) {
    const explicitTriple = process.argv[platformArgIndex + 1];
    if (!explicitTriple) {
      throw new Error('Missing value for --platform');
    }
    return explicitTriple;
  }

  const platform = process.platform;
  if (platform === 'darwin') {
    return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  if (platform === 'win32') {
    return process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  }
  return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

async function isExecutable(binaryPath: string): Promise<boolean> {
  if (process.platform === 'win32') {
    return true;
  }

  const stats = await stat(binaryPath);
  return (stats.mode & 0o111) !== 0;
}

async function verifyBinary(spec: BinarySpec, triple: string): Promise<void> {
  const binaryPath = path.join(BINARY_DIR, `${spec.baseName}-${triple}`);

  try {
    const stats = await stat(binaryPath);
    if (stats.size <= MIN_BINARY_SIZE_BYTES) {
      throw new Error(`size ${String(stats.size)} bytes is below the 1MB sanity threshold`);
    }

    if (!(await isExecutable(binaryPath))) {
      throw new Error('binary is not executable');
    }

    process.stdout.write(`verified ${path.basename(binaryPath)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const line = `${spec.required ? 'ERROR' : 'WARN'} ${path.basename(binaryPath)}: ${message}\n`;

    if (spec.required) {
      process.stderr.write(line);
      throw new Error(`Required binary check failed for ${spec.baseName}`, { cause: error });
    }

    process.stderr.write(line);
  }
}

async function main(): Promise<void> {
  const triple = parseTargetTriple();
  process.stdout.write(`Verifying Tauri binaries for ${triple}\n`);

  for (const spec of BINARY_SPECS) {
    await verifyBinary(spec, triple);
  }
}

await main();
