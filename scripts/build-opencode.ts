#!/usr/bin/env bun

import fs from 'node:fs/promises';
import path from 'node:path';

interface ModelsApiModel {
  id?: string;
  name?: string;
  reasoning?: boolean;
  attachment?: boolean;
  status?: string;
}

interface ModelsApiProvider {
  id?: string;
  name?: string;
  env?: string[];
  api?: string;
  npm?: string;
  models?: Record<string, ModelsApiModel>;
}

type ModelsApiSnapshot = Record<string, ModelsApiProvider>;

interface ProviderCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly env: string[];
  readonly modelCount: number;
  readonly api?: string;
  readonly npm?: string;
  readonly featuredModels: readonly {
    readonly id: string;
    readonly name: string;
    readonly reasoning: boolean;
    readonly attachment: boolean;
    readonly status?: string;
  }[];
}

interface ProviderCatalogFile {
  readonly version: 1;
  readonly sourceSnapshot: string;
  readonly providerCount: number;
  readonly providers: readonly ProviderCatalogEntry[];
}

const ROOT_DIR = path.resolve(import.meta.dir, '..');
const OPENCODE_DIR = path.join(ROOT_DIR, 'Agent-backend', 'packages', 'opencode');
const TAURI_BIN_DIR = path.join(ROOT_DIR, 'src-tauri', 'binaries');
const CACHE_DIR = path.join(ROOT_DIR, 'scripts', 'opencode-models-cache');
const CACHE_API_PATH = path.join(CACHE_DIR, 'api.json');
const BOOTSTRAP_API_PATH = path.join(CACHE_DIR, 'bootstrap-api.json');
const PROVIDER_CATALOG_PATH = path.join(
  ROOT_DIR,
  'apps',
  'agent',
  'src',
  'data',
  'opencode-providers.json'
);
const MODELS_DEV_URL = 'https://models.dev/api.json';
const FEATURED_MODEL_LIMIT = 8;

function targetTriple(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;

  if (!arch) {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  if (process.platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }

  if (process.platform === 'linux') {
    return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }

  if (process.platform === 'win32') {
    return arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  }

  throw new Error(`Unsupported platform/arch: ${process.platform}/${process.arch}`);
}

function opencodeDistDir(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
  const platform =
    process.platform === 'darwin'
      ? 'darwin'
      : process.platform === 'linux'
        ? 'linux'
        : process.platform === 'win32'
          ? 'windows'
          : null;

  if (!platform) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  if (!arch) {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  return path.join(OPENCODE_DIR, 'dist', `opencode-${platform}-${arch}`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchModelsSnapshot(): Promise<string> {
  const response = await fetch(MODELS_DEV_URL);
  if (!response.ok) {
    throw new Error(`models.dev request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function resolveSnapshotPath(withModels: boolean): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  if (withModels) {
    try {
      const fetched = await fetchModelsSnapshot();
      await fs.writeFile(CACHE_API_PATH, fetched);
      return CACHE_API_PATH;
    } catch (error) {
      if (await pathExists(CACHE_API_PATH)) {
        console.warn(
          `OpenCode models fetch failed, using cached snapshot: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return CACHE_API_PATH;
      }

      if (await pathExists(BOOTSTRAP_API_PATH)) {
        console.warn(
          `OpenCode models fetch failed, using bootstrap snapshot: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return BOOTSTRAP_API_PATH;
      }

      throw error;
    }
  }

  if (await pathExists(CACHE_API_PATH)) {
    return CACHE_API_PATH;
  }

  if (await pathExists(BOOTSTRAP_API_PATH)) {
    return BOOTSTRAP_API_PATH;
  }

  throw new Error(
    'No cached or bootstrap provider snapshot found. Run `bun run build:opencode:full` first.'
  );
}

function buildProviderCatalog(
  snapshot: ModelsApiSnapshot,
  sourceSnapshot: string
): ProviderCatalogFile {
  const providers = Object.entries(snapshot)
    .map(([providerId, provider]) => {
      const providerName = provider.name?.trim() || providerId;
      const models = Object.entries(provider.models ?? {})
        .map(([modelId, model]) => ({
          id: model.id?.trim() || modelId,
          name: model.name?.trim() || modelId,
          reasoning: model.reasoning === true,
          attachment: model.attachment === true,
          ...(typeof model.status === 'string' ? { status: model.status } : {}),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'en'));

      return {
        id: provider.id?.trim() || providerId,
        name: providerName,
        env: [...(provider.env ?? [])].sort((left, right) => left.localeCompare(right, 'en')),
        modelCount: models.length,
        ...(typeof provider.api === 'string' && provider.api.length > 0
          ? { api: provider.api }
          : {}),
        ...(typeof provider.npm === 'string' && provider.npm.length > 0
          ? { npm: provider.npm }
          : {}),
        featuredModels: models.slice(0, FEATURED_MODEL_LIMIT),
      } satisfies ProviderCatalogEntry;
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));

  return {
    version: 1,
    sourceSnapshot: path.relative(ROOT_DIR, sourceSnapshot),
    providerCount: providers.length,
    providers,
  };
}

async function writeProviderCatalog(snapshotPath: string): Promise<void> {
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const parsed = JSON.parse(raw) as ModelsApiSnapshot;
  const catalog = buildProviderCatalog(parsed, snapshotPath);

  await fs.mkdir(path.dirname(PROVIDER_CATALOG_PATH), { recursive: true });
  await fs.writeFile(PROVIDER_CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

async function runOpenCodeBuild(snapshotPath: string): Promise<void> {
  const normalizedSnapshotPath = path.join(CACHE_DIR, 'normalized-api.json');
  const normalizedSnapshot = (await fs.readFile(snapshotPath, 'utf8')).trim();
  await fs.writeFile(normalizedSnapshotPath, normalizedSnapshot);

  const build = Bun.spawn({
    cmd: ['bun', './script/build.ts', '--single'],
    cwd: OPENCODE_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      MODELS_DEV_API_JSON: normalizedSnapshotPath,
      OPENCODE_CHANNEL: process.env.OPENCODE_CHANNEL ?? 'latest',
    },
  });

  const exitCode = await build.exited;
  if (exitCode !== 0) {
    throw new Error(`OpenCode build failed with exit code ${exitCode}`);
  }
}

async function copyBinary(): Promise<void> {
  const distDir = opencodeDistDir();
  const binaryName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  const sourceBinary = path.join(distDir, 'bin', binaryName);
  const destinationBaseName = `orbit-server-${targetTriple()}`;
  const destinationBinary = path.join(
    TAURI_BIN_DIR,
    `${destinationBaseName}${process.platform === 'win32' ? '.exe' : ''}`
  );

  if (!(await pathExists(sourceBinary))) {
    throw new Error(`OpenCode binary not found at ${sourceBinary}`);
  }

  await fs.mkdir(TAURI_BIN_DIR, { recursive: true });
  await fs.copyFile(sourceBinary, destinationBinary);
  if (process.platform !== 'win32') {
    await fs.chmod(destinationBinary, 0o755);
  }
}

async function main(): Promise<void> {
  const withModels = process.argv.includes('--with-models');
  const snapshotPath = await resolveSnapshotPath(withModels);

  await writeProviderCatalog(snapshotPath);
  await runOpenCodeBuild(snapshotPath);
  await copyBinary();

  console.log(`OpenCode build complete using snapshot: ${path.relative(ROOT_DIR, snapshotPath)}`);
}

await main();
