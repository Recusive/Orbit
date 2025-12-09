import { z } from 'zod';

/**
 * Request types for messages sent from UI to Extension
 */
export enum RequestTypes {
  SEND_MESSAGE = 'sendMessage',
  GET_CONVERSATION = 'getConversation',
  GET_CONVERSATIONS = 'getConversations',
  CREATE_CONVERSATION = 'createConversation',
  DELETE_CONVERSATION = 'deleteConversation',
  GET_WORKSPACE_INFO = 'getWorkspaceInfo',
  EXECUTE_COMMAND = 'executeCommand',
  READ_FILE = 'readFile',
  WRITE_FILE = 'writeFile',
  APPLY_DIFF = 'applyDiff',
  GET_FILE_TREE = 'getFileTree',
  SEARCH_FILES = 'searchFiles',
  CANCEL_REQUEST = 'cancelRequest',
}

/**
 * Response types for messages sent from Extension to UI
 */
export enum ResponseTypes {
  MESSAGE_RESPONSE = 'messageResponse',
  CONVERSATION_DATA = 'conversationData',
  CONVERSATIONS_LIST = 'conversationsList',
  CONVERSATION_CREATED = 'conversationCreated',
  CONVERSATION_DELETED = 'conversationDeleted',
  WORKSPACE_INFO = 'workspaceInfo',
  COMMAND_OUTPUT = 'commandOutput',
  FILE_CONTENT = 'fileContent',
  FILE_WRITTEN = 'fileWritten',
  DIFF_APPLIED = 'diffApplied',
  FILE_TREE = 'fileTree',
  SEARCH_RESULTS = 'searchResults',
  ERROR = 'error',
  AGENT_STATE_CHANGED = 'agentStateChanged',
  PROGRESS_UPDATE = 'progressUpdate',
}

/**
 * Base message schema
 */
export const BaseMessageSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
});

/**
 * Message to Extension schemas
 */
export const SendMessageRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.SEND_MESSAGE),
  payload: z.object({
    conversationId: z.string(),
    content: z.string(),
    context: z
      .object({
        files: z.array(z.string()).optional(),
        selection: z
          .object({
            filePath: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            text: z.string(),
          })
          .optional(),
      })
      .optional(),
  }),
});

export const GetConversationRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.GET_CONVERSATION),
  payload: z.object({
    conversationId: z.string(),
  }),
});

export const GetConversationsRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.GET_CONVERSATIONS),
  payload: z.object({}).optional(),
});

export const CreateConversationRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.CREATE_CONVERSATION),
  payload: z.object({
    title: z.string().optional(),
    workspaceId: z.string().optional(),
  }),
});

export const DeleteConversationRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.DELETE_CONVERSATION),
  payload: z.object({
    conversationId: z.string(),
  }),
});

export const GetWorkspaceInfoRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.GET_WORKSPACE_INFO),
  payload: z.object({}).optional(),
});

export const ExecuteCommandRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.EXECUTE_COMMAND),
  payload: z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
  }),
});

export const ReadFileRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.READ_FILE),
  payload: z.object({
    filePath: z.string(),
  }),
});

export const WriteFileRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.WRITE_FILE),
  payload: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
});

export const ApplyDiffRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.APPLY_DIFF),
  payload: z.object({
    filePath: z.string(),
    diff: z.string(),
  }),
});

export const GetFileTreeRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.GET_FILE_TREE),
  payload: z.object({
    rootPath: z.string().optional(),
  }),
});

export const SearchFilesRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.SEARCH_FILES),
  payload: z.object({
    query: z.string(),
    includePatterns: z.array(z.string()).optional(),
    excludePatterns: z.array(z.string()).optional(),
  }),
});

export const CancelRequestSchema = BaseMessageSchema.extend({
  type: z.literal(RequestTypes.CANCEL_REQUEST),
  payload: z.object({
    requestId: z.string(),
  }),
});

export const MessageToExtensionSchema = z.discriminatedUnion('type', [
  SendMessageRequestSchema,
  GetConversationRequestSchema,
  GetConversationsRequestSchema,
  CreateConversationRequestSchema,
  DeleteConversationRequestSchema,
  GetWorkspaceInfoRequestSchema,
  ExecuteCommandRequestSchema,
  ReadFileRequestSchema,
  WriteFileRequestSchema,
  ApplyDiffRequestSchema,
  GetFileTreeRequestSchema,
  SearchFilesRequestSchema,
  CancelRequestSchema,
]);

/**
 * Message from Extension schemas
 */
export const MessageResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.MESSAGE_RESPONSE),
  payload: z.object({
    conversationId: z.string(),
    messageId: z.string(),
    success: z.boolean(),
  }),
});

export const ConversationDataResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.CONVERSATION_DATA),
  payload: z.object({
    conversation: z.any(), // Will be typed by Conversation schema
  }),
});

export const ConversationsListResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.CONVERSATIONS_LIST),
  payload: z.object({
    conversations: z.array(z.any()), // Will be typed by ConversationMeta schema
  }),
});

export const ConversationCreatedResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.CONVERSATION_CREATED),
  payload: z.object({
    conversation: z.any(), // Will be typed by Conversation schema
  }),
});

export const ConversationDeletedResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.CONVERSATION_DELETED),
  payload: z.object({
    conversationId: z.string(),
  }),
});

export const WorkspaceInfoResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.WORKSPACE_INFO),
  payload: z.object({
    workspace: z.any(), // Will be typed by Workspace schema
  }),
});

export const CommandOutputResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.COMMAND_OUTPUT),
  payload: z.object({
    requestId: z.string(),
    output: z.string(),
    exitCode: z.number(),
  }),
});

export const FileContentResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.FILE_CONTENT),
  payload: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
});

export const FileWrittenResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.FILE_WRITTEN),
  payload: z.object({
    filePath: z.string(),
    success: z.boolean(),
  }),
});

export const DiffAppliedResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.DIFF_APPLIED),
  payload: z.object({
    filePath: z.string(),
    success: z.boolean(),
  }),
});

export const FileTreeResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.FILE_TREE),
  payload: z.object({
    tree: z.array(z.any()), // Will be typed by FileTree schema
  }),
});

export const SearchResultsResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.SEARCH_RESULTS),
  payload: z.object({
    results: z.array(
      z.object({
        filePath: z.string(),
        matches: z.array(
          z.object({
            line: z.number(),
            column: z.number(),
            text: z.string(),
          })
        ),
      })
    ),
  }),
});

export const ErrorResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.ERROR),
  payload: z.object({
    requestId: z.string().optional(),
    error: z.string(),
    details: z.string().optional(),
  }),
});

export const AgentStateChangedResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.AGENT_STATE_CHANGED),
  payload: z.object({
    state: z.any(), // Will be typed by AgentState schema
  }),
});

export const ProgressUpdateResponseSchema = BaseMessageSchema.extend({
  type: z.literal(ResponseTypes.PROGRESS_UPDATE),
  payload: z.object({
    taskId: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().optional(),
  }),
});

export const MessageFromExtensionSchema = z.discriminatedUnion('type', [
  MessageResponseSchema,
  ConversationDataResponseSchema,
  ConversationsListResponseSchema,
  ConversationCreatedResponseSchema,
  ConversationDeletedResponseSchema,
  WorkspaceInfoResponseSchema,
  CommandOutputResponseSchema,
  FileContentResponseSchema,
  FileWrittenResponseSchema,
  DiffAppliedResponseSchema,
  FileTreeResponseSchema,
  SearchResultsResponseSchema,
  ErrorResponseSchema,
  AgentStateChangedResponseSchema,
  ProgressUpdateResponseSchema,
]);

/**
 * TypeScript types inferred from Zod schemas
 */
export type MessageToExtension = z.infer<typeof MessageToExtensionSchema>;
export type MessageFromExtension = z.infer<typeof MessageFromExtensionSchema>;

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type GetConversationRequest = z.infer<typeof GetConversationRequestSchema>;
export type GetConversationsRequest = z.infer<typeof GetConversationsRequestSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type DeleteConversationRequest = z.infer<typeof DeleteConversationRequestSchema>;
export type GetWorkspaceInfoRequest = z.infer<typeof GetWorkspaceInfoRequestSchema>;
export type ExecuteCommandRequest = z.infer<typeof ExecuteCommandRequestSchema>;
export type ReadFileRequest = z.infer<typeof ReadFileRequestSchema>;
export type WriteFileRequest = z.infer<typeof WriteFileRequestSchema>;
export type ApplyDiffRequest = z.infer<typeof ApplyDiffRequestSchema>;
export type GetFileTreeRequest = z.infer<typeof GetFileTreeRequestSchema>;
export type SearchFilesRequest = z.infer<typeof SearchFilesRequestSchema>;
export type CancelRequest = z.infer<typeof CancelRequestSchema>;

export type MessageResponse = z.infer<typeof MessageResponseSchema>;
export type ConversationDataResponse = z.infer<typeof ConversationDataResponseSchema>;
export type ConversationsListResponse = z.infer<typeof ConversationsListResponseSchema>;
export type ConversationCreatedResponse = z.infer<typeof ConversationCreatedResponseSchema>;
export type ConversationDeletedResponse = z.infer<typeof ConversationDeletedResponseSchema>;
export type WorkspaceInfoResponse = z.infer<typeof WorkspaceInfoResponseSchema>;
export type CommandOutputResponse = z.infer<typeof CommandOutputResponseSchema>;
export type FileContentResponse = z.infer<typeof FileContentResponseSchema>;
export type FileWrittenResponse = z.infer<typeof FileWrittenResponseSchema>;
export type DiffAppliedResponse = z.infer<typeof DiffAppliedResponseSchema>;
export type FileTreeResponse = z.infer<typeof FileTreeResponseSchema>;
export type SearchResultsResponse = z.infer<typeof SearchResultsResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type AgentStateChangedResponse = z.infer<typeof AgentStateChangedResponseSchema>;
export type ProgressUpdateResponse = z.infer<typeof ProgressUpdateResponseSchema>;
