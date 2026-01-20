/**
 * Design Tokens Store
 *
 * Manages saved component customizations as design tokens.
 * Tokens can be exported for AI agents or saved locally.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ============================================
// Types
// ============================================

/**
 * Design token - saved customization
 *
 * Note: Properties are intentionally not readonly to support immer middleware
 */
export interface DesignToken {
  id: string;
  name: string;
  componentName: string;
  customizations: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

interface DesignTokensState {
  /** Saved design tokens */
  tokens: DesignToken[];
  /** Currently selected token for editing */
  selectedTokenId: string | null;
}

interface DesignTokensActions {
  /** Save current customization as a token */
  saveToken: (name: string, componentName: string, customizations: Record<string, string>) => DesignToken;
  /** Update an existing token */
  updateToken: (id: string, updates: Partial<Pick<DesignToken, 'name' | 'customizations'>>) => void;
  /** Delete a token */
  deleteToken: (id: string) => void;
  /** Select a token */
  selectToken: (id: string | null) => void;
  /** Get token by ID */
  getToken: (id: string) => DesignToken | undefined;
  /** Export tokens as JSON string */
  exportTokensAsJSON: () => string;
  /** Export tokens as CSS variables */
  exportTokensAsCSS: () => string;
  /** Export for AI agent (formatted for Claude/GPT) */
  exportForAI: (componentName: string) => string;
  /** Clear all tokens */
  clearAll: () => void;
}

export type DesignTokensStore = DesignTokensState & DesignTokensActions;

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a unique ID for tokens
 */
function generateId(): string {
  return `token_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert camelCase to kebab-case for CSS
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// ============================================
// Store
// ============================================

export const useDesignTokensStore = create<DesignTokensStore>()(
  persist(
    immer((set, get) => ({
      tokens: [],
      selectedTokenId: null,

      saveToken: (name: string, componentName: string, customizations: Record<string, string>): DesignToken => {
        const token: DesignToken = {
          id: generateId(),
          name,
          componentName,
          customizations: {
            componentName,
            ...customizations,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => {
          state.tokens.push(token);
        });

        return token;
      },

      updateToken: (id: string, updates: Partial<Pick<DesignToken, 'name' | 'customizations'>>): void => {
        set((state) => {
          const index = state.tokens.findIndex((t) => t.id === id);
          if (index !== -1) {
            const token = state.tokens[index];
            if (token) {
              if (updates.name !== undefined) {
                token.name = updates.name;
              }
              if (updates.customizations !== undefined) {
                token.customizations = {
                  ...token.customizations,
                  ...updates.customizations,
                };
              }
              token.updatedAt = Date.now();
            }
          }
        });
      },

      deleteToken: (id: string): void => {
        set((state) => {
          state.tokens = state.tokens.filter((t) => t.id !== id);
          if (state.selectedTokenId === id) {
            state.selectedTokenId = null;
          }
        });
      },

      selectToken: (id: string | null): void => {
        set((state) => {
          state.selectedTokenId = id;
        });
      },

      getToken: (id: string): DesignToken | undefined => {
        return get().tokens.find((t) => t.id === id);
      },

      exportTokensAsJSON: (): string => {
        const { tokens } = get();
        return JSON.stringify(tokens, null, 2);
      },

      exportTokensAsCSS: (): string => {
        const { tokens } = get();
        const lines: string[] = [':root {'];

        for (const token of tokens) {
          lines.push(`  /* ${token.name} (${token.componentName}) */`);
          for (const [key, value] of Object.entries(token.customizations)) {
            if (key !== 'componentName') {
              lines.push(`  --${toKebabCase(token.name)}-${toKebabCase(key)}: ${value};`);
            }
          }
          lines.push('');
        }

        lines.push('}');
        return lines.join('\n');
      },

      exportForAI: (componentName: string): string => {
        const { tokens } = get();
        const componentTokens = tokens.filter((t) => t.componentName === componentName);

        if (componentTokens.length === 0) {
          return `No design tokens saved for "${componentName}".`;
        }

        const lines: string[] = [
          `# Design Tokens for ${componentName}`,
          '',
          'The following CSS customizations have been saved for this component:',
          '',
        ];

        for (const token of componentTokens) {
          lines.push(`## ${token.name}`);
          lines.push('```css');
          for (const [key, value] of Object.entries(token.customizations)) {
            if (key !== 'componentName') {
              lines.push(`${toKebabCase(key)}: ${value};`);
            }
          }
          lines.push('```');
          lines.push('');
        }

        lines.push('Apply these styles to the component when generating code.');

        return lines.join('\n');
      },

      clearAll: (): void => {
        set((state) => {
          state.tokens = [];
          state.selectedTokenId = null;
        });
      },
    })),
    {
      name: 'canvas-design-tokens',
      version: 1,
    }
  )
);

// ============================================
// Selector Hooks
// ============================================

/**
 * Get all saved tokens
 */
export function useDesignTokens(): DesignToken[] {
  return useDesignTokensStore((state) => state.tokens);
}

/**
 * Get tokens for a specific component
 */
export function useComponentTokens(componentName: string): DesignToken[] {
  return useDesignTokensStore((state) =>
    state.tokens.filter((t) => t.componentName === componentName)
  );
}

/**
 * Get the selected token
 */
export function useSelectedToken(): DesignToken | null {
  return useDesignTokensStore((state) => {
    if (!state.selectedTokenId) return null;
    return state.tokens.find((t) => t.id === state.selectedTokenId) ?? null;
  });
}
