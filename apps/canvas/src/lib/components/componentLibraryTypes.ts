/**
 * Component Library Types
 *
 * Types for the multi-library component indexing system.
 * Supports pre-indexed libraries (shadcn/ui, Lucide, MUI, etc.)
 * and project-specific components.
 */

/**
 * Component categories for organization and filtering
 */
export type ComponentCategory =
  | 'layout'
  | 'navigation'
  | 'input'
  | 'display'
  | 'feedback'
  | 'overlay'
  | 'media'
  | 'data'
  | 'icon';

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  layout: 'Layout',
  navigation: 'Navigation',
  input: 'Input',
  display: 'Display',
  feedback: 'Feedback',
  overlay: 'Overlay',
  media: 'Media',
  data: 'Data',
  icon: 'Icons',
};

/**
 * Information about a component library source
 */
export interface LibraryInfo {
  id: string;
  name: string;
  version: string;
  installCommand: string;
  docsUrl: string;
  license: string;
  icon?: string;
}

/**
 * Component prop definition
 */
export interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description: string;
  options?: string[];
}

/**
 * A visual variant of a component
 */
export interface ComponentVariant {
  name: string;
  props: Record<string, unknown>;
  previewCode: string;
}

/**
 * Complete indexed component metadata
 */
export interface IndexedComponent {
  id: string;
  name: string;
  library: LibraryInfo;
  category: ComponentCategory;
  tags: string[];
  description: string;
  importStatement: string;
  code: string;
  props: PropDefinition[];
  variants: ComponentVariant[];
  dependencies: string[];
  previewCode: string;
  livePreviewable: boolean;
  usageGuidelines: string;
  accessibilityNotes: string;
  relatedComponents: string[];
}

/**
 * Library index containing all components
 */
export interface LibraryIndex {
  library: LibraryInfo;
  components: IndexedComponent[];
  lastUpdated: string;
  schemaVersion: number;
}

/**
 * Search result with scoring
 */
export interface ComponentSearchResult {
  component: IndexedComponent;
  score: number;
  matchedFields: string[];
}

/**
 * Search options
 */
export interface ComponentSearchOptions {
  libraries?: string[];
  categories?: ComponentCategory[];
  includeIcons?: boolean;
  limit?: number;
}

export const LIBRARY_SCHEMA_VERSION = 1;

export const LIBRARY_INFO: Record<string, LibraryInfo> = {
  shadcn: {
    id: 'shadcn',
    name: 'shadcn/ui',
    version: 'latest',
    installCommand: 'npx shadcn@latest add',
    docsUrl: 'https://ui.shadcn.com/docs',
    license: 'MIT',
  },
  lucide: {
    id: 'lucide',
    name: 'Lucide Icons',
    version: 'latest',
    installCommand: 'npm install lucide-react',
    docsUrl: 'https://lucide.dev/icons',
    license: 'ISC',
  },
  radix: {
    id: 'radix',
    name: 'Radix UI',
    version: 'latest',
    installCommand: 'npm install @radix-ui/react-',
    docsUrl: 'https://radix-ui.com/primitives/docs',
    license: 'MIT',
  },
  headless: {
    id: 'headless',
    name: 'Headless UI',
    version: 'latest',
    installCommand: 'npm install @headlessui/react',
    docsUrl: 'https://headlessui.com',
    license: 'MIT',
  },
  project: {
    id: 'project',
    name: 'Project Components',
    version: 'local',
    installCommand: '',
    docsUrl: '',
    license: 'proprietary',
  },
};
