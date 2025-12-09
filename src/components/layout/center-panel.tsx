import React from 'react';

// Placeholder components - these would be imported from chat module
const ConversationHeader: React.FC = () => (
  <div className="h-[40px] bg-background border-b border-border flex items-center px-4 justify-between">
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold">Conversation</h2>
      <span className="text-xs text-muted-foreground">Model: Claude Opus 4.5</span>
    </div>
    <div className="flex items-center gap-2">
      <button
        className="px-2 py-1 text-xs hover:bg-accent rounded transition-colors"
        title="Clear conversation"
      >
        Clear
      </button>
      <button
        className="px-2 py-1 text-xs hover:bg-accent rounded transition-colors"
        title="Export conversation"
      >
        Export
      </button>
    </div>
  </div>
);

const MessageFeed: React.FC = () => (
  <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
    {/* Message list */}
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Example messages - would be dynamic */}
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
          U
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">You</div>
          <div className="text-sm bg-accent rounded-lg px-3 py-2">
            Hello! Can you help me with a coding task?
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-medium">
          A
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-1">Assistant</div>
          <div className="text-sm bg-muted rounded-lg px-3 py-2">
            Of course! I'd be happy to help you with your coding task. What would you like
            to work on?
          </div>
        </div>
      </div>

      {/* Empty state message */}
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Start a conversation to see messages here</p>
      </div>
    </div>
  </div>
);

const ChatInputContainer: React.FC = () => (
  <div className="border-t border-border bg-background px-4 py-3">
    <div className="max-w-3xl mx-auto">
      <div className="relative">
        <textarea
          className="w-full min-h-[60px] max-h-[200px] px-3 py-2 pr-12 bg-accent rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="Type your message... (Shift+Enter for new line)"
          rows={2}
        />
        <button
          className="absolute right-2 bottom-2 w-8 h-8 bg-blue-500 hover:bg-blue-600 rounded flex items-center justify-center text-white transition-colors"
          aria-label="Send message"
          title="Send message (Enter)"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <button className="hover:text-foreground transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
            Attach
          </button>
          <button className="hover:text-foreground transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            Context
          </button>
        </div>
        <div>0 / 4000</div>
      </div>
    </div>
  </div>
);

export const CenterPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background">
      <ConversationHeader />
      <MessageFeed />
      <ChatInputContainer />
    </div>
  );
};
