import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';

export interface ComponentMeta {
  name: string;
  componentType: 'ui' | 'custom';
  dependencies: string[];
  registryDependencies: string[];
}

export interface LocalRegistry {
  version: string;
  lastUpdated: string;
  components: ComponentMeta[];
}

export interface UseComponentRegistryResult {
  registry: LocalRegistry | null;
  uiComponents: ComponentMeta[];
  customComponents: ComponentMeta[];
  loading: boolean;
  error: string | null;
  refreshRegistry: () => Promise<void>;
}

export function useComponentRegistry(): UseComponentRegistryResult {
  const [registry, setRegistry] = useState<LocalRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await invoke<LocalRegistry>('canvas_get_registry');
      setRegistry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const uiComponents = registry?.components.filter((c) => c.componentType === 'ui') ?? [];
  const customComponents = registry?.components.filter((c) => c.componentType === 'custom') ?? [];

  return {
    registry,
    uiComponents,
    customComponents,
    loading,
    error,
    refreshRegistry: loadRegistry,
  };
}
