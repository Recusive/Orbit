/**
 * iconMap Utility Tests
 *
 * Tests for the deterministic icon name mapping functions:
 * - getFileIconName: Maps filenames/extensions to icon names
 * - getFolderIconName: Maps folder names to icon names (open/closed states)
 *
 * These tests verify the MAPPING LOGIC ONLY, not actual SVG file loading
 * (which is handled by Vite with non-deterministic hashed asset names).
 *
 * @see iconMap.ts - Implementation
 */

import {
  defaultFileIcon,
  defaultFolderIcon,
  defaultFolderOpenIcon,
  fileExtensionMap,
  fileNameMap,
  folderNameMap,
  getFileIconName,
  getFolderIconName,
  testFilePatterns,
} from '@/lib/utils/iconMap';

// =============================================================================
// getFileIconName Tests
// =============================================================================

describe('getFileIconName', () => {
  // ===========================================================================
  // Exact Filename Matches
  // ===========================================================================

  describe('exact filename matches', () => {
    it('should match package.json to nodejs icon', () => {
      expect(getFileIconName('package.json')).toBe('nodejs');
    });

    it('should match package-lock.json to nodejs icon', () => {
      expect(getFileIconName('package-lock.json')).toBe('nodejs');
    });

    it('should match tsconfig.json to tsconfig icon', () => {
      expect(getFileIconName('tsconfig.json')).toBe('tsconfig');
    });

    it('should match tsconfig variants', () => {
      expect(getFileIconName('tsconfig.base.json')).toBe('tsconfig');
      expect(getFileIconName('tsconfig.build.json')).toBe('tsconfig');
      expect(getFileIconName('tsconfig.node.json')).toBe('tsconfig');
    });

    it('should match Makefile to make icon', () => {
      expect(getFileIconName('Makefile')).toBe('make');
    });

    it('should match lowercase makefile to make icon', () => {
      expect(getFileIconName('makefile')).toBe('make');
    });

    it('should match Dockerfile variants', () => {
      expect(getFileIconName('Dockerfile')).toBe('docker');
      expect(getFileIconName('dockerfile')).toBe('docker');
      expect(getFileIconName('.dockerignore')).toBe('docker');
    });

    it('should match docker-compose files', () => {
      expect(getFileIconName('docker-compose.yml')).toBe('docker');
      expect(getFileIconName('docker-compose.yaml')).toBe('docker');
    });

    it('should match vite config files', () => {
      expect(getFileIconName('vite.config.ts')).toBe('vite');
      expect(getFileIconName('vite.config.js')).toBe('vite');
      expect(getFileIconName('vite.config.mts')).toBe('vite');
    });

    it('should match eslint config files', () => {
      expect(getFileIconName('.eslintrc')).toBe('eslint');
      expect(getFileIconName('.eslintrc.js')).toBe('eslint');
      expect(getFileIconName('.eslintrc.cjs')).toBe('eslint');
      expect(getFileIconName('.eslintrc.json')).toBe('eslint');
      expect(getFileIconName('eslint.config.js')).toBe('eslint');
      expect(getFileIconName('eslint.config.mjs')).toBe('eslint');
    });

    it('should match prettier config files', () => {
      expect(getFileIconName('.prettierrc')).toBe('prettier');
      expect(getFileIconName('.prettierrc.js')).toBe('prettier');
      expect(getFileIconName('.prettierrc.json')).toBe('prettier');
      expect(getFileIconName('prettier.config.js')).toBe('prettier');
      expect(getFileIconName('prettier.config.mjs')).toBe('prettier');
    });

    it('should match git files', () => {
      expect(getFileIconName('.gitignore')).toBe('git');
      expect(getFileIconName('.gitattributes')).toBe('git');
      expect(getFileIconName('.gitmodules')).toBe('git');
    });

    it('should match documentation files', () => {
      expect(getFileIconName('README.md')).toBe('readme');
      expect(getFileIconName('readme.md')).toBe('readme');
      expect(getFileIconName('README')).toBe('readme');
      expect(getFileIconName('CHANGELOG.md')).toBe('changelog');
      expect(getFileIconName('LICENSE')).toBe('license');
      expect(getFileIconName('LICENSE.md')).toBe('license');
      expect(getFileIconName('LICENSE.txt')).toBe('license');
    });

    it('should match lock files', () => {
      expect(getFileIconName('yarn.lock')).toBe('yarn');
      expect(getFileIconName('pnpm-lock.yaml')).toBe('pnpm');
      expect(getFileIconName('bun.lockb')).toBe('bun');
      expect(getFileIconName('Gemfile.lock')).toBe('lock');
      expect(getFileIconName('Cargo.lock')).toBe('lock');
      expect(getFileIconName('poetry.lock')).toBe('lock');
      expect(getFileIconName('composer.lock')).toBe('lock');
    });

    it('should match env files', () => {
      expect(getFileIconName('.env')).toBe('settings');
      expect(getFileIconName('.env.local')).toBe('settings');
      expect(getFileIconName('.env.development')).toBe('settings');
      expect(getFileIconName('.env.production')).toBe('settings');
      expect(getFileIconName('.env.example')).toBe('settings');
    });

    it('should match tailwind config files', () => {
      expect(getFileIconName('tailwind.config.js')).toBe('tailwindcss');
      expect(getFileIconName('tailwind.config.ts')).toBe('tailwindcss');
      expect(getFileIconName('tailwind.config.cjs')).toBe('tailwindcss');
    });

    it('should match postcss config files', () => {
      expect(getFileIconName('postcss.config.js')).toBe('css');
      expect(getFileIconName('postcss.config.cjs')).toBe('css');
    });

    it('should match webpack config files', () => {
      expect(getFileIconName('webpack.config.js')).toBe('webpack');
      expect(getFileIconName('webpack.config.ts')).toBe('webpack');
    });

    it('should match editor/npm config files', () => {
      expect(getFileIconName('.editorconfig')).toBe('editorconfig');
      expect(getFileIconName('.npmrc')).toBe('npm');
      expect(getFileIconName('.yarnrc')).toBe('yarn');
      expect(getFileIconName('.yarnrc.yml')).toBe('yarn');
    });
  });

  // ===========================================================================
  // Case Insensitivity for Filenames
  // ===========================================================================

  describe('case insensitivity for filenames', () => {
    it('should match lowercase variations of case-sensitive names', () => {
      // README is also matched as readme.md
      expect(getFileIconName('readme.md')).toBe('readme');
    });

    it('should convert filename to lowercase and check map', () => {
      // DOCKERFILE.toLowerCase() = 'dockerfile' which IS in the map
      expect(getFileIconName('DOCKERFILE')).toBe('docker');
    });

    it('should match uppercase README.MD via lowercase filename check', () => {
      // README.MD.toLowerCase() = 'readme.md' which is in fileNameMap
      expect(getFileIconName('README.MD')).toBe('readme');
    });
  });

  // ===========================================================================
  // Test File Patterns
  // ===========================================================================

  describe('test file patterns', () => {
    it('should match .test.ts files to test-ts icon', () => {
      expect(getFileIconName('component.test.ts')).toBe('test-ts');
      expect(getFileIconName('utils.test.ts')).toBe('test-ts');
    });

    it('should match .test.tsx files to test-ts icon', () => {
      expect(getFileIconName('Button.test.tsx')).toBe('test-ts');
      expect(getFileIconName('App.test.tsx')).toBe('test-ts');
    });

    it('should match .spec.ts files to test-ts icon', () => {
      expect(getFileIconName('service.spec.ts')).toBe('test-ts');
    });

    it('should match .spec.tsx files to test-ts icon', () => {
      expect(getFileIconName('Modal.spec.tsx')).toBe('test-ts');
    });

    it('should match .test.js files to test-js icon', () => {
      expect(getFileIconName('legacy.test.js')).toBe('test-js');
    });

    it('should match .test.jsx files to test-js icon', () => {
      expect(getFileIconName('OldComponent.test.jsx')).toBe('test-js');
    });

    it('should match .spec.js files to test-js icon', () => {
      expect(getFileIconName('helper.spec.js')).toBe('test-js');
    });

    it('should match .spec.jsx files to test-js icon', () => {
      expect(getFileIconName('Button.spec.jsx')).toBe('test-js');
    });

    it('should not match partial test patterns', () => {
      // 'test.ts' without the dot prefix should use extension mapping
      expect(getFileIconName('test.ts')).toBe('typescript');
      expect(getFileIconName('mytest.ts')).toBe('typescript');
    });
  });

  // ===========================================================================
  // Compound Extensions
  // ===========================================================================

  describe('compound extensions', () => {
    it('should match .d.ts files to typescript icon', () => {
      expect(getFileIconName('types.d.ts')).toBe('typescript');
      expect(getFileIconName('global.d.ts')).toBe('typescript');
      expect(getFileIconName('vite-env.d.ts')).toBe('typescript');
    });

    it('should prioritize compound extension over simple extension', () => {
      // 'd.ts' is in fileExtensionMap, should be found before 'ts'
      expect(getFileIconName('index.d.ts')).toBe('typescript');
    });
  });

  // ===========================================================================
  // Simple Extension Mapping
  // ===========================================================================

  describe('simple extension mapping', () => {
    describe('TypeScript/JavaScript', () => {
      it('should map .ts to typescript', () => {
        expect(getFileIconName('index.ts')).toBe('typescript');
        expect(getFileIconName('utils.ts')).toBe('typescript');
      });

      it('should map .tsx to react_ts', () => {
        expect(getFileIconName('App.tsx')).toBe('react_ts');
        expect(getFileIconName('Button.tsx')).toBe('react_ts');
      });

      it('should map .mts and .cts to typescript', () => {
        expect(getFileIconName('module.mts')).toBe('typescript');
        expect(getFileIconName('common.cts')).toBe('typescript');
      });

      it('should map .js to javascript', () => {
        expect(getFileIconName('script.js')).toBe('javascript');
      });

      it('should map .jsx to react', () => {
        expect(getFileIconName('Component.jsx')).toBe('react');
      });

      it('should map .mjs and .cjs to javascript', () => {
        expect(getFileIconName('esm.mjs')).toBe('javascript');
        expect(getFileIconName('cjs.cjs')).toBe('javascript');
      });
    });

    describe('Web technologies', () => {
      it('should map HTML extensions', () => {
        expect(getFileIconName('index.html')).toBe('html');
        expect(getFileIconName('page.htm')).toBe('html');
      });

      it('should map CSS extensions', () => {
        expect(getFileIconName('styles.css')).toBe('css');
        expect(getFileIconName('theme.scss')).toBe('scss');
        expect(getFileIconName('variables.sass')).toBe('scss');
        expect(getFileIconName('old.less')).toBe('css');
      });
    });

    describe('Data/Config formats', () => {
      it('should map JSON variants', () => {
        expect(getFileIconName('data.json')).toBe('json');
        expect(getFileIconName('settings.jsonc')).toBe('json');
        expect(getFileIconName('config.json5')).toBe('json');
      });

      it('should map YAML variants', () => {
        expect(getFileIconName('config.yaml')).toBe('yaml');
        expect(getFileIconName('ci.yml')).toBe('yaml');
      });

      it('should map other config formats', () => {
        expect(getFileIconName('config.toml')).toBe('toml');
        expect(getFileIconName('sitemap.xml')).toBe('xml');
        expect(getFileIconName('data.csv')).toBe('document');
      });
    });

    describe('Documentation', () => {
      it('should map markdown extensions', () => {
        expect(getFileIconName('docs.md')).toBe('markdown');
        expect(getFileIconName('guide.markdown')).toBe('markdown');
        expect(getFileIconName('blog.mdx')).toBe('markdown');
      });

      it('should map other doc formats', () => {
        expect(getFileIconName('notes.txt')).toBe('txt');
        expect(getFileIconName('manual.pdf')).toBe('pdf');
        expect(getFileIconName('report.doc')).toBe('document');
        expect(getFileIconName('proposal.docx')).toBe('document');
      });
    });

    describe('Programming languages', () => {
      it('should map Python extensions', () => {
        expect(getFileIconName('app.py')).toBe('python');
        expect(getFileIconName('cache.pyc')).toBe('python');
        expect(getFileIconName('gui.pyw')).toBe('python');
      });

      it('should map Rust extension', () => {
        expect(getFileIconName('main.rs')).toBe('rust');
      });

      it('should map Go extension', () => {
        expect(getFileIconName('server.go')).toBe('go');
      });

      it('should map Java extensions', () => {
        expect(getFileIconName('Main.java')).toBe('java');
        expect(getFileIconName('lib.jar')).toBe('java');
        expect(getFileIconName('App.class')).toBe('java');
      });

      it('should map Kotlin extensions', () => {
        expect(getFileIconName('App.kt')).toBe('kotlin');
        expect(getFileIconName('build.gradle.kts')).toBe('kotlin');
      });

      it('should map C# extensions', () => {
        expect(getFileIconName('Program.cs')).toBe('csharp');
        expect(getFileIconName('script.csx')).toBe('csharp');
      });

      it('should map C/C++ extensions', () => {
        expect(getFileIconName('main.c')).toBe('c');
        expect(getFileIconName('header.h')).toBe('c');
        expect(getFileIconName('app.cpp')).toBe('cpp');
        expect(getFileIconName('alt.cc')).toBe('cpp');
        expect(getFileIconName('other.cxx')).toBe('cpp');
        expect(getFileIconName('types.hpp')).toBe('cpp');
        expect(getFileIconName('defs.hxx')).toBe('cpp');
      });

      it('should map Ruby extensions', () => {
        expect(getFileIconName('app.rb')).toBe('ruby');
        expect(getFileIconName('template.erb')).toBe('ruby');
      });

      it('should map PHP extension', () => {
        expect(getFileIconName('index.php')).toBe('php');
      });

      it('should map Swift extension', () => {
        expect(getFileIconName('ViewController.swift')).toBe('swift');
      });

      it('should map Lua extension', () => {
        expect(getFileIconName('config.lua')).toBe('lua');
      });
    });

    describe('Shell/Console', () => {
      it('should map shell extensions', () => {
        expect(getFileIconName('script.sh')).toBe('shell');
        expect(getFileIconName('init.bash')).toBe('shell');
        expect(getFileIconName('config.zsh')).toBe('shell');
        expect(getFileIconName('functions.fish')).toBe('shell');
      });

      it('should map console extensions', () => {
        expect(getFileIconName('script.ps1')).toBe('console');
        expect(getFileIconName('build.bat')).toBe('console');
        expect(getFileIconName('run.cmd')).toBe('console');
      });
    });

    describe('DevOps/Database', () => {
      it('should map SQL extension', () => {
        expect(getFileIconName('query.sql')).toBe('sql');
      });

      it('should map GraphQL extensions', () => {
        expect(getFileIconName('schema.graphql')).toBe('graphql');
        expect(getFileIconName('queries.gql')).toBe('graphql');
      });
    });

    describe('Media files', () => {
      it('should map image extensions', () => {
        expect(getFileIconName('logo.png')).toBe('image');
        expect(getFileIconName('photo.jpg')).toBe('image');
        expect(getFileIconName('pic.jpeg')).toBe('image');
        expect(getFileIconName('anim.gif')).toBe('image');
        expect(getFileIconName('hero.webp')).toBe('image');
        expect(getFileIconName('favicon.ico')).toBe('image');
        expect(getFileIconName('bitmap.bmp')).toBe('image');
      });

      it('should map SVG separately from images', () => {
        expect(getFileIconName('icon.svg')).toBe('svg');
      });

      it('should map video extensions', () => {
        expect(getFileIconName('video.mp4')).toBe('video');
        expect(getFileIconName('clip.mov')).toBe('video');
        expect(getFileIconName('movie.avi')).toBe('video');
        expect(getFileIconName('film.mkv')).toBe('video');
        expect(getFileIconName('stream.webm')).toBe('video');
      });

      it('should map audio extensions', () => {
        expect(getFileIconName('song.mp3')).toBe('audio');
        expect(getFileIconName('sound.wav')).toBe('audio');
        expect(getFileIconName('music.flac')).toBe('audio');
        expect(getFileIconName('track.ogg')).toBe('audio');
      });
    });

    describe('Fonts', () => {
      it('should map font extensions', () => {
        expect(getFileIconName('font.ttf')).toBe('font');
        expect(getFileIconName('type.otf')).toBe('font');
        expect(getFileIconName('web.woff')).toBe('font');
        expect(getFileIconName('modern.woff2')).toBe('font');
        expect(getFileIconName('legacy.eot')).toBe('font');
      });
    });

    describe('Archives', () => {
      it('should map archive extensions', () => {
        expect(getFileIconName('files.zip')).toBe('zip');
        expect(getFileIconName('backup.tar')).toBe('zip');
        expect(getFileIconName('compressed.gz')).toBe('zip');
        expect(getFileIconName('archive.rar')).toBe('zip');
        expect(getFileIconName('pack.7z')).toBe('zip');
      });
    });

    describe('Security/Keys', () => {
      it('should map key extensions', () => {
        expect(getFileIconName('cert.pem')).toBe('key');
        expect(getFileIconName('private.key')).toBe('key');
        expect(getFileIconName('id_rsa.pub')).toBe('key');
        expect(getFileIconName('ssl.cer')).toBe('key');
        expect(getFileIconName('certificate.crt')).toBe('key');
      });
    });

    describe('Logs and Config', () => {
      it('should map log extension', () => {
        expect(getFileIconName('app.log')).toBe('log');
      });

      it('should map config extensions', () => {
        expect(getFileIconName('settings.ini')).toBe('ini');
        expect(getFileIconName('app.cfg')).toBe('settings');
        expect(getFileIconName('server.conf')).toBe('settings');
      });
    });

    describe('Frontend frameworks', () => {
      it('should map Vue extension', () => {
        expect(getFileIconName('App.vue')).toBe('vue');
      });

      it('should map Svelte extension', () => {
        expect(getFileIconName('Component.svelte')).toBe('svelte');
      });
    });
  });

  // ===========================================================================
  // Case Insensitivity for Extensions
  // ===========================================================================

  describe('case insensitivity for extensions', () => {
    it('should match uppercase extensions', () => {
      // Note: README.MD matches 'readme.md' in fileNameMap first, not extension
      // Use files that aren't in fileNameMap to test extension case insensitivity
      expect(getFileIconName('data.JSON')).toBe('json');
      expect(getFileIconName('photo.PNG')).toBe('image');
      expect(getFileIconName('document.MD')).toBe('markdown');
    });

    it('should match mixed case extensions', () => {
      expect(getFileIconName('app.Ts')).toBe('typescript');
      expect(getFileIconName('style.Css')).toBe('css');
    });
  });

  // ===========================================================================
  // Fallback Behavior
  // ===========================================================================

  describe('fallback behavior', () => {
    it('should return default icon for unknown extension', () => {
      expect(getFileIconName('file.xyz')).toBe(defaultFileIcon);
      expect(getFileIconName('data.unknown')).toBe(defaultFileIcon);
      expect(getFileIconName('random.ext123')).toBe(defaultFileIcon);
    });

    it('should return default icon for empty filename', () => {
      expect(getFileIconName('')).toBe(defaultFileIcon);
    });

    it('should return default icon for filename without extension', () => {
      expect(getFileIconName('Procfile')).toBe(defaultFileIcon);
      expect(getFileIconName('CODEOWNERS')).toBe(defaultFileIcon);
    });

    it('should return default icon for dotfile without recognized name', () => {
      expect(getFileIconName('.hidden')).toBe(defaultFileIcon);
      expect(getFileIconName('.secret')).toBe(defaultFileIcon);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle multiple dots in filename', () => {
      expect(getFileIconName('app.config.ts')).toBe('typescript');
      expect(getFileIconName('data.backup.json')).toBe('json');
    });

    it('should handle very long filenames', () => {
      const longName = 'a'.repeat(200) + '.ts';
      expect(getFileIconName(longName)).toBe('typescript');
    });

    it('should handle special characters in filename', () => {
      expect(getFileIconName('my-file.ts')).toBe('typescript');
      expect(getFileIconName('my_file.ts')).toBe('typescript');
      expect(getFileIconName('my file.ts')).toBe('typescript');
      expect(getFileIconName('file@2x.png')).toBe('image');
    });

    it('should handle numeric filenames', () => {
      expect(getFileIconName('123.ts')).toBe('typescript');
      expect(getFileIconName('404.html')).toBe('html');
    });
  });
});

// =============================================================================
// getFolderIconName Tests
// =============================================================================

describe('getFolderIconName', () => {
  // ===========================================================================
  // Known Folders (Closed State)
  // ===========================================================================

  describe('known folders (closed state)', () => {
    it('should map src folder variants', () => {
      expect(getFolderIconName('src')).toBe('folder-src');
      expect(getFolderIconName('source')).toBe('folder-src');
      expect(getFolderIconName('sources')).toBe('folder-src');
      expect(getFolderIconName('code')).toBe('folder-src');
    });

    it('should map build/dist folders', () => {
      expect(getFolderIconName('dist')).toBe('folder-dist');
      expect(getFolderIconName('build')).toBe('folder-dist');
      expect(getFolderIconName('out')).toBe('folder-dist');
      expect(getFolderIconName('output')).toBe('folder-dist');
      expect(getFolderIconName('release')).toBe('folder-dist');
      expect(getFolderIconName('bin')).toBe('folder-dist');
    });

    it('should map node_modules folder', () => {
      expect(getFolderIconName('node_modules')).toBe('folder-node');
    });

    it('should map component folders', () => {
      expect(getFolderIconName('components')).toBe('folder-components');
      expect(getFolderIconName('component')).toBe('folder-components');
      expect(getFolderIconName('widgets')).toBe('folder-components');
    });

    it('should map test folders', () => {
      expect(getFolderIconName('test')).toBe('folder-test');
      expect(getFolderIconName('tests')).toBe('folder-test');
      expect(getFolderIconName('spec')).toBe('folder-test');
      expect(getFolderIconName('specs')).toBe('folder-test');
      expect(getFolderIconName('__tests__')).toBe('folder-test');
      expect(getFolderIconName('__test__')).toBe('folder-test');
      expect(getFolderIconName('__snapshots__')).toBe('folder-test');
    });

    it('should map config folders', () => {
      expect(getFolderIconName('config')).toBe('folder-config');
      expect(getFolderIconName('configs')).toBe('folder-config');
      expect(getFolderIconName('configuration')).toBe('folder-config');
      expect(getFolderIconName('settings')).toBe('folder-config');
    });

    it('should map lib folders', () => {
      expect(getFolderIconName('lib')).toBe('folder-lib');
      expect(getFolderIconName('libs')).toBe('folder-lib');
      expect(getFolderIconName('library')).toBe('folder-lib');
      expect(getFolderIconName('vendor')).toBe('folder-lib');
      expect(getFolderIconName('vendors')).toBe('folder-lib');
      expect(getFolderIconName('third-party')).toBe('folder-lib');
    });

    it('should map public/static folders', () => {
      expect(getFolderIconName('public')).toBe('folder-public');
      expect(getFolderIconName('static')).toBe('folder-public');
      expect(getFolderIconName('assets')).toBe('folder-public');
      expect(getFolderIconName('www')).toBe('folder-public');
      expect(getFolderIconName('web')).toBe('folder-public');
    });

    it('should map API folders', () => {
      expect(getFolderIconName('api')).toBe('folder-api');
      expect(getFolderIconName('apis')).toBe('folder-api');
      expect(getFolderIconName('graphql')).toBe('folder-api');
    });

    it('should map documentation folders', () => {
      expect(getFolderIconName('docs')).toBe('folder-docs');
      expect(getFolderIconName('doc')).toBe('folder-docs');
      expect(getFolderIconName('documentation')).toBe('folder-docs');
    });

    it('should map image folders', () => {
      expect(getFolderIconName('images')).toBe('folder-images');
      expect(getFolderIconName('image')).toBe('folder-images');
      expect(getFolderIconName('img')).toBe('folder-images');
      expect(getFolderIconName('icons')).toBe('folder-images');
      expect(getFolderIconName('icon')).toBe('folder-images');
      expect(getFolderIconName('pictures')).toBe('folder-images');
      expect(getFolderIconName('photos')).toBe('folder-images');
    });

    it('should map GitHub/VSCode folders', () => {
      expect(getFolderIconName('.github')).toBe('folder-github');
      expect(getFolderIconName('.vscode')).toBe('folder-vscode');
    });

    it('should map style folders', () => {
      expect(getFolderIconName('css')).toBe('folder-css');
      expect(getFolderIconName('styles')).toBe('folder-css');
      expect(getFolderIconName('style')).toBe('folder-css');
      expect(getFolderIconName('scss')).toBe('folder-css');
      expect(getFolderIconName('sass')).toBe('folder-css');
    });

    it('should map hooks folder', () => {
      expect(getFolderIconName('hooks')).toBe('folder-hooks');
      expect(getFolderIconName('hook')).toBe('folder-hooks');
    });

    it('should map utils folders', () => {
      expect(getFolderIconName('utils')).toBe('folder-utils');
      expect(getFolderIconName('util')).toBe('folder-utils');
      expect(getFolderIconName('utilities')).toBe('folder-utils');
      expect(getFolderIconName('helpers')).toBe('folder-utils');
      expect(getFolderIconName('helper')).toBe('folder-utils');
    });

    it('should map types folders', () => {
      expect(getFolderIconName('types')).toBe('folder-types');
      expect(getFolderIconName('type')).toBe('folder-types');
      expect(getFolderIconName('typings')).toBe('folder-types');
      expect(getFolderIconName('@types')).toBe('folder-types');
    });
  });

  // ===========================================================================
  // Known Folders (Open State)
  // ===========================================================================

  describe('known folders (open state)', () => {
    it('should append -open suffix for known folders when open', () => {
      expect(getFolderIconName('src', true)).toBe('folder-src-open');
      expect(getFolderIconName('components', true)).toBe('folder-components-open');
      expect(getFolderIconName('node_modules', true)).toBe('folder-node-open');
      expect(getFolderIconName('test', true)).toBe('folder-test-open');
      expect(getFolderIconName('lib', true)).toBe('folder-lib-open');
    });

    it('should return -open variant for all folder types', () => {
      expect(getFolderIconName('dist', true)).toBe('folder-dist-open');
      expect(getFolderIconName('config', true)).toBe('folder-config-open');
      expect(getFolderIconName('public', true)).toBe('folder-public-open');
      expect(getFolderIconName('api', true)).toBe('folder-api-open');
      expect(getFolderIconName('docs', true)).toBe('folder-docs-open');
      expect(getFolderIconName('images', true)).toBe('folder-images-open');
      expect(getFolderIconName('.github', true)).toBe('folder-github-open');
      expect(getFolderIconName('.vscode', true)).toBe('folder-vscode-open');
      expect(getFolderIconName('styles', true)).toBe('folder-css-open');
      expect(getFolderIconName('hooks', true)).toBe('folder-hooks-open');
      expect(getFolderIconName('utils', true)).toBe('folder-utils-open');
      expect(getFolderIconName('types', true)).toBe('folder-types-open');
    });
  });

  // ===========================================================================
  // Case Insensitivity
  // ===========================================================================

  describe('case insensitivity', () => {
    it('should match uppercase folder names', () => {
      expect(getFolderIconName('SRC')).toBe('folder-src');
      expect(getFolderIconName('COMPONENTS')).toBe('folder-components');
      expect(getFolderIconName('NODE_MODULES')).toBe('folder-node');
    });

    it('should match mixed case folder names', () => {
      expect(getFolderIconName('Src')).toBe('folder-src');
      expect(getFolderIconName('Components')).toBe('folder-components');
      expect(getFolderIconName('Node_Modules')).toBe('folder-node');
    });

    it('should match uppercase folder names when open', () => {
      expect(getFolderIconName('SRC', true)).toBe('folder-src-open');
      expect(getFolderIconName('COMPONENTS', true)).toBe('folder-components-open');
    });
  });

  // ===========================================================================
  // Fallback Behavior
  // ===========================================================================

  describe('fallback behavior', () => {
    it('should return default folder icon for unknown folders', () => {
      expect(getFolderIconName('random')).toBe(defaultFolderIcon);
      expect(getFolderIconName('myfolder')).toBe(defaultFolderIcon);
      expect(getFolderIconName('data')).toBe(defaultFolderIcon);
    });

    it('should return default open folder icon for unknown folders when open', () => {
      expect(getFolderIconName('random', true)).toBe(defaultFolderOpenIcon);
      expect(getFolderIconName('myfolder', true)).toBe(defaultFolderOpenIcon);
      expect(getFolderIconName('data', true)).toBe(defaultFolderOpenIcon);
    });

    it('should return default icon for empty folder name', () => {
      expect(getFolderIconName('')).toBe(defaultFolderIcon);
      expect(getFolderIconName('', true)).toBe(defaultFolderOpenIcon);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle folder names with special characters', () => {
      // These won't match any known folders, so default
      expect(getFolderIconName('my-folder')).toBe(defaultFolderIcon);
      expect(getFolderIconName('my_folder')).toBe(defaultFolderIcon);
    });

    it('should handle numeric folder names', () => {
      expect(getFolderIconName('123')).toBe(defaultFolderIcon);
      expect(getFolderIconName('v1')).toBe(defaultFolderIcon);
    });

    it('should handle very long folder names', () => {
      const longName = 'a'.repeat(200);
      expect(getFolderIconName(longName)).toBe(defaultFolderIcon);
    });

    it('should correctly handle third-party folder (hyphenated)', () => {
      expect(getFolderIconName('third-party')).toBe('folder-lib');
      expect(getFolderIconName('third-party', true)).toBe('folder-lib-open');
    });
  });
});

// =============================================================================
// Exported Constants Tests
// =============================================================================

describe('exported constants', () => {
  describe('default icons', () => {
    it('should have correct default file icon', () => {
      expect(defaultFileIcon).toBe('document');
    });

    it('should have correct default folder icon', () => {
      expect(defaultFolderIcon).toBe('folder');
    });

    it('should have correct default folder open icon', () => {
      expect(defaultFolderOpenIcon).toBe('folder-open');
    });
  });

  describe('fileExtensionMap', () => {
    it('should be a non-empty object', () => {
      expect(typeof fileExtensionMap).toBe('object');
      expect(Object.keys(fileExtensionMap).length).toBeGreaterThan(0);
    });

    it('should contain common extensions', () => {
      expect(fileExtensionMap).toHaveProperty('ts');
      expect(fileExtensionMap).toHaveProperty('js');
      expect(fileExtensionMap).toHaveProperty('json');
      expect(fileExtensionMap).toHaveProperty('md');
    });
  });

  describe('fileNameMap', () => {
    it('should be a non-empty object', () => {
      expect(typeof fileNameMap).toBe('object');
      expect(Object.keys(fileNameMap).length).toBeGreaterThan(0);
    });

    it('should contain common filenames', () => {
      expect(fileNameMap).toHaveProperty('package.json');
      expect(fileNameMap).toHaveProperty('tsconfig.json');
      expect(fileNameMap).toHaveProperty('.gitignore');
    });
  });

  describe('folderNameMap', () => {
    it('should be a non-empty object', () => {
      expect(typeof folderNameMap).toBe('object');
      expect(Object.keys(folderNameMap).length).toBeGreaterThan(0);
    });

    it('should contain common folder names', () => {
      expect(folderNameMap).toHaveProperty('src');
      expect(folderNameMap).toHaveProperty('node_modules');
      expect(folderNameMap).toHaveProperty('components');
    });
  });

  describe('testFilePatterns', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(testFilePatterns)).toBe(true);
      expect(testFilePatterns.length).toBeGreaterThan(0);
    });

    it('should contain RegExp patterns', () => {
      for (const item of testFilePatterns) {
        expect(item).toHaveProperty('pattern');
        expect(item).toHaveProperty('icon');
        expect(item.pattern).toBeInstanceOf(RegExp);
        expect(typeof item.icon).toBe('string');
      }
    });
  });
});
