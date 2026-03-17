import { act, renderHook } from '@testing-library/react';

import type { SkillDefinition } from '@/lib/api';

const { mockGetWorkspacePath, mockListCommands, mockListSkills } = vi.hoisted(() => ({
  mockGetWorkspacePath: vi.fn<[], Promise<string | null>>().mockResolvedValue('/test'),
  mockListCommands: vi.fn<[], Promise<[]>>().mockResolvedValue([]),
  mockListSkills: vi.fn<[string], Promise<SkillDefinition[]>>(),
}));

vi.mock('@/lib/api', () => ({
  getWorkspacePath: mockGetWorkspacePath,
  listCommands: mockListCommands,
  listSkills: mockListSkills,
}));

import { useCommandsStore, useSlashCommands } from '@/stores/agent';

describe('commands-store refreshSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspacePath.mockResolvedValue('/test');

    useCommandsStore.setState({
      commands: [],
      skills: [],
      hasFetched: false,
      hasSkillsFetched: true,
      isLoading: false,
      skillsRefreshSeq: 0,
      error: null,
      lastFetchAttempt: null,
    });
  });

  it('updates useSlashCommands after refresh', async () => {
    const newSkill: SkillDefinition = {
      name: 'new-skill',
      description: 'A marketplace skill',
      source: 'user',
    };
    mockListSkills.mockResolvedValueOnce([newSkill]);

    const { result } = renderHook(() => useSlashCommands());
    expect(result.current.find((command) => command.name === 'new-skill')).toBeUndefined();

    await act(async () => {
      await useCommandsStore.getState().refreshSkills();
    });

    expect(result.current.find((command) => command.name === 'new-skill')).toBeDefined();
    expect(result.current.find((command) => command.name === 'new-skill')?.kind).toBe('skill');
  });

  it('drops stale response when a newer refresh is issued', async () => {
    const skillA: SkillDefinition = {
      name: 'skill-a',
      description: 'Older skill response',
      source: 'user',
    };
    const skillB: SkillDefinition = {
      name: 'skill-b',
      description: 'Newer skill response',
      source: 'user',
    };

    let resolveFirst: ((skills: SkillDefinition[]) => void) | undefined;
    const firstPromise = new Promise<SkillDefinition[]>((resolve) => {
      resolveFirst = resolve;
    });

    mockListSkills.mockReturnValueOnce(firstPromise).mockResolvedValueOnce([skillB]);

    const firstRefresh = useCommandsStore.getState().refreshSkills();
    const secondRefresh = useCommandsStore.getState().refreshSkills();

    await secondRefresh;

    resolveFirst?.([skillA]);
    await firstRefresh;

    const { skills } = useCommandsStore.getState();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('skill-b');
  });
});
