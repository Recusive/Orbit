/**
 * Icon mappings for Material Icon Theme
 * Maps file extensions, file names, and folder names to icon files
 */

// File extension to icon filename (without .svg extension)
export const fileExtensionMap: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'typescript',
  tsx: 'react_ts',
  mts: 'typescript',
  cts: 'typescript',
  'd.ts': 'typescript',
  js: 'javascript',
  jsx: 'react',
  mjs: 'javascript',
  cjs: 'javascript',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'css',

  // Data/Config
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  csv: 'document',

  // Documentation
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  txt: 'txt',
  pdf: 'pdf',
  doc: 'document',
  docx: 'document',

  // Programming Languages
  py: 'python',
  pyc: 'python',
  pyw: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  jar: 'java',
  class: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  cs: 'csharp',
  csx: 'csharp',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  rb: 'ruby',
  erb: 'ruby',
  php: 'php',
  swift: 'swift',
  lua: 'lua',

  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'console',
  bat: 'console',
  cmd: 'console',

  // DevOps/Config
  dockerfile: 'docker',
  dockerignore: 'docker',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',

  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  ico: 'image',
  bmp: 'image',
  svg: 'svg',

  // Video/Audio
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',

  // Fonts
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  eot: 'font',

  // Archives
  zip: 'zip',
  tar: 'zip',
  gz: 'zip',
  rar: 'zip',
  '7z': 'zip',

  // Keys/Locks
  pem: 'key',
  key: 'key',
  pub: 'key',
  cer: 'key',
  crt: 'key',

  // Logs
  log: 'log',

  // Config extensions
  ini: 'ini',
  cfg: 'settings',
  conf: 'settings',

  // Frontend Frameworks
  vue: 'vue',
  svelte: 'svelte',
};

// Exact filename to icon filename (without .svg extension)
export const fileNameMap: Record<string, string> = {
  // Package managers
  'package.json': 'nodejs',
  'package-lock.json': 'nodejs',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'bun.lockb': 'bun',
  '.npmrc': 'npm',
  '.yarnrc': 'yarn',
  '.yarnrc.yml': 'yarn',

  // TypeScript
  'tsconfig.json': 'tsconfig',
  'tsconfig.base.json': 'tsconfig',
  'tsconfig.build.json': 'tsconfig',
  'tsconfig.node.json': 'tsconfig',

  // Build tools
  'vite.config.ts': 'vite',
  'vite.config.js': 'vite',
  'vite.config.mts': 'vite',
  'webpack.config.js': 'webpack',
  'webpack.config.ts': 'webpack',

  // Linters/Formatters
  '.eslintrc': 'eslint',
  '.eslintrc.js': 'eslint',
  '.eslintrc.cjs': 'eslint',
  '.eslintrc.json': 'eslint',
  'eslint.config.js': 'eslint',
  'eslint.config.mjs': 'eslint',
  '.prettierrc': 'prettier',
  '.prettierrc.js': 'prettier',
  '.prettierrc.json': 'prettier',
  'prettier.config.js': 'prettier',
  'prettier.config.mjs': 'prettier',
  '.editorconfig': 'editorconfig',

  // Git
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',

  // Docker
  Dockerfile: 'docker',
  dockerfile: 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  '.dockerignore': 'docker',

  // CSS frameworks
  'tailwind.config.js': 'tailwindcss',
  'tailwind.config.ts': 'tailwindcss',
  'tailwind.config.cjs': 'tailwindcss',
  'postcss.config.js': 'css',
  'postcss.config.cjs': 'css',

  // Documentation
  'README.md': 'readme',
  'readme.md': 'readme',
  'README': 'readme',
  'CHANGELOG.md': 'changelog',
  'changelog.md': 'changelog',
  'HISTORY.md': 'changelog',
  LICENSE: 'license',
  'LICENSE.md': 'license',
  'LICENSE.txt': 'license',

  // Environment
  '.env': 'settings',
  '.env.local': 'settings',
  '.env.development': 'settings',
  '.env.production': 'settings',
  '.env.example': 'settings',

  // Make
  Makefile: 'make',
  makefile: 'make',

  // Lock files
  'Gemfile.lock': 'lock',
  'Cargo.lock': 'lock',
  'poetry.lock': 'lock',
  'composer.lock': 'lock',

  // Test files (patterns are handled separately)
};

// Test file patterns - checked after fileNameMap
export const testFilePatterns: { pattern: RegExp; icon: string }[] = [
  { pattern: /\.test\.tsx?$/, icon: 'test-ts' },
  { pattern: /\.spec\.tsx?$/, icon: 'test-ts' },
  { pattern: /\.test\.jsx?$/, icon: 'test-js' },
  { pattern: /\.spec\.jsx?$/, icon: 'test-js' },
];

// Folder name to icon filename (without .svg extension)
// Values are the base name, -open variant is appended for open state
export const folderNameMap: Record<string, string> = {
  // Source
  src: 'folder-src',
  source: 'folder-src',
  sources: 'folder-src',
  code: 'folder-src',

  // Build output
  dist: 'folder-dist',
  build: 'folder-dist',
  out: 'folder-dist',
  output: 'folder-dist',
  release: 'folder-dist',
  bin: 'folder-dist',

  // Dependencies
  node_modules: 'folder-node',

  // Components
  components: 'folder-components',
  component: 'folder-components',
  widgets: 'folder-components',

  // Tests
  test: 'folder-test',
  tests: 'folder-test',
  spec: 'folder-test',
  specs: 'folder-test',
  __tests__: 'folder-test',
  __test__: 'folder-test',
  __snapshots__: 'folder-test',

  // Config
  config: 'folder-config',
  configs: 'folder-config',
  configuration: 'folder-config',
  settings: 'folder-config',

  // Library
  lib: 'folder-lib',
  libs: 'folder-lib',
  library: 'folder-lib',
  vendor: 'folder-lib',
  vendors: 'folder-lib',
  'third-party': 'folder-lib',

  // Public/Static
  public: 'folder-public',
  static: 'folder-public',
  assets: 'folder-public',
  www: 'folder-public',
  web: 'folder-public',

  // API
  api: 'folder-api',
  apis: 'folder-api',
  graphql: 'folder-api',

  // Documentation
  docs: 'folder-docs',
  doc: 'folder-docs',
  documentation: 'folder-docs',

  // Images
  images: 'folder-images',
  image: 'folder-images',
  img: 'folder-images',
  icons: 'folder-images',
  icon: 'folder-images',
  pictures: 'folder-images',
  photos: 'folder-images',

  // GitHub/VSCode
  '.github': 'folder-github',
  '.vscode': 'folder-vscode',

  // Styles
  css: 'folder-css',
  styles: 'folder-css',
  style: 'folder-css',
  scss: 'folder-css',
  sass: 'folder-css',

  // Hooks
  hooks: 'folder-hooks',
  hook: 'folder-hooks',

  // Utils
  utils: 'folder-utils',
  util: 'folder-utils',
  utilities: 'folder-utils',
  helpers: 'folder-utils',
  helper: 'folder-utils',

  // Types
  types: 'folder-types',
  type: 'folder-types',
  typings: 'folder-types',
  '@types': 'folder-types',
};

// Default icons
export const defaultFileIcon = 'document';
export const defaultFolderIcon = 'folder';
export const defaultFolderOpenIcon = 'folder-open';

/**
 * Get the icon name for a file
 */
export function getFileIconName(fileName: string): string {
  // Check exact filename match first
  if (fileNameMap[fileName]) {
    return fileNameMap[fileName];
  }

  // Check lowercase filename
  const lowerName = fileName.toLowerCase();
  if (fileNameMap[lowerName]) {
    return fileNameMap[lowerName];
  }

  // Check test file patterns
  for (const { pattern, icon } of testFilePatterns) {
    if (pattern.test(fileName)) {
      return icon;
    }
  }

  // Get extension
  const parts = fileName.split('.');
  if (parts.length > 1) {
    // Try compound extensions first (e.g., d.ts)
    if (parts.length > 2) {
      const compoundExt = parts.slice(-2).join('.');
      if (fileExtensionMap[compoundExt]) {
        return fileExtensionMap[compoundExt];
      }
    }

    // Try simple extension
    const ext = parts.pop()?.toLowerCase() ?? '';
    if (fileExtensionMap[ext]) {
      return fileExtensionMap[ext];
    }
  }

  return defaultFileIcon;
}

/**
 * Get the icon name for a folder
 */
export function getFolderIconName(folderName: string, isOpen = false): string {
  const lowerName = folderName.toLowerCase();
  const baseIcon = folderNameMap[lowerName] ?? defaultFolderIcon;

  if (isOpen) {
    // Check if -open variant exists in map, otherwise use default open
    if (folderNameMap[lowerName]) {
      return `${baseIcon}-open`;
    }
    return defaultFolderOpenIcon;
  }

  return baseIcon;
}
