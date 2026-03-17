import { Maximize2, Minimize2 } from 'lucide-react';
import { Suspense, useEffect } from 'react';

import { SettingsSkeleton } from './components';
import { SETTINGS_PAGE_COMPONENTS } from './pages';

import type { FC } from 'react';

import { useSmoothScroll } from '@/hooks/ui';
import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';
import { selectChatFullWidth, useChatWidthStore } from '@/stores/ui/chat-width-store';
import { useSettingsSection, useUIStore } from '@/stores/ui/ui-store';

export const SettingsPage: FC = () => {
  const activeSection = useSettingsSection();
  const scrollRef = useSmoothScroll(0.08);
  const PageComponent = SETTINGS_PAGE_COMPONENTS[activeSection];
  const fullWidth = useChatWidthStore(selectChatFullWidth);
  const toggleFullWidth = useChatWidthStore((s) => s.toggleFullWidth);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      if (
        document.querySelector('[data-settings-child-dialog="true"][data-state="open"]') !== null
      ) {
        return;
      }
      useUIStore.getState().setSettingsOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return (): void => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (PageComponent === undefined) {
    return null;
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto overscroll-y-contain p-6"
      style={{ scrollbarGutter: 'stable both-edges' }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: fullWidth
            ? undefined
            : `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
        }}
      >
        <div className="flex justify-end mb-3">
          <button
            onClick={toggleFullWidth}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
            aria-label={fullWidth ? 'Constrain width' : 'Expand to full width'}
          >
            {fullWidth ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <Suspense key={activeSection} fallback={<SettingsSkeleton />}>
          <PageComponent />
        </Suspense>
      </div>
    </div>
  );
};
