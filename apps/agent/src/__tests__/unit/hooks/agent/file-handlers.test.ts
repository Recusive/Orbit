import type { FileEntry } from '@/lib/api';
import type { WebviewMessage } from '@/types/protocol';

const {
  mockBuildFileIndex,
  mockConversationList,
  mockGetWorkspacePath,
  mockListDirectory,
  mockReadFile,
} = vi.hoisted(() => ({
  mockBuildFileIndex: vi.fn<[string], Promise<void>>(),
  mockConversationList: vi.fn<[string], Promise<unknown[]>>(),
  mockGetWorkspacePath: vi.fn<[], Promise<string | null>>(),
  mockListDirectory: vi.fn<[string, boolean?], Promise<FileEntry[]>>(),
  mockReadFile: vi.fn<[string], Promise<string>>(),
}));

const { mockInitFileWatcher } = vi.hoisted(() => ({
  mockInitFileWatcher: vi.fn<[string], Promise<void>>(),
}));

vi.mock('@/hooks/agent/use-tauri-file-watcher', () => ({
  initFileWatcher: mockInitFileWatcher,
}));

vi.mock('@/lib/api', () => ({
  buildFileIndex: mockBuildFileIndex,
  conversationList: mockConversationList,
  getWorkspacePath: mockGetWorkspacePath,
  listDirectory: mockListDirectory,
  readFile: mockReadFile,
}));

vi.mock('@/lib/mappers', () => ({
  toConversationSummaries: vi.fn(),
  toFileNodes: vi.fn((entries: FileEntry[]) =>
    entries
      .filter((entry: FileEntry) => !['.git', '.ds_store'].includes(entry.name.toLowerCase()))
      .map((entry: FileEntry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDir,
        isFile: !entry.isDir,
        isSymlink: entry.isSymlink,
        isGitIgnored: entry.isGitIgnored,
      }))
  ),
}));

vi.mock('@/stores/file/file-viewer-store', () => ({
  useFileViewerStore: {
    getState: (): { closeTab: (path: string) => void } => ({
      closeTab: vi.fn(),
    }),
  },
}));

vi.mock('@/stores/ui/ui-store', () => ({
  useUIStore: {
    getState: (): {
      workspacePath: string | null;
      initializeWorkspace: (path: string) => void;
      setConversations: (conversations: unknown[]) => void;
    } => ({
      workspacePath: null,
      initializeWorkspace: vi.fn(),
      setConversations: vi.fn(),
    }),
  },
}));

import { handleFileTreeRequest } from '@/hooks/agent/handlers/file-handlers';

describe('file-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspacePath.mockResolvedValue('/workspace');
    mockConversationList.mockResolvedValue([]);
    mockBuildFileIndex.mockResolvedValue(undefined);
    mockInitFileWatcher.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('');
  });

  describe('handleFileTreeRequest', () => {
    it('filters system entries and forwards isGitIgnored to file tree nodes', async () => {
      const entries: FileEntry[] = [
        {
          path: '/workspace/.git',
          name: '.git',
          isDir: true,
          isSymlink: false,
          isHidden: true,
          isGitIgnored: false,
        },
        {
          path: '/workspace/.DS_Store',
          name: '.DS_Store',
          isDir: false,
          isSymlink: false,
          isHidden: true,
          isGitIgnored: false,
        },
        {
          path: '/workspace/.gitignore',
          name: '.gitignore',
          isDir: false,
          isSymlink: false,
          isHidden: true,
          isGitIgnored: false,
        },
        {
          path: '/workspace/dist',
          name: 'dist',
          isDir: true,
          isSymlink: false,
          isHidden: false,
          isGitIgnored: true,
        },
        {
          path: '/workspace/src',
          name: 'src',
          isDir: true,
          isSymlink: false,
          isHidden: false,
          isGitIgnored: false,
        },
      ];
      mockListDirectory.mockResolvedValue(entries);

      const postMessageSpy = vi.spyOn(window, 'postMessage');
      const message: Extract<WebviewMessage, { type: 'file:tree:request' }> = {
        type: 'file:tree:request',
        uuid: '00000000-0000-4000-8000-000000000001',
        path: '/workspace',
      };

      await handleFileTreeRequest(message);

      expect(mockListDirectory).toHaveBeenCalledWith('/workspace', true);
      expect(postMessageSpy).toHaveBeenCalledTimes(1);

      const [payload, targetOrigin] = postMessageSpy.mock.calls[0] ?? [];
      expect(targetOrigin).toBe('*');

      const response = payload as {
        type: string;
        request_uuid: string;
        path: string;
        children: {
          name: string;
          isGitIgnored?: boolean;
        }[];
      };

      expect(response.type).toBe('file:tree:response');
      expect(response.request_uuid).toBe(message.uuid);
      expect(response.path).toBe('/workspace');
      expect(response.children.map((child) => child.name)).toEqual(['.gitignore', 'dist', 'src']);
      expect(response.children.find((child) => child.name === '.git')).toBeUndefined();
      expect(response.children.find((child) => child.name === '.DS_Store')).toBeUndefined();
      expect(response.children.find((child) => child.name === '.gitignore')?.isGitIgnored).toBe(
        false
      );
      expect(response.children.find((child) => child.name === 'dist')?.isGitIgnored).toBe(true);

      postMessageSpy.mockRestore();
    });
  });
});
