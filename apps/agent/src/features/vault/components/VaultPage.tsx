/**
 * VaultPage - Grid of note tiles for the vault view
 *
 * Displays notes in a 3-column grid with the same width as the chat input box.
 */
import { IconSearchlinesSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconSearchlinesSparkle';
import { Search } from 'lucide-react';

import type { FC } from 'react';

import { CHAT_WIDTH, CHAT_WIDTH_VAR } from '@/lib/utils';

// Mock notes data - replace with actual data source
const MOCK_NOTES = [
  { id: '1', title: 'Project Ideas', preview: 'List of new features to explore...' },
  { id: '2', title: 'Meeting Notes', preview: 'Discussion from weekly sync...' },
  { id: '3', title: 'Code Snippets', preview: 'Useful patterns and utilities...' },
  { id: '4', title: 'Bug Fixes', preview: 'Known issues and solutions...' },
  { id: '5', title: 'Research', preview: 'Articles and references...' },
  { id: '6', title: 'Todo List', preview: 'Tasks to complete this week...' },
];

interface NoteCardProps {
  readonly title: string;
  readonly preview: string;
  readonly onClick?: () => void;
}

const NoteCard: FC<NoteCardProps> = ({ title, preview, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="aspect-square flex flex-col items-start p-4 rounded-xl bg-card border border-border/50 hover:border-border hover:bg-card/80 transition-colors duration-150 text-left overflow-hidden"
    >
      <h3 className="font-medium text-foreground text-sm truncate w-full">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{preview}</p>
    </button>
  );
};

export const VaultPage: FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center overflow-hidden py-8 relative">
      {/* Content */}
      <div
        className="w-full h-full px-4 relative z-0"
        style={{
          maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
        }}
      >
        {/* Header */}
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <IconSearchlinesSparkle className="h-6 w-6" />
            Vault
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your saved notes and snippets</p>

          {/* Search Bar */}
          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search notes..."
                className="w-full h-8 pl-9 pr-4 rounded-md bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border focus:ring-1 focus:ring-border/50 transition-colors"
              />
            </div>
            <button className="h-8 px-3 rounded-md bg-card border border-border/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-card/80 active:scale-[0.97] transition-[background-color,color,border-color,transform] duration-150">
              Search
            </button>
          </div>
        </div>

        {/* Notes Grid - 3 columns */}
        <div className="grid grid-cols-3 gap-3">
          {MOCK_NOTES.map((note) => (
            <NoteCard key={note.id} title={note.title} preview={note.preview} />
          ))}
        </div>
      </div>

      {/* Coming Soon — dashed overlay expanding up from bottom */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-center pointer-events-none select-none"
        style={{ top: '40%' }}
      >
        {/* Gradient fade — uses warning-foreground for visible tint in light mode */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--warning-foreground) 5%, var(--background)) 35%, color-mix(in oklch, var(--warning-foreground) 12%, var(--background)) 100%)',
          }}
        />
        {/* Dashed border box with label */}
        <div
          className="relative mb-10 rounded-xl border-[1.5px] border-dashed px-8 py-3"
          style={{
            borderColor: 'var(--warning-foreground)',
            backgroundColor: 'color-mix(in oklch, var(--warning-foreground) 8%, var(--background))',
          }}
        >
          <span
            className="text-xs font-medium tracking-widest uppercase"
            style={{ color: 'var(--warning-foreground)' }}
          >
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
};
