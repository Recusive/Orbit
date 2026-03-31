# Vercel Frontend Data Layer Implementation Plan (Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend data layer — Zod schemas, 3 Zustand stores, event listener hook, log stream hook, API wrappers, and barrel files.

**Architecture:** Types flow from Zod schemas (shared-schemas) → inferred TS types → Zustand stores → React components. Events arrive via Tauri event system (status) and `tauri::ipc::Channel` (log batches). Three stores isolate connection, deployment, and log state to prevent cross-concern re-renders.

**Tech Stack:** TypeScript, Zod 4, Zustand + Immer, Tauri API (`@tauri-apps/api/core`)

**Spec:** `docs/superpowers/specs/2026-03-31-vercel-deployments-backend-design.md` — Section 6

**Depends on:** Plan 3 (Tauri Commands)
**Blocks:** UI implementation (deferred)

---

### Task 1: Extract ListenerAbortController to shared utility

**Files:**

- Create: `apps/agent/src/lib/tauri-listener-controller.ts`
- Modify: `apps/agent/src/providers/tauri-provider.tsx`

- [ ] **Step 1: Create shared utility**

Create `apps/agent/src/lib/tauri-listener-controller.ts`:

```typescript
import { createLogger } from '@orbit/common/lib';

const logger = createLogger('ListenerController');

/**
 * Manages Tauri event listener lifecycle with safe cleanup.
 * Handles race conditions where component unmounts before all
 * listen() promises resolve.
 */
export class ListenerAbortController {
  private _aborted = false;
  private _unlistenFns: (() => void)[] = [];

  isAborted(): boolean {
    return this._aborted;
  }

  abort(): void {
    this._aborted = true;
  }

  addUnlisten(fn: () => void): void {
    if (this._aborted) {
      fn();
    } else {
      this._unlistenFns.push(fn);
    }
  }

  cleanup(): void {
    this._aborted = true;
    for (const unlisten of this._unlistenFns) {
      try {
        unlisten();
      } catch (err: unknown) {
        logger.error(
          'Error during listener cleanup',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
    this._unlistenFns = [];
  }
}
```

- [ ] **Step 2: Update tauri-provider.tsx to import from shared utility**

In `apps/agent/src/providers/tauri-provider.tsx`, replace the inline `ListenerAbortController` class with:

```typescript
import { ListenerAbortController } from '@/lib/tauri-listener-controller';
```

Remove the inline class definition (lines ~116-152).

- [ ] **Step 3: Verify existing functionality**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/lib/tauri-listener-controller.ts apps/agent/src/providers/tauri-provider.tsx
git commit -m "refactor: extract ListenerAbortController to shared utility"
```

---

### Task 2: Create Zod schemas

**Files:**

- Create: `packages/shared-schemas/src/vercel/vercel.ts`
- Create: `packages/shared-schemas/src/vercel/index.ts`
- Modify: `packages/shared-schemas/src/index.ts`

- [ ] **Step 1: Write Zod schemas**

Create `packages/shared-schemas/src/vercel/vercel.ts`:

```typescript
import { z } from 'zod';

// ============================================
// Enums
// ============================================

// SCREAMING_SNAKE_CASE enum — serde default for unit variants
export const DeploymentStateSchema = z.enum([
  'QUEUED',
  'BUILDING',
  'INITIALIZING',
  'READY',
  'ERROR',
  'CANCELED',
  'DELETED',
  'UNKNOWN',
]);
export type DeploymentState = z.infer<typeof DeploymentStateSchema>;

// SCREAMING_SNAKE_CASE enum
export const ReadySubstateSchema = z.enum(['STAGED', 'ROLLING', 'PROMOTED', 'UNKNOWN']);
export type ReadySubstate = z.infer<typeof ReadySubstateSchema>;

// lowercase enum — serde(rename_all = "lowercase")
export const DeploymentTargetSchema = z.enum(['production', 'staging', 'unknown']);
export type DeploymentTarget = z.infer<typeof DeploymentTargetSchema>;

// kebab-case enum — serde(rename_all = "kebab-case")
export const DeploymentSourceSchema = z.enum([
  'git',
  'cli',
  'redeploy',
  'api-trigger-git-deploy',
  'clone/repo',
  'import',
  'import/repo',
  'v0-web',
  'unknown',
]);
export type DeploymentSource = z.infer<typeof DeploymentSourceSchema>;

// lowercase enum
export const LinkTypeSchema = z.enum(['github', 'gitlab', 'bitbucket', 'unknown']);
export type LinkType = z.infer<typeof LinkTypeSchema>;

// kebab-case enum
export const LogEventTypeSchema = z.enum([
  'command',
  'stdout',
  'stderr',
  'exit',
  'deployment-state',
  'fatal',
  'delimiter',
  'middleware',
  'middleware-invocation',
  'edge-function-invocation',
  'metric',
  'report',
  'unknown',
]);
export type LogEventType = z.infer<typeof LogEventTypeSchema>;

export const DeploymentActionSchema = z.enum(['cancel', 'redeploy', 'promote', 'rollback']);
export type DeploymentAction = z.infer<typeof DeploymentActionSchema>;

// ============================================
// Structs
// Note: Field names are camelCase to match Rust #[serde(rename_all = "camelCase")]
// Rust serde aliases normalize: frontend always receives "created" (not "createdAt"),
// "state" (not "readyState").
//
// .strict() is correct here: data arrives from Rust serde (which strips unknown
// fields before serializing to JSON), not directly from the Vercel API. Any
// unexpected key indicates a serde/schema mismatch we want to catch early.
// ============================================

export const PaginationSchema = z
  .object({
    next: z.number().nullable(),
    prev: z.number().nullable(),
    count: z.number().int(),
  })
  .strict();
export type Pagination = z.infer<typeof PaginationSchema>;

export const CreatorSchema = z
  .object({
    uid: z.string(),
    email: z.string().nullish(),
    username: z.string().nullish(),
    githubLogin: z.string().nullish(),
  })
  .strict();
export type Creator = z.infer<typeof CreatorSchema>;

export const ProjectLinkSchema = z
  .object({
    type: LinkTypeSchema,
    org: z.string(),
    repo: z.string(),
    branch: z.string().nullish(),
  })
  .strict();
export type ProjectLink = z.infer<typeof ProjectLinkSchema>;

export const DeploymentSchema = z
  .object({
    uid: z.string(),
    name: z.string(),
    url: z.string().nullish(),
    state: DeploymentStateSchema.nullish(),
    readySubstate: ReadySubstateSchema.nullish(),
    target: DeploymentTargetSchema.nullable(),
    created: z.number(),
    ready: z.number().nullish(),
    buildingAt: z.number().nullish(),
    source: DeploymentSourceSchema.nullish(),
    creator: CreatorSchema,
    meta: z.record(z.string()).default({}),
    inspectorUrl: z.string().nullish(),
    alias: z.array(z.string()).default([]),
    projectId: z.string(),
    isRollbackCandidate: z.boolean().nullish(),
    errorCode: z.string().nullish(),
    errorMessage: z.string().nullish(),
    checksState: z.string().nullish(),
    checksConclusion: z.string().nullish(),
  })
  .strict();
export type Deployment = z.infer<typeof DeploymentSchema>;

export const DeploymentListResponseSchema = z
  .object({
    deployments: z.array(DeploymentSchema),
    pagination: PaginationSchema,
  })
  .strict();
export type DeploymentListResponse = z.infer<typeof DeploymentListResponseSchema>;

export const ProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    framework: z.string().nullish(),
    link: ProjectLinkSchema.nullish(),
    latestDeployments: z.array(DeploymentSchema).nullish(),
    updatedAt: z.number(),
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectListResponseSchema = z
  .object({
    projects: z.array(ProjectSchema),
    pagination: PaginationSchema,
  })
  .strict();
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

export const TeamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  })
  .strict();
export type Team = z.infer<typeof TeamSchema>;

export const LogEventInfoSchema = z
  .object({
    name: z.string().nullish(),
    type: z.string().nullish(),
    entrypoint: z.string().nullish(),
    path: z.string().nullish(),
    step: z.string().nullish(),
  })
  .strict();
export type LogEventInfo = z.infer<typeof LogEventInfoSchema>;

export const LogEventSchema = z
  .object({
    type: LogEventTypeSchema,
    created: z.number(),
    text: z.string().default(''),
    serial: z.string().nullish(),
    deploymentId: z.string().nullish(),
    level: z.string().nullish(),
    info: LogEventInfoSchema.nullish(),
    id: z.string().nullish(),
    date: z.number().nullish(),
  })
  .strict();
export type LogEvent = z.infer<typeof LogEventSchema>;

export const VercelUserSchema = z
  .object({
    uid: z.string(),
    email: z.string().nullish(),
    username: z.string().nullish(),
    name: z.string().nullish(),
  })
  .strict();
export type VercelUser = z.infer<typeof VercelUserSchema>;

export const VercelTokenResultSchema = z
  .object({
    user: VercelUserSchema,
    teams: z.array(TeamSchema),
    hasDeploymentAccess: z.boolean(),
  })
  .strict();
export type VercelTokenResult = z.infer<typeof VercelTokenResultSchema>;

export const VercelConnectionStatusSchema = z
  .object({
    connected: z.boolean(),
    user: VercelUserSchema.nullable(),
    linkedProject: ProjectSchema.nullable(),
    team: TeamSchema.nullable(),
    hasDeploymentAccess: z.boolean(),
  })
  .strict();
export type VercelConnectionStatus = z.infer<typeof VercelConnectionStatusSchema>;
```

- [ ] **Step 2: Create barrel export**

Create `packages/shared-schemas/src/vercel/index.ts`:

```typescript
export * from './vercel';
```

- [ ] **Step 3: Add to root barrel**

In `packages/shared-schemas/src/index.ts`, add:

```typescript
export * from './vercel';
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared-schemas/src/vercel/ packages/shared-schemas/src/index.ts
git commit -m "feat(vercel): add Zod schemas for all Vercel API types"
```

---

### Task 3: Create the 3 Zustand stores

**Files:**

- Create: `apps/agent/src/stores/integrations/vercel-connection-store.ts`
- Create: `apps/agent/src/stores/integrations/vercel-deployment-store.ts`
- Create: `apps/agent/src/stores/integrations/vercel-log-store.ts`
- Create: `apps/agent/src/stores/integrations/index.ts`
- Modify: `apps/agent/src/stores/index.ts`

- [ ] **Step 1: Write connection store**

Create `apps/agent/src/stores/integrations/vercel-connection-store.ts`:

```typescript
import type { Project, Team, VercelUser } from '@orbit/shared-schemas';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Named "Phase" to avoid collision with VercelConnectionStatus (Zod object schema in shared-schemas)
export type VercelConnectionPhase = 'disconnected' | 'revalidating' | 'connected';

interface VercelConnectionState {
  status: VercelConnectionPhase;
  user: VercelUser | null;
  teams: Team[];
  selectedTeam: Team | null;
  linkedProject: Project | null;
  hasDeploymentAccess: boolean;
  error: string | null;

  setRevalidating: () => void;
  setConnected: (user: VercelUser, teams: Team[], hasDeploymentAccess: boolean) => void;
  setDisconnected: () => void;
  setTeam: (team: Team | null) => void;
  setLinkedProject: (project: Project | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  status: 'disconnected' as VercelConnectionPhase,
  user: null,
  teams: [] as Team[],
  selectedTeam: null,
  linkedProject: null,
  hasDeploymentAccess: false,
  error: null,
};

export const useVercelConnectionStore = create<VercelConnectionState>()(
  immer((set) => ({
    ...INITIAL_STATE,

    setRevalidating: (): void => {
      set((state) => {
        state.status = 'revalidating';
      });
    },

    setConnected: (user, teams, hasDeploymentAccess): void => {
      set((state) => {
        state.status = 'connected';
        state.user = user;
        state.teams = teams;
        state.hasDeploymentAccess = hasDeploymentAccess;
        state.error = null;
      });
    },

    setDisconnected: (): void => {
      set((state) => {
        state.status = 'disconnected';
        state.user = null;
        state.linkedProject = null;
        state.error = null;
      });
    },

    setTeam: (team): void => {
      set((state) => {
        state.selectedTeam = team;
      });
    },

    setLinkedProject: (project): void => {
      set((state) => {
        state.linkedProject = project;
      });
    },

    setError: (error): void => {
      set((state) => {
        state.error = error;
      });
    },

    reset: (): void => {
      set(() => ({ ...INITIAL_STATE }));
    },
  }))
);

// Granular selector hooks
export const useVercelStatus = (): VercelConnectionPhase =>
  useVercelConnectionStore((s) => s.status);
export const useVercelUser = (): VercelUser | null => useVercelConnectionStore((s) => s.user);
export const useVercelTeams = (): Team[] => useVercelConnectionStore((s) => s.teams);
export const useVercelSelectedTeam = (): Team | null =>
  useVercelConnectionStore((s) => s.selectedTeam);
export const useVercelLinkedProject = (): Project | null =>
  useVercelConnectionStore((s) => s.linkedProject);
export const useVercelHasDeploymentAccess = (): boolean =>
  useVercelConnectionStore((s) => s.hasDeploymentAccess);
export const useVercelConnectionError = (): string | null =>
  useVercelConnectionStore((s) => s.error);
```

- [ ] **Step 2: Write deployment store**

Create `apps/agent/src/stores/integrations/vercel-deployment-store.ts`:

```typescript
import type { Deployment, DeploymentState } from '@orbit/shared-schemas';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const EMPTY_DEPLOYMENTS: Deployment[] = [];

interface VercelDeploymentState {
  deployments: Deployment[];
  selectedDeploymentId: string | null;
  isLoading: boolean;
  isPolling: boolean;
  lastUpdatedAt: number | null;
  pollError: string | null;

  setDeployments: (deployments: Deployment[], lastUpdatedAt: number) => void;
  setSelectedDeployment: (id: string | null) => void;
  updateDeploymentState: (deploymentId: string, newState: DeploymentState) => void;
  setIsLoading: (loading: boolean) => void;
  setIsPolling: (polling: boolean) => void;
  setPollError: (error: string | null) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  deployments: EMPTY_DEPLOYMENTS,
  selectedDeploymentId: null,
  isLoading: false,
  isPolling: false,
  lastUpdatedAt: null,
  pollError: null,
};

export const useVercelDeploymentStore = create<VercelDeploymentState>()(
  immer((set) => ({
    ...INITIAL_STATE,

    setDeployments: (deployments, lastUpdatedAt): void => {
      set((state) => {
        // Full replace, sorted by created descending
        state.deployments = [...deployments].sort((a, b) => b.created - a.created);
        state.lastUpdatedAt = lastUpdatedAt;
        state.pollError = null;
      });
    },

    setSelectedDeployment: (id): void => {
      set((state) => {
        state.selectedDeploymentId = id;
      });
    },

    updateDeploymentState: (deploymentId, newState): void => {
      set((state) => {
        const deployment = state.deployments.find((d) => d.uid === deploymentId);
        if (deployment) {
          deployment.state = newState;
        }
      });
    },

    setIsLoading: (loading): void => {
      set((state) => {
        state.isLoading = loading;
      });
    },

    setIsPolling: (polling): void => {
      set((state) => {
        state.isPolling = polling;
      });
    },

    setPollError: (error): void => {
      set((state) => {
        state.pollError = error;
      });
    },

    reset: (): void => {
      set(() => ({ ...INITIAL_STATE }));
    },
  }))
);

// Granular selector hooks
export const useVercelDeployments = (): Deployment[] =>
  useVercelDeploymentStore((s) => s.deployments);
export const useSelectedDeploymentId = (): string | null =>
  useVercelDeploymentStore((s) => s.selectedDeploymentId);
export const useVercelIsLoading = (): boolean => useVercelDeploymentStore((s) => s.isLoading);
export const useVercelIsPolling = (): boolean => useVercelDeploymentStore((s) => s.isPolling);
export const useVercelLastUpdated = (): number | null =>
  useVercelDeploymentStore((s) => s.lastUpdatedAt);
export const useVercelPollError = (): string | null => useVercelDeploymentStore((s) => s.pollError);
```

- [ ] **Step 3: Write log store**

Create `apps/agent/src/stores/integrations/vercel-log-store.ts`:

```typescript
import type { LogEvent } from '@orbit/shared-schemas';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const EMPTY_LOG_EVENTS: LogEvent[] = [];
const MAX_LOG_EVENTS = 10_000;

interface VercelLogState {
  logEvents: LogEvent[];
  isStreamingLogs: boolean;
  activeDeploymentId: string | null;
  streamError: string | null;
  truncatedCount: number;

  appendLogBatch: (events: LogEvent[]) => void;
  clearLogs: () => void;
  setStreamingLogs: (streaming: boolean) => void;
  setActiveDeployment: (id: string | null) => void;
  setStreamError: (error: string | null) => void;
}

const INITIAL_STATE = {
  logEvents: EMPTY_LOG_EVENTS,
  isStreamingLogs: false,
  activeDeploymentId: null,
  streamError: null,
  truncatedCount: 0,
};

export const useVercelLogStore = create<VercelLogState>()(
  immer((set) => ({
    ...INITIAL_STATE,

    appendLogBatch: (events): void => {
      set((state) => {
        state.logEvents.push(...events);

        // Cap at MAX_LOG_EVENTS, truncate from front
        if (state.logEvents.length > MAX_LOG_EVENTS) {
          const overflow = state.logEvents.length - MAX_LOG_EVENTS;
          state.logEvents.splice(0, overflow);
          state.truncatedCount += overflow;
        }
      });
    },

    clearLogs: (): void => {
      set((state) => {
        state.logEvents = EMPTY_LOG_EVENTS;
        state.truncatedCount = 0;
        state.streamError = null;
      });
    },

    setStreamingLogs: (streaming): void => {
      set((state) => {
        state.isStreamingLogs = streaming;
      });
    },

    setActiveDeployment: (id): void => {
      set((state) => {
        state.activeDeploymentId = id;
      });
    },

    setStreamError: (error): void => {
      set((state) => {
        state.streamError = error;
        if (error !== null) {
          state.isStreamingLogs = false;
        }
      });
    },
  }))
);

// Granular selector hooks
export const useVercelLogEvents = (): LogEvent[] => useVercelLogStore((s) => s.logEvents);
export const useIsStreamingLogs = (): boolean => useVercelLogStore((s) => s.isStreamingLogs);
export const useVercelActiveDeploymentId = (): string | null =>
  useVercelLogStore((s) => s.activeDeploymentId);
export const useVercelStreamError = (): string | null => useVercelLogStore((s) => s.streamError);
export const useVercelTruncatedCount = (): number => useVercelLogStore((s) => s.truncatedCount);
```

- [ ] **Step 4: Create barrel files**

Create `apps/agent/src/stores/integrations/index.ts`:

```typescript
export * from './vercel-connection-store';
export * from './vercel-deployment-store';
export * from './vercel-log-store';
```

Add to `apps/agent/src/stores/index.ts`:

```typescript
export * from './integrations';
```

- [ ] **Step 5: Verify**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/stores/integrations/ apps/agent/src/stores/index.ts
git commit -m "feat(vercel): add 3 Zustand stores (connection, deployment, log) with selectors"
```

---

### Task 4: Create API wrappers

**Files:**

- Create: `apps/agent/src/lib/api/vercel.ts`

- [ ] **Step 1: Write API wrappers**

Create `apps/agent/src/lib/api/vercel.ts`:

```typescript
import type {
  Deployment,
  DeploymentAction,
  DeploymentListResponse,
  DeploymentState,
  DeploymentTarget,
  Project,
  ProjectListResponse,
  VercelConnectionStatus,
  VercelTokenResult,
} from '@orbit/shared-schemas';

import { invoke } from './core';

/** Typed filter parameters for deployment list queries */
interface DeploymentFilters {
  projectId?: string;
  state?: DeploymentState;
  target?: DeploymentTarget;
  branch?: string;
  limit?: number;
}

export async function storeVercelToken(
  token: string,
  workspacePath: string
): Promise<VercelTokenResult> {
  return invoke<VercelTokenResult>('vercel_store_token', { token, workspacePath });
}

export async function getVercelStatus(): Promise<VercelConnectionStatus> {
  return invoke<VercelConnectionStatus>('vercel_get_status');
}

export async function disconnectVercel(workspacePath: string): Promise<void> {
  return invoke<void>('vercel_disconnect', { workspacePath });
}

export async function selectVercelTeam(teamId: string): Promise<void> {
  return invoke<void>('vercel_select_team', { teamId });
}

export async function listVercelDeployments(
  projectId?: string,
  filters?: DeploymentFilters
): Promise<DeploymentListResponse> {
  return invoke<DeploymentListResponse>('vercel_list_deployments', {
    projectId,
    filters,
  });
}

export async function getVercelDeployment(deploymentId: string): Promise<Deployment> {
  return invoke<Deployment>('vercel_get_deployment', { deploymentId });
}

export async function vercelDeploymentAction(
  deploymentId: string,
  action: DeploymentAction,
  confirmed: boolean
): Promise<Deployment | null> {
  return invoke<Deployment | null>('vercel_deployment_action', {
    deploymentId,
    action,
    confirmed,
  });
}

export async function listVercelProjects(): Promise<ProjectListResponse> {
  return invoke<ProjectListResponse>('vercel_list_projects');
}

export async function startVercelPolling(projectId: string): Promise<void> {
  return invoke<void>('vercel_start_polling', { projectId });
}

export async function stopVercelPolling(): Promise<void> {
  return invoke<void>('vercel_stop_polling');
}

export async function autoDetectVercelProject(workspacePath: string): Promise<Project | null> {
  return invoke<Project | null>('vercel_auto_detect', { workspacePath });
}

export async function linkVercelProject(projectId: string): Promise<Project> {
  return invoke<Project>('vercel_link_project', { projectId });
}

export async function revalidateVercelOnOpen(workspacePath: string): Promise<void> {
  return invoke<void>('vercel_revalidate_on_open', { workspacePath });
}

// Note: vercel_stream_logs and vercel_stop_log_stream are called
// directly from useVercelLogStream hook (they use Channel<T>)
```

- [ ] **Step 2: Create type re-exports**

Create `apps/agent/src/types/vercel.ts`:

```typescript
/**
 * Forward-declaration of Vercel types for UI component imports.
 * Components should import from '@/types/vercel' (not '@orbit/shared-schemas' directly)
 * to keep the dependency graph shallow. If nothing imports this file yet, Knip will
 * flag it — that's expected until UI components land.
 */
export type {
  Deployment,
  DeploymentAction,
  DeploymentListResponse,
  DeploymentSource,
  DeploymentState,
  DeploymentTarget,
  LogEvent,
  LogEventInfo,
  LogEventType,
  Project,
  ProjectLink,
  ProjectListResponse,
  Team,
  VercelConnectionStatus,
  VercelTokenResult,
  VercelUser,
} from '@orbit/shared-schemas';
```

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/lib/api/vercel.ts apps/agent/src/types/vercel.ts
git commit -m "feat(vercel): add API wrappers and type re-exports"
```

---

### Task 5: Create event listener and log stream hooks

**Files:**

- Create: `apps/agent/src/hooks/integrations/use-vercel-events.ts`
- Create: `apps/agent/src/hooks/integrations/use-vercel-log-stream.ts`
- Create: `apps/agent/src/hooks/integrations/index.ts`
- Modify: `apps/agent/src/hooks/index.ts`

- [ ] **Step 1: Write event listener hook**

Create `apps/agent/src/hooks/integrations/use-vercel-events.ts`:

```typescript
import type { Deployment, DeploymentState } from '@orbit/shared-schemas';

import { useEffect } from 'react';

import { listen } from '@/lib/api/core';
import { ListenerAbortController } from '@/lib/tauri-listener-controller';
import { autoDetectVercelProject } from '@/lib/api/vercel';
import { useVercelConnectionStore } from '@/stores/integrations/vercel-connection-store';
import { useVercelDeploymentStore } from '@/stores/integrations/vercel-deployment-store';
import { useVercelLogStore } from '@/stores/integrations/vercel-log-store';
import { createLogger } from '@orbit/common/lib';

const logger = createLogger('VercelEvents');

export function useVercelEvents(workspacePath: string): void {
  useEffect(() => {
    const controller = new ListenerAbortController();

    // Deployment polling events
    // Note: @/lib/api/core listen() unwraps .payload — access fields directly on event
    listen<{ deployments: Deployment[]; lastUpdatedAt: number }>(
      'vercel:deployments_updated',
      (event) => {
        // Connected-state guard: drop stale updates during disconnect
        if (useVercelConnectionStore.getState().status !== 'connected') {
          return;
        }
        useVercelDeploymentStore.getState().setDeployments(event.deployments, event.lastUpdatedAt);
      }
    )
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    listen<{ deploymentId: string; oldState: DeploymentState; newState: DeploymentState }>(
      'vercel:deployment_state_changed',
      (event) => {
        useVercelDeploymentStore
          .getState()
          .updateDeploymentState(event.deploymentId, event.newState);
      }
    )
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    listen<{ deployment: Deployment }>('vercel:new_deployment', () => {
      // Could trigger toast notification
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    // Auth lifecycle
    listen('vercel:auth_revoked', () => {
      logger.warn('Vercel token revoked');
      useVercelConnectionStore.getState().setDisconnected();
      useVercelDeploymentStore.getState().reset();
      useVercelLogStore.getState().clearLogs();
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    listen('vercel:needs_revalidation', () => {
      logger.info('Vercel token needs revalidation');
      useVercelConnectionStore.getState().setError('Token needs revalidation. Please reconnect.');
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    // Polling health
    listen<{ message: string }>('vercel:polling_error', (event) => {
      useVercelDeploymentStore.getState().setPollError(event.message);
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    listen('vercel:polling_suspended', () => {
      useVercelDeploymentStore.getState().setIsPolling(false);
      useVercelDeploymentStore.getState().setPollError('Polling suspended. Check your connection.');
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    // Log stream status (log data arrives via Channel, not events)
    listen<{ deploymentId: string }>('vercel:log_stream_ended', () => {
      useVercelLogStore.getState().setStreamingLogs(false);
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    listen<{ deploymentId: string; error: string }>('vercel:log_stream_error', (event) => {
      useVercelLogStore.getState().setStreamError(event.error);
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    // Project linking
    listen('vercel:project_not_linked', () => {
      logger.info('No matching Vercel project found');
      // UI will show project picker
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    listen('vercel:deployments_cleared', () => {
      useVercelDeploymentStore.getState().reset();
    })
      .then((u) => controller.addUnlisten(u))
      .catch((e) => logger.error('Failed to register listener', e));

    // After all listeners registered, trigger auto-detection
    void autoDetectVercelProject(workspacePath)
      .then((project) => {
        if (project !== null) {
          useVercelConnectionStore.getState().setLinkedProject(project);
          logger.info(`Auto-detected Vercel project: ${project.name}`);
        }
      })
      .catch((e) => logger.error('Auto-detect failed', e));

    return (): void => {
      controller.cleanup();
    };
  }, [workspacePath]);
}
```

- [ ] **Step 2: Write log stream hook**

Create `apps/agent/src/hooks/integrations/use-vercel-log-stream.ts`:

```typescript
import type { LogEvent } from '@orbit/shared-schemas';

import { useEffect } from 'react';
import { Channel } from '@tauri-apps/api/core';

import { invoke } from '@/lib/api/core';
import { useVercelLogStore } from '@/stores/integrations/vercel-log-store';
import { createLogger } from '@orbit/common/lib';

const logger = createLogger('VercelLogStream');

/**
 * Manages the lifecycle of a Vercel build log stream.
 * Uses tauri::ipc::Channel for high-throughput log delivery.
 * Cleanup on unmount calls vercel_stop_log_stream with stream_id
 * to prevent React strict-mode double-mount from killing streams.
 */
export function useVercelLogStream(deploymentId: string | null): void {
  useEffect(() => {
    if (deploymentId === null) {
      return;
    }

    let streamId: string | null = null;

    const channel = new Channel<LogEvent[]>();
    channel.onmessage = (batch: LogEvent[]): void => {
      useVercelLogStore.getState().appendLogBatch(batch);
    };

    useVercelLogStore.getState().clearLogs();
    useVercelLogStore.getState().setActiveDeployment(deploymentId);
    useVercelLogStore.getState().setStreamingLogs(true);

    invoke<string>('vercel_stream_logs', {
      deploymentId,
      onEvent: channel,
    })
      .then((id: string) => {
        streamId = id;
      })
      .catch((e: unknown) => {
        useVercelLogStore.getState().setStreamError(e instanceof Error ? e.message : String(e));
      });

    return (): void => {
      if (streamId !== null) {
        void invoke('vercel_stop_log_stream', { streamId }).catch((e) =>
          logger.error('Failed to stop log stream', e)
        );
      }
    };
  }, [deploymentId]);
}
```

- [ ] **Step 3: Create barrel files**

Create `apps/agent/src/hooks/integrations/index.ts`:

```typescript
export { useVercelEvents } from './use-vercel-events';
export { useVercelLogStream } from './use-vercel-log-stream';
```

Add to `apps/agent/src/hooks/index.ts`:

```typescript
export * from './integrations';
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/hooks/integrations/ apps/agent/src/hooks/index.ts
git commit -m "feat(vercel): add useVercelEvents and useVercelLogStream hooks"
```

---

### Task 6: Frontend tests

**Files:**

- Create: `apps/agent/src/__tests__/unit/stores/integrations/vercel-connection-store.test.ts`
- Create: `apps/agent/src/__tests__/unit/stores/integrations/vercel-deployment-store.test.ts`
- Create: `apps/agent/src/__tests__/unit/stores/integrations/vercel-log-store.test.ts`
- Create: `apps/agent/src/__tests__/unit/schemas/vercel-schemas.test.ts`

- [ ] **Step 1: Write store tests**

Create Vitest tests for all 3 Zustand stores covering:

- **Store independence:** Mutating one store does not affect the others
- **Log cap:** `appendLogBatch` correctly caps at 10,000 events and increments `truncatedCount`
- **`reset()`:** Verify all fields return to initial state for each store
- **`updateDeploymentState`:** Accepts `DeploymentState` type, updates correct deployment by `uid`, no-ops on unknown `uid`
- **`setDeployments`:** Sorts by `created` descending
- **`setConnected` / `setDisconnected`:** Correct state transitions in connection store

- [ ] **Step 2: Write Zod schema validation tests**

Create Vitest tests for Zod schemas validating against fixture JSON:

- Valid deployment object parses without error
- `.strict()` rejects objects with extra fields
- Enum values match serde conventions (`UNKNOWN` for SCREAMING_SNAKE, `unknown` for lowercase/kebab)
- Nullable/nullish fields accept both `null` and `undefined`
- `.default({})` on `meta` and `.default([])` on `alias` populate missing fields

- [ ] **Step 3: Note on hook tests**

> Hook tests (`useVercelLogStream` cleanup, `useVercelEvents` listener registration) require React Testing Library + `@testing-library/react-hooks` and Tauri invoke/listen mocks from `apps/common/src/__mocks__/tauri.ts`. These are optional for the initial data layer but should be added before UI integration.

- [ ] **Step 4: Run tests**

Run: `bun run test`
Expected: All new and existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/__tests__/unit/stores/integrations/ apps/agent/src/__tests__/unit/schemas/
git commit -m "test(vercel): add Vitest tests for 3 stores and Zod schema validation"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run full lint**

Run: `bun run lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run frontend tests**

Run: `bun run test`
Expected: All existing tests still PASS

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "feat(vercel): final frontend data layer cleanup"
```

---

## Summary

| Component               | File                                                          | Key Content                                                    |
| ----------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| ListenerAbortController | `lib/tauri-listener-controller.ts`                            | Extracted shared utility                                       |
| Zod schemas             | `shared-schemas/src/vercel/vercel.ts`                         | All types with `.strict()`, camelCase                          |
| Connection store        | `stores/integrations/vercel-connection-store.ts`              | Tri-state status, 7 selectors                                  |
| Deployment store        | `stores/integrations/vercel-deployment-store.ts`              | Full-replace setDeployments, 6 selectors                       |
| Log store               | `stores/integrations/vercel-log-store.ts`                     | 10K cap, appendLogBatch, 5 selectors                           |
| API wrappers            | `lib/api/vercel.ts`                                           | 12 typed invoke wrappers                                       |
| Event hook              | `hooks/integrations/use-vercel-events.ts`                     | 10 event listeners, connected-state guard, auto-detect trigger |
| Log stream hook         | `hooks/integrations/use-vercel-log-stream.ts`                 | Channel lifecycle, stream_id cleanup                           |
| Type re-exports         | `types/vercel.ts`                                             | Forward-declaration for UI components                          |
| Barrel files            | `stores/integrations/index.ts`, `hooks/integrations/index.ts` | Re-exports                                                     |
| Store tests             | `__tests__/unit/stores/integrations/*.test.ts`                | Independence, log cap, reset, state transitions                |
| Schema tests            | `__tests__/unit/schemas/vercel-schemas.test.ts`               | Fixture validation, strict rejection, enum casing              |

**Total: 7 tasks, 28 new files**
