import { Clock, X } from 'lucide-react';

import type { QueuedMessage } from '@/stores/chat/queued-message-store';
import type { FC } from 'react';

import { FileIcon } from '@/components/files/file-icon';

interface QueuedMessageBubbleProps {
  readonly message: QueuedMessage;
  readonly onCancel: () => void;
}

export const QueuedMessageBubble: FC<QueuedMessageBubbleProps> = ({ message, onCancel }) => {
  const hasFiles = (message.contextFiles?.length ?? 0) > 0;
  const hasImages = (message.images?.length ?? 0) > 0;
  const hasAttachments = hasFiles || hasImages;

  return (
    <div className="space-y-2">
      {/* Queued message bubble - muted with dashed border */}
      <div className="p-3 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Queued indicator */}
            <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-[10px] font-medium uppercase tracking-wide">Queued</span>
            </div>
            {/* Message text */}
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message.text}</p>
          </div>
          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
            title="Cancel queued message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Attached context - outside the bubble */}
      {hasAttachments ? (
        <div className="flex flex-wrap gap-1.5 px-3">
          {/* Attached files */}
          {message.contextFiles?.map((filePath) => {
            const fileName = filePath.split('/').pop() ?? filePath;
            return (
              <div
                key={filePath}
                className="flex items-center gap-1.5 px-1.5 py-1 bg-muted/20 rounded border border-dashed border-border/40"
                title={filePath}
              >
                <FileIcon
                  fileName={fileName}
                  className="h-3.5 w-3.5 opacity-50"
                  monochrome={false}
                />
                <span className="text-[11px] text-muted-foreground/70">{fileName}</span>
              </div>
            );
          })}
          {/* Attached images */}
          {message.images?.map((image, index) => (
            <div
              key={`${image.name}-${String(index)}`}
              className="flex items-center gap-1.5 px-1.5 py-1 bg-muted/20 rounded border border-dashed border-border/40"
              title={image.name}
            >
              <img
                src={image.previewUrl}
                alt={image.name}
                className="h-4 w-4 object-cover rounded-sm opacity-50"
              />
              <span className="text-[11px] text-muted-foreground/70">{image.name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
