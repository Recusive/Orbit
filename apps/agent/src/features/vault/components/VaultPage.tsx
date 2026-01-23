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
    <div className="flex-1 flex flex-col items-center overflow-y-auto py-8">
      <div
        className="w-full h-full px-4"
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search notes..."
                className="w-full h-10 pl-10 pr-4 rounded-lg bg-card border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border focus:ring-1 focus:ring-border/50 transition-colors"
              />
            </div>
            <button className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all">
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
    </div>
  );
};
