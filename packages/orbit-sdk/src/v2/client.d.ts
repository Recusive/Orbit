/* eslint-disable @typescript-eslint/array-type */

export interface ApiError {
  name: 'APIError';
  data: {
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    metadata?: Record<string, string>;
  };
}

export interface ProviderAuthError {
  name: 'ProviderAuthError';
  data: {
    providerID: string;
    message: string;
  };
}

export interface UnknownError {
  name: 'UnknownError';
  data: {
    message: string;
  };
}

export interface MessageAbortedError {
  name: 'MessageAbortedError';
  data: {
    message: string;
  };
}

export interface StructuredOutputError {
  name: 'StructuredOutputError';
  data: {
    message: string;
    retries: number;
  };
}

export interface ContextOverflowError {
  name: 'ContextOverflowError';
  data: {
    message: string;
    responseBody?: string;
  };
}

export interface MessageOutputLengthError {
  name: 'MessageOutputLengthError';
  data: Record<string, unknown>;
}

export interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
  status?: 'added' | 'deleted' | 'modified';
}

export interface OutputFormatText {
  type: 'text';
}

export interface OutputFormatJsonSchema {
  type: 'json_schema';
  schema: Record<string, unknown>;
  retryCount?: number;
}

export type OutputFormat = OutputFormatText | OutputFormatJsonSchema;

export interface UserMessage {
  id: string;
  sessionID: string;
  role: 'user';
  time: {
    created: number;
  };
  format?: OutputFormat;
  summary?: {
    title?: string;
    body?: string;
    diffs: FileDiff[];
  };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
  system?: string;
  tools?: Record<string, boolean>;
  variant?: string;
}

export interface AssistantMessage {
  id: string;
  sessionID: string;
  role: 'assistant';
  time: {
    created: number;
    completed?: number;
  };
  error?:
    | ProviderAuthError
    | UnknownError
    | MessageOutputLengthError
    | MessageAbortedError
    | StructuredOutputError
    | ContextOverflowError
    | ApiError;
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  agent: string;
  path: {
    cwd: string;
    root: string;
  };
  summary?: boolean;
  cost: number;
  tokens: {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  structured?: unknown;
  variant?: string;
  finish?: string;
}

export type Message = UserMessage | AssistantMessage;

export interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text';
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: {
    start: number;
    end?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface SubtaskPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'subtask';
  prompt: string;
  description: string;
  agent: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  command?: string;
}

export interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'reasoning';
  text: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end?: number;
  };
}

export interface FilePartSourceText {
  value: string;
  start: number;
  end: number;
}

export interface FilePartSource {
  text: FilePartSourceText;
  type: 'file' | 'symbol' | 'resource';
  path?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  name?: string;
  kind?: number;
  clientName?: string;
  uri?: string;
}

export interface FilePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
}

export interface FilePartInput {
  id?: string;
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
}

export interface ToolStatePending {
  status: 'pending';
  input: Record<string, unknown>;
  raw: string;
}

export interface ToolStateRunning {
  status: 'running';
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
  };
}

export interface ToolStateCompleted {
  status: 'completed';
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
  attachments?: FilePart[];
}

export interface ToolStateError {
  status: 'error';
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end: number;
  };
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

export interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'tool';
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: Record<string, unknown>;
}

export interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'step-start';
  snapshot?: string;
}

export interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'step-finish';
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}

export interface SnapshotPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'snapshot';
  snapshot: string;
}

export interface PatchPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'patch';
  hash: string;
  files: string[];
}

export interface AgentPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'agent';
  name: string;
  source?: {
    value: string;
    start: number;
    end: number;
  };
}

export interface RetryPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'retry';
  attempt: number;
  error: ApiError;
  time: {
    created: number;
  };
}

export interface CompactionPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'compaction';
  auto: boolean;
  overflow?: boolean;
}

export type Part =
  | TextPart
  | SubtaskPart
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart;

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

export type SessionStatus =
  | { type: 'idle' }
  | { type: 'busy' }
  | { type: 'retry'; attempt: number; message: string; next: number };

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

export type QuestionAnswer = string[];

export interface Session {
  id: string;
  slug: string;
  projectID: string;
  workspaceID?: string;
  directory: string;
  parentID?: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
    diffs?: FileDiff[];
  };
  share?: {
    url: string;
  };
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;
  };
  permission?: Array<{
    permission: string;
    pattern: string;
    action: 'allow' | 'deny' | 'ask';
  }>;
  revert?: {
    messageID: string;
    partID?: string;
    snapshot?: string;
    diff?: string;
  };
}

export interface EventMessageUpdated {
  type: 'message.updated';
  properties: {
    info: Message;
  };
}

export interface EventMessageRemoved {
  type: 'message.removed';
  properties: {
    sessionID: string;
    messageID: string;
  };
}

export interface EventMessagePartUpdated {
  type: 'message.part.updated';
  properties: {
    part: Part;
  };
}

export interface EventMessagePartDelta {
  type: 'message.part.delta';
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  };
}

export interface EventMessagePartRemoved {
  type: 'message.part.removed';
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
  };
}

export interface EventPermissionAsked {
  type: 'permission.asked';
  properties: PermissionRequest;
}

export interface EventPermissionReplied {
  type: 'permission.replied';
  properties: {
    sessionID: string;
    requestID: string;
    reply: 'once' | 'always' | 'reject';
  };
}

export interface EventSessionStatus {
  type: 'session.status';
  properties: {
    sessionID: string;
    status: SessionStatus;
  };
}

export interface EventSessionIdle {
  type: 'session.idle';
  properties: {
    sessionID: string;
  };
}

export interface EventQuestionAsked {
  type: 'question.asked';
  properties: QuestionRequest;
}

export interface EventQuestionReplied {
  type: 'question.replied';
  properties: {
    sessionID: string;
    requestID: string;
    answers: QuestionAnswer[];
  };
}

export interface EventQuestionRejected {
  type: 'question.rejected';
  properties: {
    sessionID: string;
    requestID: string;
  };
}

export interface EventSessionCompacted {
  type: 'session.compacted';
  properties: {
    sessionID: string;
  };
}

export interface EventFileEdited {
  type: 'file.edited';
  properties: {
    file: string;
  };
}

export interface EventSessionCreated {
  type: 'session.created';
  properties: {
    info: Session;
  };
}

export interface EventSessionUpdated {
  type: 'session.updated';
  properties: {
    info: Session;
  };
}

export interface EventSessionDeleted {
  type: 'session.deleted';
  properties: {
    info: Session;
  };
}

export interface EventSessionError {
  type: 'session.error';
  properties: {
    sessionID?: string;
    error?:
      | ProviderAuthError
      | UnknownError
      | MessageOutputLengthError
      | MessageAbortedError
      | StructuredOutputError
      | ContextOverflowError
      | ApiError;
  };
}

export type Event =
  | EventSessionCreated
  | EventSessionUpdated
  | EventSessionDeleted
  | EventSessionStatus
  | EventSessionIdle
  | EventSessionError
  | EventMessageUpdated
  | EventMessageRemoved
  | EventMessagePartUpdated
  | EventMessagePartDelta
  | EventMessagePartRemoved
  | EventPermissionAsked
  | EventPermissionReplied
  | EventQuestionAsked
  | EventQuestionReplied
  | EventQuestionRejected
  | EventSessionCompacted
  | EventFileEdited;

export interface GlobalEvent {
  directory: string;
  payload: Event;
}

export interface ProviderAuthMethod {
  type: 'oauth' | 'api';
  label: string;
}

export interface ProviderAuthAuthorization {
  url: string;
  method: 'auto' | 'code';
  instructions: string;
}

export interface ProviderListResponses {
  200: {
    all: Array<{
      id: string;
      name: string;
      env: string[];
      source?: 'env' | 'config' | 'custom' | 'api';
      options?: Record<string, unknown>;
      models: Record<
        string,
        {
          id: string;
          name: string;
          capabilities: {
            temperature: boolean;
            reasoning: boolean;
            attachment: boolean;
            toolcall: boolean;
            input: {
              text: boolean;
              audio: boolean;
              image: boolean;
              video: boolean;
              pdf: boolean;
            };
            output: {
              text: boolean;
              audio: boolean;
              image: boolean;
              video: boolean;
              pdf: boolean;
            };
            interleaved: boolean | { field: 'reasoning_content' | 'reasoning_details' };
          };
          limit: {
            context: number;
            input?: number;
            output: number;
          };
          variants?: Record<string, Record<string, unknown>>;
        }
      >;
    }>;
    default: Record<string, string>;
    connected: string[];
  };
}

export interface SessionMessagesResponses {
  200: Array<{
    info: Message;
    parts: Part[];
  }>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: unknown;
}

export interface SseResponse<T> {
  stream: AsyncIterable<T>;
}

export interface OrbitClient {
  global: {
    event(options?: {
      signal?: AbortSignal;
      throwOnError?: boolean;
    }): Promise<SseResponse<GlobalEvent>>;
  };
  session: {
    list(
      parameters?: { directory?: string; workspace?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session[]>>;
    create(
      parameters?: { directory?: string; workspace?: string; title?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session>>;
    update(
      parameters: { sessionID: string; title?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session>>;
    get(
      parameters: { sessionID: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session>>;
    fork(
      parameters: { sessionID: string; directory?: string; workspace?: string; messageID?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session>>;
    delete(
      parameters: { sessionID: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
    messages(
      parameters: { sessionID: string; limit?: number },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<SessionMessagesResponses[200]>>;
    promptAsync(
      parameters: {
        sessionID: string;
        messageID?: string;
        model?: { providerID: string; modelID: string };
        agent?: string;
        variant?: string;
        parts: Array<{ type: 'text'; text: string } | FilePartInput>;
      },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
    abort(
      parameters: { sessionID: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
    revert(
      parameters: {
        sessionID: string;
        directory?: string;
        workspace?: string;
        messageID?: string;
        partID?: string;
      },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session>>;
    unrevert(
      parameters: { sessionID: string; directory?: string; workspace?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Session>>;
    summarize(
      parameters: { sessionID: string; providerID: string; modelID: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
  };
  permission: {
    reply(
      parameters: { requestID: string; reply?: 'once' | 'always' | 'reject'; message?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
  };
  question: {
    reply(
      parameters: { requestID: string; answers?: QuestionAnswer[] },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
    reject(
      parameters: { requestID: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
  };
  provider: {
    list(
      parameters?: { directory?: string; workspace?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<ProviderListResponses[200]>>;
    auth(
      parameters?: { directory?: string; workspace?: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<Record<string, ProviderAuthMethod[]>>>;
    oauth: {
      authorize(
        parameters: { providerID: string; method: number },
        options?: { throwOnError?: boolean }
      ): Promise<ApiResponse<ProviderAuthAuthorization>>;
      callback(
        parameters: { providerID: string; method?: number; code?: string },
        options?: { throwOnError?: boolean }
      ): Promise<ApiResponse<boolean>>;
    };
  };
  auth: {
    set(
      parameters: { providerID: string; auth: { type: 'api'; key: string } },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
    remove(
      parameters: { providerID: string },
      options?: { throwOnError?: boolean }
    ): Promise<ApiResponse<boolean>>;
  };
}

export interface OrbitClientConfig {
  baseUrl?: string;
  directory?: string;
}

export function createOrbitClient(config?: OrbitClientConfig): OrbitClient;
