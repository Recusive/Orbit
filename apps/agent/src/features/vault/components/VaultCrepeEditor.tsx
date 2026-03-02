import { Crepe } from '@milkdown/crepe';
import { createLogger } from '@orbit/common/lib';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { useIsDarkMode } from '@/components/chat/tools/shared/use-syntax-highlight';
import { Button } from '@/components/ui/button';

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@milkdown/crepe/theme/frame-dark.css';

const logger = createLogger('VaultCrepeEditor');
const MAX_CREATE_FAILURES = 3;

export interface VaultEditorHandle {
  runCommand: (key: string, payload?: unknown) => void;
}

interface VaultCrepeEditorProps {
  readonly initialContent: string;
  readonly readOnly: boolean;
  readonly onMarkdownChange: (markdown: string) => void;
  readonly onDirtyChange: () => void;
}

// Milkdown Crepe's internal types (@milkdown/kit/prose/view, etc.) are NOT
// importable — @milkdown/kit is a transitive dependency of @milkdown/crepe but
// is not hoisted to node_modules/@milkdown/kit/ in this monorepo. Importing
// from @milkdown/kit/prose/view fails at build time.
//
// These structural interfaces mirror the subset of ProseMirror and Milkdown
// APIs actually used by the editor helpers below: ParsedDoc, MarkdownParser,
// Transaction, EditorState, EditorView, CommandManager, and Ctx.
interface ParsedDocLike {
  readonly content: unknown;
}

type MarkdownParserLike = (markdown: string) => ParsedDocLike | null | undefined;

interface TransactionLike {
  replaceWith: (from: number, to: number, content: unknown) => TransactionLike;
  setMeta: (key: string, value: boolean) => TransactionLike;
}

interface EditorStateLike {
  readonly doc: {
    readonly content: {
      readonly size: number;
    };
  };
  readonly tr: TransactionLike;
  readonly schema: {
    readonly nodes: Readonly<Record<string, unknown>>;
  };
  readonly selection: {
    readonly head: number;
  };
}

interface CoordsAtPos {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface EditorViewLike {
  readonly state: EditorStateLike;
  readonly dispatch: (transaction: TransactionLike) => void;
  readonly dom: HTMLElement;
  readonly setProps: (props: { handleScrollToSelection: () => boolean }) => void;
  readonly coordsAtPos: (pos: number) => CoordsAtPos;
}

interface CommandManagerLike {
  readonly call: (slice: string, payload?: unknown) => boolean;
}

interface CtxLike {
  readonly get: (sliceName: string) => unknown;
}

function replaceContentWithoutHistory(crepe: Crepe, markdown: string): void {
  crepe.editor.action((ctxUnknown) => {
    const ctx = ctxUnknown as CtxLike;
    const view = ctx.get('editorView') as EditorViewLike;
    const parser = ctx.get('parser') as MarkdownParserLike;
    const nextDoc = parser(markdown);

    if (nextDoc === null || nextDoc === undefined) {
      return;
    }

    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
  });
}

function runCommand(crepe: Crepe, key: string, payload?: unknown): void {
  if (crepe.readonly) {
    return;
  }

  crepe.editor.action((ctxUnknown) => {
    const ctx = ctxUnknown as CtxLike;
    const commands = ctx.get('commands') as CommandManagerLike;
    commands.call(key, payload);
  });
}

function insertTaskList(crepe: Crepe): void {
  if (crepe.readonly) {
    return;
  }

  crepe.editor.action((ctxUnknown) => {
    const ctx = ctxUnknown as CtxLike;
    const commands = ctx.get('commands') as CommandManagerLike;
    const view = ctx.get('editorView') as EditorViewLike;
    const nodeType = view.state.schema.nodes['list_item'];
    commands.call('WrapInBlockType', { nodeType, attrs: { checked: false } });
  });
}

function bindKeyboardShortcuts(target: HTMLElement, crepe: Crepe): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const hasModifier = event.metaKey || event.ctrlKey;
    if (!hasModifier || event.altKey) {
      return;
    }

    const normalizedKey = event.key.toLowerCase();
    const isShift = event.shiftKey;

    if (isShift && normalizedKey === 's') {
      event.preventDefault();
      runCommand(crepe, 'ToggleStrikeThrough');
      return;
    }

    if (!isShift && normalizedKey === 'e') {
      event.preventDefault();
      runCommand(crepe, 'ToggleInlineCode');
      return;
    }

    if (!isShift && normalizedKey === 'k') {
      event.preventDefault();
      runCommand(crepe, 'ToggleLink');
      return;
    }

    // Milkdown Crepe does NOT include prosemirror-commands' baseKeymap, so
    // selectAll (Mod-a) is missing. Without this, the browser's native Cmd+A
    // selects the entire page instead of just the editor content.
    if (!isShift && normalizedKey === 'a') {
      event.preventDefault();
      crepe.editor.action((ctxUnknown) => {
        const ctx = ctxUnknown as CtxLike;
        const view = ctx.get('editorView') as EditorViewLike;
        const sel = window.getSelection();
        if (sel !== null) {
          sel.selectAllChildren(view.dom);
        }
      });
      return;
    }

    if (!isShift || (normalizedKey !== '1' && normalizedKey !== '2' && normalizedKey !== '3')) {
      return;
    }

    event.preventDefault();
    runCommand(crepe, 'WrapInHeading', Number.parseInt(normalizedKey, 10));
  };

  target.addEventListener('keydown', onKeyDown);

  return (): void => {
    target.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Prevents ProseMirror from scrolling ancestor elements during editing.
 *
 * ProseMirror has two scroll mechanisms that walk ALL ancestors and set scrollTop:
 *
 * 1. resetScrollPos (scroll preservation) — runs on every DOM update when
 *    the selection changes. Stores all ancestor scrollTops before the update,
 *    then restores them with an offset after. ProseMirror SKIPS this entirely
 *    when `view.dom.style.overflowAnchor` is set (any value).
 *
 * 2. scrollRectIntoView (scroll to selection) — runs when a transaction has
 *    scrollIntoView(). Walks ancestors and calls `elt.scrollTop += moveY` on
 *    each. Controlled by the `handleScrollToSelection` EditorProp — returning
 *    true prevents the default behavior.
 *
 * Both mechanisms set scrollTop on overflow:hidden ancestors, causing the
 * content card to visually shift. This function disables both by:
 *   - Setting overflowAnchor on the ProseMirror DOM (disables #1)
 *   - Setting handleScrollToSelection to custom logic (replaces #2)
 *
 * The custom scroll logic only scrolls the internal scroll container
 * (the overflow-auto div inside the vault shell), never ancestors.
 */
function configureScrollBehavior(crepe: Crepe, scrollContainer: HTMLElement): void {
  crepe.editor.action((ctxUnknown) => {
    const ctx = ctxUnknown as CtxLike;
    const view = ctx.get('editorView') as EditorViewLike;

    // Disable ProseMirror's ancestor scroll restoration (mechanism #1).
    // ProseMirror checks `this.dom.style.overflowAnchor == null` before
    // calling storeScrollPos/resetScrollPos. Setting any value skips it.
    view.dom.style.overflowAnchor = 'none';

    // Disable browser scroll anchoring on the scroll container (mechanism #3).
    // Without this, the browser picks a child element as an "anchor" and
    // adjusts scrollTop when DOM mutations shift content — fighting our
    // custom scroll logic and causing the cursor to appear displaced.
    scrollContainer.style.overflowAnchor = 'none';

    // Replace ProseMirror's scrollRectIntoView with scroll logic that only
    // affects the internal scroll container (mechanism #2).
    //
    // Deferred via requestAnimationFrame so the browser has flushed layout
    // after ProseMirror's DOM patch — coordsAtPos returns accurate viewport
    // coordinates for the new cursor position instead of stale pre-layout values.
    view.setProps({
      handleScrollToSelection: (): boolean => {
        requestAnimationFrame(() => {
          try {
            const cursorCoords = view.coordsAtPos(view.state.selection.head);
            const containerRect = scrollContainer.getBoundingClientRect();
            const margin = 20;

            if (cursorCoords.top < containerRect.top + margin) {
              scrollContainer.scrollTop -= containerRect.top + margin - cursorCoords.top;
            } else if (cursorCoords.bottom > containerRect.bottom - margin) {
              scrollContainer.scrollTop += cursorCoords.bottom - containerRect.bottom + margin;
            }
          } catch {
            // coordsAtPos can throw if the position is invalid after destroy
          }
        });

        return true;
      },
    });
  });
}

export const VaultCrepeEditor = forwardRef<VaultEditorHandle, VaultCrepeEditorProps>(
  ({ initialContent, readOnly, onMarkdownChange, onDirtyChange }, ref) => {
    const isDark = useIsDarkMode();

    const shellRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const readyRef = useRef(false);

    const onChangeRef = useRef(onMarkdownChange);
    const onDirtyRef = useRef(onDirtyChange);
    const valueRef = useRef(initialContent);
    const initialContentRef = useRef(initialContent);
    const initialReadOnlyRef = useRef(readOnly);
    const isSyncingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      runCommand: (key: string, payload?: unknown): void => {
        const crepe = crepeRef.current;
        if (crepe === null || !readyRef.current) {
          return;
        }

        if (key === '__InsertTaskList') {
          insertTaskList(crepe);
          return;
        }

        runCommand(crepe, key, payload);
      },
    }));

    const [editorError, setEditorError] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const [createFailureCount, setCreateFailureCount] = useState(0);

    useEffect(() => {
      onChangeRef.current = onMarkdownChange;
    }, [onMarkdownChange]);

    useEffect(() => {
      onDirtyRef.current = onDirtyChange;
    }, [onDirtyChange]);

    useEffect(() => {
      const shell = shellRef.current;
      if (shell === null) {
        return;
      }

      if (isDark) {
        shell.classList.add('dark');
        return;
      }

      shell.classList.remove('dark');
    }, [isDark]);

    useEffect(() => {
      if (containerRef.current === null) {
        return;
      }

      let destroyed = false;
      let cleanupShortcuts: (() => void) | null = null;
      const crepe = new Crepe({
        root: containerRef.current,
        defaultValue: initialContentRef.current,
        features: {
          [Crepe.Feature.ListItem]: true,
          [Crepe.Feature.Table]: true,
          [Crepe.Feature.Toolbar]: true,
          [Crepe.Feature.Placeholder]: true,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.LinkTooltip]: true,
          [Crepe.Feature.CodeMirror]: true,
          [Crepe.Feature.Cursor]: true,
          [Crepe.Feature.ImageBlock]: false,
          [Crepe.Feature.Latex]: false,
        },
      });

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (destroyed || isSyncingRef.current) {
            return;
          }

          valueRef.current = markdown;
          onDirtyRef.current();
          onChangeRef.current(markdown);
        });
      });

      crepeRef.current = crepe;

      void crepe
        .create()
        .then(() => {
          if (destroyed) {
            void crepe.destroy();
            return;
          }

          readyRef.current = true;
          cleanupShortcuts = bindKeyboardShortcuts(containerRef.current as HTMLElement, crepe);
          crepe.setReadonly(initialReadOnlyRef.current);

          const scrollContainer = shellRef.current?.querySelector('.overflow-auto');
          if (scrollContainer instanceof HTMLElement) {
            configureScrollBehavior(crepe, scrollContainer);
          }

          setCreateFailureCount(0);
          setEditorError(false);
        })
        .catch((error: unknown) => {
          if (destroyed) {
            return;
          }

          logger.error('Failed to create Milkdown Crepe editor', { error });
          setCreateFailureCount((count) => count + 1);
          setEditorError(true);
        });

      return (): void => {
        destroyed = true;
        readyRef.current = false;
        crepeRef.current = null;
        cleanupShortcuts?.();
        void crepe.destroy();
      };
    }, [retryNonce]);

    useEffect(() => {
      const crepe = crepeRef.current;
      if (crepe === null || !readyRef.current || initialContent === valueRef.current) {
        return;
      }

      isSyncingRef.current = true;
      try {
        replaceContentWithoutHistory(crepe, initialContent);
        valueRef.current = initialContent;
      } catch (error) {
        logger.error('Failed to sync markdown content into Crepe', { error });
      } finally {
        isSyncingRef.current = false;
      }
    }, [initialContent]);

    useEffect(() => {
      const crepe = crepeRef.current;
      if (crepe === null) {
        return;
      }

      crepe.setReadonly(readOnly);
    }, [readOnly]);

    const canRetry = createFailureCount < MAX_CREATE_FAILURES;

    const handleRetry = useCallback((): void => {
      if (!canRetry) {
        return;
      }

      setEditorError(false);
      setRetryNonce((value) => value + 1);
    }, [canRetry]);

    if (editorError) {
      return (
        <div ref={shellRef} className="vault-editor-shell h-full overflow-clip">
          <div className="h-full overflow-auto flex flex-col">
            <div className="flex flex-col gap-3 px-4 py-4 flex-1 min-h-0 text-sm">
              <p className="text-muted-foreground">
                Vault editor failed to initialize. Showing raw markdown content.
              </p>
              <pre className="max-h-[55vh] overflow-auto rounded-md border border-lg-separator bg-card/40 p-3 text-xs text-foreground whitespace-pre-wrap break-words">
                {valueRef.current}
              </pre>
              {canRetry ? (
                <div>
                  <Button size="sm" variant="secondary" onClick={handleRetry}>
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Retry limit reached for this document. Reopen the file to try again.
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div ref={shellRef} className="vault-editor-shell h-full overflow-clip">
        <div className="h-full overflow-auto flex flex-col">
          <div className="px-4 py-4 flex-1 min-h-0">
            <div ref={containerRef} className="w-full h-full" spellCheck={true} />
          </div>
        </div>
      </div>
    );
  }
);

VaultCrepeEditor.displayName = 'VaultCrepeEditor';
