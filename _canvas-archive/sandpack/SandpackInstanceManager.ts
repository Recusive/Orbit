/**
 * SandpackInstanceManager - Zustand store for managing multiple Sandpack preview instances
 *
 * Handles instance lifecycle, visibility tracking, and resource limits.
 * Max 6 concurrent active previews to prevent browser memory issues.
 */
import { create } from 'zustand';

export type InstanceStatus = 'loading' | 'ready' | 'error' | 'suspended' | 'background';

export interface SandpackInstance {
  nodeId: string;
  instanceId: string;
  status: InstanceStatus;
  iframeRef: HTMLIFrameElement | null;
  lastActivity: number;
  error?: string;
}

interface SandpackInstanceState {
  instances: Map<string, SandpackInstance>;
  activeCount: number;
  maxActive: number;

  // Actions
  register: (nodeId: string, instanceId: string) => void;
  unregister: (instanceId: string) => void;
  updateStatus: (instanceId: string, status: InstanceStatus, error?: string) => void;
  setIframeRef: (instanceId: string, ref: HTMLIFrameElement | null) => void;
  markActive: (instanceId: string) => void;
  suspendLRU: () => string | null;
  getInstanceByNodeId: (nodeId: string) => SandpackInstance | undefined;
  getInstanceById: (instanceId: string) => SandpackInstance | undefined;
  getActiveInstances: () => SandpackInstance[];
}

export const useSandpackInstanceManager = create<SandpackInstanceState>((set, get) => ({
  instances: new Map(),
  activeCount: 0,
  maxActive: 6,

  register: (nodeId: string, instanceId: string): void => {
    set((state) => {
      const newInstances = new Map(state.instances);

      // Check if we need to suspend an old instance
      const activeInstances = Array.from(newInstances.values()).filter(
        (i) => i.status === 'ready' || i.status === 'loading'
      );

      if (activeInstances.length >= state.maxActive) {
        // Find LRU instance to suspend
        const lru = activeInstances.sort((a, b) => a.lastActivity - b.lastActivity)[0];
        if (lru) {
          newInstances.set(lru.instanceId, { ...lru, status: 'suspended' });
        }
      }

      newInstances.set(instanceId, {
        nodeId,
        instanceId,
        status: 'loading',
        iframeRef: null,
        lastActivity: Date.now(),
      });

      const newActiveCount = Array.from(newInstances.values()).filter(
        (i) => i.status === 'ready' || i.status === 'loading'
      ).length;

      return { instances: newInstances, activeCount: newActiveCount };
    });
  },

  unregister: (instanceId: string): void => {
    set((state) => {
      const newInstances = new Map(state.instances);
      newInstances.delete(instanceId);

      const newActiveCount = Array.from(newInstances.values()).filter(
        (i) => i.status === 'ready' || i.status === 'loading'
      ).length;

      return { instances: newInstances, activeCount: newActiveCount };
    });
  },

  updateStatus: (instanceId: string, status: InstanceStatus, error?: string): void => {
    set((state) => {
      const instance = state.instances.get(instanceId);
      if (!instance) return state;

      const newInstances = new Map(state.instances);
      const updatedInstance: SandpackInstance = {
        ...instance,
        status,
        lastActivity: Date.now(),
      };
      if (error !== undefined) {
        updatedInstance.error = error;
      }
      newInstances.set(instanceId, updatedInstance);

      const newActiveCount = Array.from(newInstances.values()).filter(
        (i) => i.status === 'ready' || i.status === 'loading'
      ).length;

      return { instances: newInstances, activeCount: newActiveCount };
    });
  },

  setIframeRef: (instanceId: string, ref: HTMLIFrameElement | null): void => {
    set((state) => {
      const instance = state.instances.get(instanceId);
      if (!instance) return state;

      const newInstances = new Map(state.instances);
      newInstances.set(instanceId, { ...instance, iframeRef: ref });

      return { instances: newInstances };
    });
  },

  markActive: (instanceId: string): void => {
    set((state) => {
      const instance = state.instances.get(instanceId);
      if (!instance) return state;

      const newInstances = new Map(state.instances);
      newInstances.set(instanceId, {
        ...instance,
        lastActivity: Date.now(),
      });

      return { instances: newInstances };
    });
  },

  suspendLRU: (): string | null => {
    const state = get();
    const activeInstances = Array.from(state.instances.values()).filter(
      (i) => i.status === 'ready' || i.status === 'background'
    );

    if (activeInstances.length === 0) return null;

    const lru = activeInstances.sort((a, b) => a.lastActivity - b.lastActivity)[0];
    if (lru) {
      get().updateStatus(lru.instanceId, 'suspended');
      return lru.instanceId;
    }

    return null;
  },

  getInstanceByNodeId: (nodeId: string): SandpackInstance | undefined => {
    const state = get();
    return Array.from(state.instances.values()).find((i) => i.nodeId === nodeId);
  },

  getInstanceById: (instanceId: string): SandpackInstance | undefined => {
    return get().instances.get(instanceId);
  },

  getActiveInstances: (): SandpackInstance[] => {
    const state = get();
    return Array.from(state.instances.values()).filter(
      (i) => i.status === 'ready' || i.status === 'loading'
    );
  },
}));

// Selector for getting instance count
export const selectInstanceCount = (state: SandpackInstanceState): number => state.instances.size;
export const selectActiveCount = (state: SandpackInstanceState): number => state.activeCount;
