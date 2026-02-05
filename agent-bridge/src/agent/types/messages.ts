/**
 * Message payload types for IPC communication between frontend and backend
 */

/**
 * Attachment content block for Claude SDK
 * Supports images, documents, and text with metadata
 */
export interface AttachmentContentBlock {
  type: 'document' | 'image' | 'text';
  source?: {
    type: 'base64';
    mediaType: string; // camelCase from Rust - 'application/pdf', 'image/png', etc.
    data: string; // base64 encoded content
  };
  text?: string; // For text blocks
  name?: string; // Original filename for reference
  filePath?: string; // For editor selections
  lineStart?: number; // For editor selections
  lineEnd?: number; // For editor selections
  terminalName?: string; // For terminal selections
  timestamp?: string; // For terminal selections
}

/**
 * Message payload sent from frontend to backend via IPC
 */
export interface MessagePayload {
  sessionId: string;
  message: string;
  attachments?: AttachmentContentBlock[];
  /**
   * UUID of the previous message in the conversation chain.
   * Used for Claude Code-style rewind: after rewinding, the next message
   * should have parentUuid set to the message we rewound to.
   * - null for the first message in a conversation
   * - undefined if not specified (default behavior)
   */
  parentUuid?: string | null;
}

/**
 * Response from backend to frontend
 */
export interface MessageResponse {
  sessionId: string;
  success: boolean;
  error?: string;
}
