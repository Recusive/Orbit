import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

import type { UnifiedDoc } from '@/features/vault/types';

import { VaultCrepeEditor } from '@/features/vault/components/VaultCrepeEditor';
import { VaultDocHeader } from '@/features/vault/components/VaultDocHeader';
import { useVaultContextManager } from '@/features/vault/hooks/use-vault-context-manager';
import { useVaultEditorStore } from '@/features/vault/stores';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';
import { useUIStore } from '@/stores/ui/ui-store';

type MarkdownUpdatedHandler = (ctx: unknown, markdown: string, prevMarkdown: string) => void;

type CreateBehavior = 'resolve' | 'reject' | 'defer';

interface DeferredCreate {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

interface MockTransaction {
  replaceWith: (_from: number, _to: number, content: unknown) => MockTransaction;
  setMeta: (key: string, value: boolean) => MockTransaction;
}

const crepeHarness = vi.hoisted(() => {
  let createBehavior: CreateBehavior = 'resolve';
  let deferredCreates: DeferredCreate[] = [];
  const instances: MockCrepe[] = [];

  class MockCrepe {
    static Feature = {
      ListItem: 'list-item',
      Table: 'table',
      Toolbar: 'toolbar',
      Placeholder: 'placeholder',
      BlockEdit: 'block-edit',
      LinkTooltip: 'link-tooltip',
      CodeMirror: 'code-mirror',
      Cursor: 'cursor',
      ImageBlock: 'image-block',
      Latex: 'latex',
    } as const;

    readonly on = vi.fn(
      (setup: (listener: { markdownUpdated: (cb: MarkdownUpdatedHandler) => void }) => void) => {
        setup({
          markdownUpdated: (cb: MarkdownUpdatedHandler): void => {
            this.markdownUpdatedHandler = cb;
          },
        });

        return this;
      }
    );

    readonly create = vi.fn((): Promise<void> => {
      if (createBehavior === 'resolve') {
        return Promise.resolve();
      }

      if (createBehavior === 'reject') {
        return Promise.reject(new Error('Mocked create failure'));
      }

      return new Promise<void>((resolve, reject) => {
        deferredCreates.push({
          resolve,
          reject,
        });
      });
    });

    readonly destroy = vi.fn((): Promise<void> => {
      this.isDestroyed = true;
      return Promise.resolve();
    });

    readonly setReadonly = vi.fn((value: boolean): MockCrepe => {
      this.readonly = value;
      return this;
    });

    readonly editor = {
      action: vi.fn((fn: (ctx: { get: (sliceName: string) => unknown }) => void): void => {
        fn({
          get: (sliceName: string): unknown => {
            if (sliceName === 'parser') {
              const parser = (markdown: string): { content: { markdown: string } } => ({
                content: { markdown },
              });
              return parser;
            }

            if (sliceName === 'editorView') {
              return this.view;
            }

            if (sliceName === 'commands') {
              return this.commandManager;
            }

            throw new Error(`Unexpected ctx slice: ${sliceName}`);
          },
        });
      }),
    };

    readonly commandCalls: { key: string; payload?: unknown }[] = [];
    readonly metaCalls: { key: string; value: boolean }[] = [];

    readonly commandManager = {
      call: (key: string, payload?: unknown): boolean => {
        this.commandCalls.push({ key, payload });
        return true;
      },
    };

    readonly transaction: MockTransaction = {
      replaceWith: (_from: number, _to: number, content: unknown): MockTransaction => {
        const markdown = (content as { markdown?: string }).markdown;
        if (typeof markdown === 'string') {
          this.currentMarkdown = markdown;
          this.view.state.doc.content.size = markdown.length;
        }
        return this.transaction;
      },
      setMeta: (key: string, value: boolean): MockTransaction => {
        this.metaCalls.push({ key, value });
        return this.transaction;
      },
    };

    readonly view = {
      state: {
        doc: {
          content: {
            size: 0,
          },
        },
        tr: this.transaction,
      },
      dispatch: vi.fn((): void => undefined),
    };

    private markdownUpdatedHandler: MarkdownUpdatedHandler | null = null;
    private currentMarkdown: string;
    private isDestroyed = false;

    readonly root: Node | string | null;
    readonly features: unknown;
    readonly defaultValue: string;

    readonly = false;

    constructor(options: {
      root?: Node | string | null;
      defaultValue?: string;
      features?: unknown;
    }) {
      this.root = options.root ?? null;
      this.defaultValue = options.defaultValue ?? '';
      this.features = options.features;
      this.currentMarkdown = this.defaultValue;
      this.view.state.doc.content.size = this.defaultValue.length;

      instances.push(this);
    }

    emitMarkdown(markdown: string): void {
      if (this.markdownUpdatedHandler === null) {
        return;
      }

      const previous = this.currentMarkdown;
      this.currentMarkdown = markdown;
      this.view.state.doc.content.size = markdown.length;
      this.markdownUpdatedHandler({}, markdown, previous);
    }

    get destroyed(): boolean {
      return this.isDestroyed;
    }
  }

  const getLatestInstance = (): MockCrepe => {
    const instance = instances[instances.length - 1];
    if (!instance) {
      throw new Error('Expected a MockCrepe instance');
    }
    return instance;
  };

  return {
    MockCrepe,
    getLatestInstance,
    resolveNextCreate: (): void => {
      const next = deferredCreates.shift();
      if (!next) {
        throw new Error('Expected a deferred create promise');
      }
      next.resolve();
    },
    setCreateBehavior: (next: CreateBehavior): void => {
      createBehavior = next;
    },
    reset: (): void => {
      createBehavior = 'resolve';
      deferredCreates = [];
      instances.length = 0;
    },
    getInstancesLength: (): number => instances.length,
  };
});

vi.mock('@milkdown/crepe', () => ({
  Crepe: crepeHarness.MockCrepe,
}));

vi.mock('@/components/chat/tools/shared/use-syntax-highlight', () => ({
  useIsDarkMode: (): boolean => false,
}));

function createTestDoc(overrides: Partial<UnifiedDoc> = {}): UnifiedDoc {
  return {
    id: 'vault:test.md',
    name: 'test.md',
    relativePath: 'test.md',
    absolutePath: '/repo/.orbit/Vault/test.md',
    source: 'vault',
    isDir: false,
    extension: 'md',
    sizeBytes: 10,
    modifiedAt: Date.now(),
    ...overrides,
  };
}

describe('VaultCrepeEditor', () => {
  beforeEach(() => {
    crepeHarness.reset();
    vi.clearAllMocks();

    useVaultEditorStore.setState(useVaultEditorStore.getInitialState(), true);
    usePendingContextStore.setState(usePendingContextStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('calls onMarkdownChange when user types', async () => {
    const onMarkdownChange = vi.fn();
    const onDirtyChange = vi.fn();

    render(
      <VaultCrepeEditor
        initialContent="hello"
        readOnly={false}
        onMarkdownChange={onMarkdownChange}
        onDirtyChange={onDirtyChange}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().create).toHaveBeenCalledTimes(1);
    });

    act(() => {
      crepeHarness.getLatestInstance().emitMarkdown('hello world');
    });

    expect(onMarkdownChange).toHaveBeenCalledWith('hello world');
  });

  it('does not call onMarkdownChange during programmatic sync', async () => {
    const onMarkdownChange = vi.fn();
    const onDirtyChange = vi.fn();

    const { rerender } = render(
      <VaultCrepeEditor
        initialContent="first"
        readOnly={false}
        onMarkdownChange={onMarkdownChange}
        onDirtyChange={onDirtyChange}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().create).toHaveBeenCalledTimes(1);
    });

    rerender(
      <VaultCrepeEditor
        initialContent="reloaded"
        readOnly={false}
        onMarkdownChange={onMarkdownChange}
        onDirtyChange={onDirtyChange}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().metaCalls).toContainEqual({
        key: 'addToHistory',
        value: false,
      });
    });

    expect(onMarkdownChange).not.toHaveBeenCalled();
    expect(onDirtyChange).not.toHaveBeenCalled();
  });

  it('calls onDirtyChange on user edits', async () => {
    const onMarkdownChange = vi.fn();
    const onDirtyChange = vi.fn();

    render(
      <VaultCrepeEditor
        initialContent="dirty"
        readOnly={false}
        onMarkdownChange={onMarkdownChange}
        onDirtyChange={onDirtyChange}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().create).toHaveBeenCalledTimes(1);
    });

    act(() => {
      crepeHarness.getLatestInstance().emitMarkdown('dirty now');
    });

    expect(onDirtyChange).toHaveBeenCalledTimes(1);
  });

  it('handles unmount during async create without throwing', async () => {
    crepeHarness.setCreateBehavior('defer');

    const { unmount } = render(
      <VaultCrepeEditor
        initialContent="async"
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    const instance = crepeHarness.getLatestInstance();

    unmount();

    act(() => {
      crepeHarness.resolveNextCreate();
    });

    await waitFor(() => {
      expect(instance.destroy).toHaveBeenCalled();
    });

    expect(instance.destroyed).toBe(true);
  });

  it('respects readOnly prop', async () => {
    const { rerender } = render(
      <VaultCrepeEditor
        initialContent="readonly"
        readOnly={true}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().setReadonly).toHaveBeenCalledWith(true);
    });

    rerender(
      <VaultCrepeEditor
        initialContent="readonly"
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().setReadonly).toHaveBeenLastCalledWith(false);
    });
  });

  it('external reload does not create undo entries', async () => {
    const { rerender } = render(
      <VaultCrepeEditor
        initialContent="alpha"
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().create).toHaveBeenCalledTimes(1);
    });

    rerender(
      <VaultCrepeEditor
        initialContent="beta"
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(crepeHarness.getLatestInstance().metaCalls).toContainEqual({
        key: 'addToHistory',
        value: false,
      });
    });
  });

  it('rapid doc switching does not leak Crepe instances', async () => {
    const { rerender } = render(
      <VaultCrepeEditor
        key="doc-a"
        initialContent="A"
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    const first = crepeHarness.getLatestInstance();

    rerender(
      <VaultCrepeEditor
        key="doc-b"
        initialContent="B"
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(first.destroy).toHaveBeenCalled();
    });

    expect(crepeHarness.getInstancesLength()).toBe(2);
    expect(crepeHarness.getLatestInstance().destroyed).toBe(false);
  });

  it('does not execute script content from markdown HTML fallback', async () => {
    crepeHarness.setCreateBehavior('reject');

    render(
      <VaultCrepeEditor
        initialContent={'<script>window.__xss_test = 1</script>'}
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await screen.findByText(/failed to initialize/i);

    expect((window as typeof window & { __xss_test?: number }).__xss_test).toBeUndefined();
    expect(document.querySelector('script')).toBeNull();
  });

  it('does not render onerror/onload event handlers from markdown fallback', async () => {
    crepeHarness.setCreateBehavior('reject');

    render(
      <VaultCrepeEditor
        initialContent={
          '<img onerror="window.__xss_onerror = 1" onload="window.__xss_onload = 1" src="x">'
        }
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await screen.findByText(/failed to initialize/i);

    expect((window as typeof window & { __xss_onerror?: number }).__xss_onerror).toBeUndefined();
    expect((window as typeof window & { __xss_onload?: number }).__xss_onload).toBeUndefined();
    expect(document.querySelector('[onerror], [onload]')).toBeNull();
  });

  it('does not render javascript URIs in links from fallback', async () => {
    crepeHarness.setCreateBehavior('reject');

    render(
      <VaultCrepeEditor
        initialContent={'[click](javascript:alert(1))'}
        readOnly={false}
        onMarkdownChange={vi.fn()}
        onDirtyChange={vi.fn()}
      />
    );

    await screen.findByText(/failed to initialize/i);

    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('disables Save and Send buttons for non-UTF8 documents', () => {
    render(
      <VaultDocHeader
        doc={createTestDoc()}
        saveState="idle"
        isDocModified={false}
        canSave={false}
        canSend={false}
        onCloseVault={vi.fn()}
        onSendToAgent={vi.fn()}
        onSave={vi.fn()}
        onReload={vi.fn()}
        onOverwrite={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send to Agent' })).toBeDisabled();
  });

  it('sendActiveDocToAgent returns false for non-UTF8 docs', async () => {
    useUIStore.setState({ workspacePath: '/repo' });
    useVaultEditorStore.setState({
      activeDoc: createTestDoc(),
      activeDocContent: 'binary payload',
      activeDocEncoding: 'base64',
      isDocModified: false,
    });

    const { result } = renderHook(() => useVaultContextManager());

    let sent = true;
    await act(async () => {
      sent = await result.current.sendActiveDocToAgent();
    });

    expect(sent).toBe(false);
    expect(usePendingContextStore.getState().pending).toHaveLength(0);
  });
});
