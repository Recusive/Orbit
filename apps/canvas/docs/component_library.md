# Component Library Integration System

## Technical Report for Orbit Canvas

**Version:** 0.1.0  
**Date:** December 2024  
**Status:** Design Phase

---

## Executive Summary

This report details the design for a Component Library Integration system in Orbit Canvas—an Assets panel for React components. The system pre-indexes popular libraries for instant use and supports custom project components.

**Key Decisions:**

- Pre-index 10 libraries based on npm downloads and GitHub stars
- Store component metadata (props, preview, code, variants) for agent use
- Support drag-to-canvas and @mention in chat
- Auto-detect project components from `./orbit/components`

---

## 1. Research: Top 10 Libraries to Pre-Index

Based on npm weekly downloads, GitHub stars, and ecosystem integration:

### Tier 1: Primary Libraries (Must Have)

| Library                 | GitHub Stars | Weekly Downloads | Why Include                                                                                      |
| ----------------------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------------ |
| **shadcn/ui**           | 66k+         | Copy-paste model | De facto standard for modern React; built on Radix + Tailwind; AI-friendly (source code visible) |
| **MUI (Material UI)**   | 93k+         | 3.7M+            | Most comprehensive; Google Material Design; extensive theming                                    |
| **Radix UI Primitives** | 15k+         | 2M+              | Foundation for shadcn/ui; unstyled/accessible; composable                                        |
| **Tailwind CSS**        | 80k+         | 9M+              | Utility-first styling; required by shadcn/ui, NextUI                                             |

### Tier 2: Popular Alternatives

| Library         | GitHub Stars | Weekly Downloads | Why Include                                      |
| --------------- | ------------ | ---------------- | ------------------------------------------------ |
| **Ant Design**  | 83k+         | 1M+              | Enterprise-grade; comprehensive; popular in Asia |
| **Chakra UI**   | 37k+         | 500k+            | Accessible; great DX; composable                 |
| **Mantine**     | 26k+         | 300k+            | 100+ components; 50+ hooks; dark mode            |
| **Headless UI** | 25k+         | 1.8M+            | Tailwind Labs; unstyled; accessible              |

### Tier 3: Icons

| Library          | Icons  | Weekly Downloads | Why Include                                   |
| ---------------- | ------ | ---------------- | --------------------------------------------- |
| **Lucide React** | 1,500+ | 2M+              | Default for shadcn/ui; tree-shakeable; modern |
| **Heroicons**    | 970+   | 1.5M+            | Tailwind team; outline + solid styles         |

### Future Consideration

| Library         | Notes                           |
| --------------- | ------------------------------- |
| NextUI          | Growing fast; Tailwind-based    |
| React Bootstrap | Legacy but still 1.3M downloads |
| Phosphor Icons  | 9,000+ icons; multiple weights  |
| Tabler Icons    | 5,700+ icons                    |

---

## 2. Component Metadata Schema

### What to Index Per Component

```typescript
interface IndexedComponent {
  // Identity
  id: string; // "shadcn-button", "mui-card"
  name: string; // "Button"
  library: LibraryInfo; // Source library

  // Discovery
  category: ComponentCategory; // "input", "layout", "feedback", "navigation"
  tags: string[]; // ["form", "action", "primary"]
  description: string; // "A clickable button element"

  // Usage
  importStatement: string; // "import { Button } from '@/components/ui/button'"
  props: PropDefinition[]; // Typed props with descriptions
  variants: Variant[]; // Different states/styles
  dependencies: string[]; // Required peer deps

  // Preview
  previewCode: string; // Minimal example code
  previewImage?: string; // Static thumbnail (base64 or URL)
  livePreviewable: boolean; // Can render in canvas

  // AI Context
  usageGuidelines: string; // When to use this component
  accessibilityNotes: string; // ARIA considerations
  relatedComponents: string[]; // "Dialog", "Modal", "Popover"
}

interface PropDefinition {
  name: string;
  type: string; // "string", "boolean", "ReactNode", etc.
  required: boolean;
  default?: any;
  description: string;
  options?: string[]; // For union types: ["primary", "secondary"]
}

interface Variant {
  name: string; // "primary", "outline", "ghost"
  props: Record<string, any>; // Props that produce this variant
  previewCode: string;
}

interface LibraryInfo {
  id: string; // "shadcn"
  name: string; // "shadcn/ui"
  version: string; // "latest" or specific
  installCommand: string; // "npx shadcn@latest add button"
  docsUrl: string;
  license: string;
}
```

### Category Taxonomy

```typescript
type ComponentCategory =
  | 'layout' // Container, Grid, Stack, Flex
  | 'navigation' // Navbar, Sidebar, Tabs, Breadcrumb
  | 'input' // Button, Input, Select, Checkbox, Form
  | 'display' // Card, Avatar, Badge, Table
  | 'feedback' // Alert, Toast, Dialog, Progress
  | 'overlay' // Modal, Popover, Tooltip, Dropdown
  | 'media' // Image, Video, Carousel
  | 'data' // Chart, DataTable, List
  | 'icon'; // Individual icons
```

---

## 3. Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Component Library System                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Library Index Store                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │ shadcn  │ │   MUI   │ │  Radix  │ │ Lucide  │ ...    │   │
│  │  │  (50+)  │ │ (100+)  │ │  (25+)  │ │(1500+)  │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Unified Search API                     │   │
│  │  • Full-text search on name, tags, description           │   │
│  │  • Category filtering                                     │   │
│  │  • Library filtering                                      │   │
│  │  • Fuzzy matching                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ Asset Panel │     │  @Mention   │     │    Agent    │       │
│  │  (Drag UI)  │     │   System    │     │   Context   │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Project Components Scanner                     │
│  ./orbit/components/ → Auto-index custom components              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     User Interactions                         │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Drag from    │    │   @Button     │    │  "Add a card  │
│  Asset Panel  │    │   in chat     │    │   component"  │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────┐
│                    Component Resolver                          │
│  1. Search index for matching component                        │
│  2. Fetch full metadata                                        │
│  3. Return code, props, preview                                │
└───────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Insert node   │    │ Provide to    │    │ Agent uses    │
│ with preview  │    │ chat context  │    │ for generation│
└───────────────┘    └───────────────┘    └───────────────┘
```

---

## 4. User Interfaces

### 4.1 Asset Panel

```
┌─────────────────────────────────────┐
│ Components                    ≡  ⚙️  │
├─────────────────────────────────────┤
│ 🔍 Search components...             │
├─────────────────────────────────────┤
│                                     │
│ 📚 LIBRARIES                        │
│ ├─ shadcn/ui             ▼  ☑️      │
│ │  ├─ Button  [====]                │
│ │  ├─ Card    [====]                │
│ │  ├─ Dialog  [====]                │
│ │  └─ Input   [====]                │
│ │                                   │
│ ├─ Lucide Icons          ▼  ☑️      │
│ │  ├─ 🏠 Home                       │
│ │  ├─ ⚙️ Settings                   │
│ │  └─ 👤 User                       │
│ │                                   │
│ └─ MUI                   ▶  ☐       │
│                                     │
│ 📁 PROJECT                          │
│ ├─ ./orbit/components              │
│ │  ├─ Header   [====]              │
│ │  ├─ Footer   [====]              │
│ │  └─ Sidebar  [====]              │
│ │                                   │
│ └─ + Add Component Library...       │
│                                     │
├─────────────────────────────────────┤
│ Recently Used                       │
│ Button • Card • Input • Home Icon   │
└─────────────────────────────────────┘
```

**Interactions:**

- **Drag**: Drag component thumbnail onto canvas → creates node with preview
- **Click**: Opens detail panel with props, variants, code
- **Search**: Fuzzy search across all enabled libraries
- **Enable/Disable**: Toggle libraries on/off per project

### 4.2 Component Detail Panel

```
┌─────────────────────────────────────┐
│ ← Button                   shadcn/ui│
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │        [  Click me  ]           │ │
│ │         Live Preview            │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Variants                            │
│ ┌───────┐ ┌───────┐ ┌───────┐      │
│ │Default│ │Outline│ │ Ghost │      │
│ └───────┘ └───────┘ └───────┘      │
├─────────────────────────────────────┤
│ Props                               │
│ variant: "default" | "outline" |... │
│ size: "default" | "sm" | "lg"       │
│ disabled: boolean                   │
│ asChild: boolean                    │
├─────────────────────────────────────┤
│ Usage                               │
│ ┌─────────────────────────────────┐ │
│ │ import { Button } from          │ │
│ │   "@/components/ui/button"      │ │
│ │                                 │ │
│ │ <Button variant="outline">      │ │
│ │   Click me                      │ │
│ │ </Button>                       │ │
│ └─────────────────────────────────┘ │
│                           [Copy] 📋 │
├─────────────────────────────────────┤
│ [  Add to Canvas  ]  [  Install  ]  │
└─────────────────────────────────────┘
```

### 4.3 @Mention in Chat

```
┌─────────────────────────────────────────────────────────┐
│ Create a form with @Button and @Input                   │
│                    ▲                                    │
│                    │                                    │
│         ┌─────────────────────────┐                    │
│         │ 📦 Button (shadcn/ui)   │                    │
│         │ 📦 ButtonGroup (MUI)    │                    │
│         │ 🏠 Building (Lucide)    │                    │
│         │ 📁 BrandButton (project)│                    │
│         └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

**Autocomplete Logic:**

1. Trigger on `@` character
2. Fuzzy match against all indexed components
3. Show library source for disambiguation
4. Insert component reference in message
5. Agent receives full component metadata in context

---

## 5. Agent Integration

### How Agents Use Component Library

```typescript
interface AgentComponentContext {
  // Available components for this project
  availableLibraries: LibraryInfo[];
  enabledLibraries: string[]; // User's enabled subset

  // Mentioned components in current message
  mentionedComponents: IndexedComponent[];

  // Recently used (for continuity)
  recentlyUsed: string[]; // Component IDs

  // Project's custom components
  projectComponents: IndexedComponent[];
}

// Agent prompt injection
const componentContext = `
## Available Component Libraries
You have access to the following pre-indexed component libraries:
- shadcn/ui: Modern React components (Button, Card, Dialog, etc.)
- Lucide Icons: 1500+ SVG icons
- User's project components in ./orbit/components

## Mentioned Components
The user referenced these specific components:
${mentionedComponents.map((c) => formatComponentForAgent(c)).join('\n')}

## Guidelines
1. Prefer library components over custom generation when available
2. Use exact import paths from component metadata
3. Match the library's styling conventions (e.g., Tailwind for shadcn)
4. Combine multiple library components when appropriate
`;
```

### Agent Decision Flow

```
User: "Create a sign-in form"
                │
                ▼
┌───────────────────────────────────────┐
│ Agent receives ComponentContext       │
│ • shadcn/ui enabled                   │
│ • Lucide enabled                      │
│ • Project has: Header, Footer         │
└───────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│ Agent searches available components   │
│ Query: "form input button card"       │
│                                       │
│ Matches:                              │
│ • shadcn/Card                         │
│ • shadcn/Input                        │
│ • shadcn/Button                       │
│ • shadcn/Label                        │
│ • Lucide/Mail, Lock icons             │
└───────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│ Agent generates using library code    │
│                                       │
│ import { Card } from "@/components/   │
│   ui/card"                            │
│ import { Input } from "@/components/  │
│   ui/input"                           │
│ import { Button } from "@/components/ │
│   ui/button"                          │
│ import { Mail, Lock } from            │
│   "lucide-react"                      │
└───────────────────────────────────────┘
```

### Speed Optimization

Pre-indexed libraries enable faster generation:

| Approach                | Time  | Quality          |
| ----------------------- | ----- | ---------------- |
| Generate from scratch   | 8-15s | Variable         |
| Use library + customize | 3-6s  | Consistent       |
| Exact library match     | 1-3s  | Production-ready |

---

## 6. Project Component Auto-Detection

### Scanner Implementation

```typescript
interface ProjectScanner {
  // Watch for changes in component directory
  watchDirectory: string; // "./orbit/components"

  // Scan and index all components
  scan(): Promise<IndexedComponent[]>;

  // Watch for file changes
  onComponentChange(callback: (change: ComponentChange) => void): void;
}

interface ComponentChange {
  type: 'add' | 'update' | 'delete';
  path: string;
  component?: IndexedComponent;
}

// Scanning logic
async function scanProjectComponents(dir: string): Promise<IndexedComponent[]> {
  const components: IndexedComponent[] = [];

  for (const file of await readDir(dir)) {
    if (!isComponentFile(file)) continue;

    const content = await readFile(file);
    const analysis = analyzeComponent(content);

    components.push({
      id: `project-${analysis.name}`,
      name: analysis.name,
      library: {
        id: 'project',
        name: 'Project Components',
        version: 'local',
        installCommand: '',
        docsUrl: '',
        license: 'proprietary',
      },
      category: inferCategory(analysis),
      tags: analysis.tags,
      description: analysis.docComment || `Custom ${analysis.name} component`,
      importStatement: generateImport(file),
      props: analysis.props,
      variants: analysis.variants,
      dependencies: analysis.imports,
      previewCode: generatePreview(analysis),
      livePreviewable: true,
      usageGuidelines: '',
      accessibilityNotes: '',
      relatedComponents: [],
    });
  }

  return components;
}
```

### Component Analysis

Extract metadata from source code:

```typescript
interface ComponentAnalysis {
  name: string;
  props: PropDefinition[];
  variants: Variant[];
  imports: string[];
  docComment?: string;
  tags: string[];
  hasForwardRef: boolean;
  usesHooks: string[];
}

function analyzeComponent(source: string): ComponentAnalysis {
  // 1. Parse with TypeScript compiler API
  const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest);

  // 2. Extract component name from export
  const componentName = findExportedComponent(ast);

  // 3. Extract props interface
  const propsInterface = findPropsInterface(ast, componentName);
  const props = parsePropsInterface(propsInterface);

  // 4. Find variants from props or separate exports
  const variants = findVariants(ast, props);

  // 5. Extract imports for dependencies
  const imports = extractImports(ast);

  // 6. Get JSDoc comment if present
  const docComment = extractDocComment(ast, componentName);

  // 7. Infer tags from name, imports, props
  const tags = inferTags(componentName, imports, props);

  return {
    name: componentName,
    props,
    variants,
    imports,
    docComment,
    tags,
    hasForwardRef: checkForwardRef(ast),
    usesHooks: findHookUsage(ast),
  };
}
```

---

## 7. Indexing Strategy

### Pre-indexed Library Storage

```typescript
// Stored as static JSON, bundled with Orbit
interface LibraryIndex {
  library: LibraryInfo;
  components: IndexedComponent[];
  lastUpdated: string; // ISO date
  schemaVersion: number;
}

// File structure in Orbit installation
// /resources/component-libraries/
//   ├── shadcn-ui.json       (50+ components)
//   ├── mui.json             (100+ components)
//   ├── radix-primitives.json (25+ primitives)
//   ├── lucide-icons.json    (1500+ icons)
//   ├── heroicons.json       (970+ icons)
//   └── ...
```

### Index Update Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                   Index Update Pipeline                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. CI/CD Job (Weekly)                                       │
│     • Check library npm versions                             │
│     • Scrape updated component docs                          │
│     • Generate new index JSON                                │
│     • Run validation tests                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Bundle with Orbit Release                                │
│     • Include updated indexes in app package                 │
│     • Increment schema version if format changes             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Optional: Hot Update (Future)                            │
│     • Check for index updates on app launch                  │
│     • Download delta updates                                 │
│     • Merge with bundled indexes                             │
└─────────────────────────────────────────────────────────────┘
```

### Scraping Sources

| Library    | Indexing Source              | Method              |
| ---------- | ---------------------------- | ------------------- |
| shadcn/ui  | ui.shadcn.com/docs           | Parse MDX + source  |
| MUI        | mui.com/api/\*               | Parse API docs      |
| Radix      | radix-ui.com/primitives/docs | Parse MDX           |
| Ant Design | ant.design/components        | Parse API tables    |
| Chakra UI  | chakra-ui.com/docs           | Parse MDX           |
| Lucide     | lucide.dev/icons             | Parse icon manifest |
| Heroicons  | heroicons.com                | Parse SVG directory |

---

## 8. Search Implementation

### Unified Search API

```typescript
interface ComponentSearch {
  // Full-text search
  search(query: string, options?: SearchOptions): SearchResult[];

  // Category browse
  browseByCategory(category: ComponentCategory): IndexedComponent[];

  // Get specific component
  getComponent(id: string): IndexedComponent | null;

  // Fuzzy match for @mentions
  autocomplete(partial: string, limit?: number): IndexedComponent[];
}

interface SearchOptions {
  libraries?: string[]; // Filter to specific libraries
  categories?: ComponentCategory[];
  includeIcons?: boolean; // Icons can bloat results
  limit?: number;
}

interface SearchResult {
  component: IndexedComponent;
  score: number; // Relevance score
  matchedFields: string[]; // Which fields matched
}
```

### Search Index Structure

Using a lightweight search library (e.g., Fuse.js, MiniSearch):

```typescript
// Fields indexed for search
const searchableFields = [
  { name: 'name', weight: 2.0 }, // Highest priority
  { name: 'tags', weight: 1.5 },
  { name: 'description', weight: 1.0 },
  { name: 'category', weight: 0.8 },
  { name: 'library.name', weight: 0.5 },
];

// Build search index on app load
function buildSearchIndex(libraries: LibraryIndex[]): SearchIndex {
  const documents = libraries.flatMap((lib) =>
    lib.components.map((c) => ({
      ...c,
      libraryName: lib.library.name,
    }))
  );

  return new MiniSearch({
    fields: searchableFields.map((f) => f.name),
    storeFields: ['id', 'name', 'library', 'category'],
    searchOptions: {
      boost: Object.fromEntries(searchableFields.map((f) => [f.name, f.weight])),
      fuzzy: 0.2,
      prefix: true,
    },
  });
}
```

---

## 9. Implementation Plan

### Phase 1: Core Infrastructure (2-3 weeks)

**Tasks:**

1. Define component metadata schema (TypeScript interfaces)
2. Create static JSON indexes for shadcn/ui and Lucide
3. Implement search API with MiniSearch
4. Build Asset Panel UI component
5. Implement drag-to-canvas for components

**Deliverables:**

- shadcn/ui index (~50 components)
- Lucide index (~1500 icons)
- Functional Asset Panel with drag support

### Phase 2: Agent Integration (2 weeks)

**Tasks:**

1. Build @mention autocomplete in chat
2. Inject component context into agent prompts
3. Add component preference logic (library vs custom)
4. Test agent generation with library components

**Deliverables:**

- @mention system working
- Agents use library components when available
- Measurable speed improvement

### Phase 3: Project Components (2 weeks)

**Tasks:**

1. Implement `./orbit/components` scanner
2. Build TypeScript AST analyzer for props extraction
3. Add file watcher for hot updates
4. Integrate project components into search

**Deliverables:**

- Auto-detection of project components
- Unified search across libraries + project

### Phase 4: Expand Libraries (3-4 weeks)

**Tasks:**

1. Add MUI index
2. Add Radix Primitives index
3. Add Ant Design index
4. Add remaining icon libraries
5. Build CI pipeline for index updates

**Deliverables:**

- 10 libraries fully indexed
- Automated weekly index updates

### Phase 5: Polish (2 weeks)

**Tasks:**

1. Component detail panel with live preview
2. Variant switcher
3. Recently used tracking
4. Library enable/disable per project
5. Manual library addition flow

---

## 10. Open Questions

### Technical

1. **Preview rendering**: How to safely render arbitrary component code?
   - Sandboxed iframe?
   - Static screenshots only?
   - Sandpack integration?

2. **Version compatibility**: shadcn/ui v0 vs v1 syntax differs
   - Index multiple versions?
   - Detect project version and serve matching?

3. **Custom component quality**: Project components may be incomplete
   - Validate before indexing?
   - Flag as "custom" with warnings?

### UX

4. **Icon overload**: 1500+ Lucide icons can overwhelm
   - Show only "popular" subset by default?
   - Require explicit icon search?

5. **Library conflicts**: MUI Button vs shadcn Button
   - Namespace in @mentions: `@shadcn/Button`?
   - Let user set default library?

6. **Installation**: shadcn requires `npx shadcn add button`
   - Run automatically on drag?
   - Prompt user to install?
   - Pre-install all in Orbit projects?

### Future

7. **Design tool integration**: Import design components?
8. **Custom library upload**: Let users add arbitrary npm packages?
9. **AI-generated components**: Save Canvas-generated components to library?

---

## 11. Success Metrics

| Metric                      | Target                              | Measurement                  |
| --------------------------- | ----------------------------------- | ---------------------------- |
| Library component usage     | 60%+ of generated UI uses libraries | Track component origins      |
| Generation speed            | 40% faster with libraries           | Time-to-render comparison    |
| Search relevance            | 90%+ find target in top 5           | User testing                 |
| Project component detection | 95%+ accuracy                       | Validate against manual scan |
| Asset Panel engagement      | 50%+ users use drag feature         | Telemetry                    |

---

## 12. Appendix: Example Index Entries

### shadcn/ui Button

```json
{
  "id": "shadcn-button",
  "name": "Button",
  "library": {
    "id": "shadcn",
    "name": "shadcn/ui",
    "version": "latest",
    "installCommand": "npx shadcn@latest add button",
    "docsUrl": "https://ui.shadcn.com/docs/components/button",
    "license": "MIT"
  },
  "category": "input",
  "tags": ["action", "form", "clickable", "primary", "submit"],
  "description": "Displays a button or a component that looks like a button",
  "importStatement": "import { Button } from \"@/components/ui/button\"",
  "props": [
    {
      "name": "variant",
      "type": "\"default\" | \"destructive\" | \"outline\" | \"secondary\" | \"ghost\" | \"link\"",
      "required": false,
      "default": "default",
      "description": "The visual style variant"
    },
    {
      "name": "size",
      "type": "\"default\" | \"sm\" | \"lg\" | \"icon\"",
      "required": false,
      "default": "default",
      "description": "The size of the button"
    },
    {
      "name": "asChild",
      "type": "boolean",
      "required": false,
      "default": false,
      "description": "Render as child element (for composition)"
    }
  ],
  "variants": [
    {
      "name": "default",
      "props": {},
      "previewCode": "<Button>Default</Button>"
    },
    {
      "name": "outline",
      "props": { "variant": "outline" },
      "previewCode": "<Button variant=\"outline\">Outline</Button>"
    },
    {
      "name": "ghost",
      "props": { "variant": "ghost" },
      "previewCode": "<Button variant=\"ghost\">Ghost</Button>"
    }
  ],
  "dependencies": ["@radix-ui/react-slot", "class-variance-authority"],
  "previewCode": "<Button variant=\"default\">Click me</Button>",
  "livePreviewable": true,
  "usageGuidelines": "Use for primary actions. Use variant='destructive' for dangerous actions.",
  "accessibilityNotes": "Inherits native button accessibility. Use aria-label for icon-only buttons.",
  "relatedComponents": ["shadcn-button-group", "shadcn-toggle"]
}
```

### Lucide Icon

```json
{
  "id": "lucide-home",
  "name": "Home",
  "library": {
    "id": "lucide",
    "name": "Lucide Icons",
    "version": "latest",
    "installCommand": "npm install lucide-react",
    "docsUrl": "https://lucide.dev/icons/home",
    "license": "ISC"
  },
  "category": "icon",
  "tags": ["navigation", "house", "main", "landing"],
  "description": "Home/house icon for navigation",
  "importStatement": "import { Home } from \"lucide-react\"",
  "props": [
    {
      "name": "size",
      "type": "number | string",
      "required": false,
      "default": 24,
      "description": "Icon size in pixels"
    },
    {
      "name": "color",
      "type": "string",
      "required": false,
      "default": "currentColor",
      "description": "Icon stroke color"
    },
    {
      "name": "strokeWidth",
      "type": "number",
      "required": false,
      "default": 2,
      "description": "SVG stroke width"
    }
  ],
  "variants": [],
  "dependencies": [],
  "previewCode": "<Home size={24} />",
  "livePreviewable": true,
  "usageGuidelines": "Use for home/main page navigation links",
  "accessibilityNotes": "Add aria-label when used as standalone clickable element",
  "relatedComponents": ["lucide-house", "lucide-building"]
}
```

---

_Report prepared for Orbit UDE development team_
_Next: Begin Phase 1 implementation_
