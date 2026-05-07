import type { FileEntry } from '@/lib/api';
import type { WebviewMessage } from '@/types/protocol';

const {
  mockBuildFileIndex,
  mockConversationList,
  mockGetFileInfo,
  mockGetWorkspacePath,
  mockListDirectory,
  mockReadFile,
} = vi.hoisted(() => ({
  mockBuildFileIndex: vi.fn<[string], Promise<void>>(),
  mockConversationList: vi.fn<[string], Promise<unknown[]>>(),
  mockGetFileInfo: vi.fn<[string], Promise<{ size: number }>>(),
  mockGetWorkspacePath: vi.fn<[], Promise<string | null>>(),
  mockListDirectory: vi.fn<[string, boolean?], Promise<FileEntry[]>>(),
  mockReadFile: vi.fn<[string], Promise<string>>(),
}));

const { mockInitFileWatcher } = vi.hoisted(() => ({
  mockInitFileWatcher: vi.fn<[string], Promise<void>>(),
}));

const { mockInvalidateAllConversationCaches } = vi.hoisted(() => ({
  mockInvalidateAllConversationCaches: vi.fn<[], Promise<void>>(),
}));

const { mockAbortPendingCreate, mockAbortSessionSwitch, mockClearAllReadyInstances } = vi.hoisted(
  () => ({
    mockAbortPendingCreate: vi.fn<[], undefined>(),
    mockAbortSessionSwitch: vi.fn<[number], undefined>(),
    mockClearAllReadyInstances: vi.fn<[], undefined>(),
  })
);

const { mockCloseTab, mockConvertFileSrc, mockSetImageFile, viewerStoreState } = vi.hoisted(() => ({
  mockCloseTab: vi.fn<[string], undefined>(),
  mockConvertFileSrc: vi.fn<[string], string>(),
  mockSetImageFile: vi.fn<
    [string, number, { assetUrl: string; mimeType: string; fileSize: number }],
    undefined
  >(),
  viewerStoreState: {
    openTabs: [] as { path: string; instanceId: number }[],
  },
}));

const { mockInitializeWorkspace, mockSetConversations, uiStoreState } = vi.hoisted(() => ({
  mockInitializeWorkspace: vi.fn<[string], undefined>(),
  mockSetConversations: vi.fn<[unknown[]], undefined>(),
  uiStoreState: {
    workspacePath: null as string | null,
  },
}));

vi.mock('@/hooks/agent/use-tauri-file-watcher', () => ({
  initFileWatcher: mockInitFileWatcher,
}));

vi.mock('@/lib/query', () => ({
  invalidateAllConversationCaches: mockInvalidateAllConversationCaches,
}));

vi.mock('@/services/conversations/session-switch-coordinator', () => ({
  abortPendingCreate: mockAbortPendingCreate,
  abortSessionSwitch: mockAbortSessionSwitch,
  clearAllReadyInstances: mockClearAllReadyInstances,
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mockConvertFileSrc,
}));

vi.mock('@/lib/api', () => ({
  buildFileIndex: mockBuildFileIndex,
  conversationList: mockConversationList,
  getFileInfo: mockGetFileInfo,
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
    getState: (): {
      openTabs: { path: string; instanceId: number }[];
      closeTab: (path: string) => undefined;
      setImageFile: (
        path: string,
        instanceId: number,
        imageData: { assetUrl: string; mimeType: string; fileSize: number }
      ) => undefined;
    } => ({
      openTabs: viewerStoreState.openTabs,
      closeTab: mockCloseTab,
      setImageFile: mockSetImageFile,
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
      workspacePath: uiStoreState.workspacePath,
      initializeWorkspace: mockInitializeWorkspace,
      setConversations: mockSetConversations,
    }),
  },
}));

import { handleFileRead, handleFileTreeRequest } from '@/hooks/agent/handlers/file-handlers';

describe('file-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspacePath.mockResolvedValue('/workspace');
    mockConversationList.mockResolvedValue([]);
    mockBuildFileIndex.mockResolvedValue(undefined);
    mockGetFileInfo.mockResolvedValue({ size: 4096 });
    mockInvalidateAllConversationCaches.mockResolvedValue(undefined);
    mockInitFileWatcher.mockResolvedValue(undefined);
    mockInitializeWorkspace.mockReset();
    mockSetConversations.mockReset();
    mockConvertFileSrc.mockImplementation((path: string) => `asset://${path}`);
    mockReadFile.mockResolvedValue('');
    uiStoreState.workspacePath = null;
    viewerStoreState.openTabs = [];
  });

  describe('handleFileTreeRequest', () => {
    it('invalidates conversation caches before bootstrapping a new workspace', async () => {
      mockGetWorkspacePath.mockResolvedValue('/workspace-next');
      mockListDirectory.mockResolvedValue([]);

      const message: Extract<WebviewMessage, { type: 'file:tree:request' }> = {
        type: 'file:tree:request',
        uuid: '00000000-0000-4000-8000-000000000000',
      };

      await handleFileTreeRequest(message);

      expect(mockInvalidateAllConversationCaches).toHaveBeenCalledTimes(1);
      expect(mockInitializeWorkspace).toHaveBeenCalledWith('/workspace-next');
      expect(mockInvalidateAllConversationCaches.mock.invocationCallOrder[0]).toBeLessThan(
        mockInitializeWorkspace.mock.invocationCallOrder[0]
      );
    });

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

  describe('handleFileRead', () => {
    it('posts file content for non-image files', async () => {
      mockReadFile.mockResolvedValue('export const x = 1;');
      const postMessageSpy = vi.spyOn(window, 'postMessage');
      const message: Extract<WebviewMessage, { type: 'file:read' }> = {
        type: 'file:read',
        uuid: '00000000-0000-4000-8000-000000000010',
        path: '/workspace/src/app.ts',
      };

      await handleFileRead(message);

      expect(mockReadFile).toHaveBeenCalledWith(message.path);
      expect(mockSetImageFile).not.toHaveBeenCalled();
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file:content',
          request_uuid: message.uuid,
          path: message.path,
          content: 'export const x = 1;',
        }),
        '*'
      );

      postMessageSpy.mockRestore();
    });

    it('short-circuits image files to setImageFile without posting file content', async () => {
      viewerStoreState.openTabs = [{ path: '/workspace/assets/photo.png', instanceId: 7 }];
      const postMessageSpy = vi.spyOn(window, 'postMessage');
      const message: Extract<WebviewMessage, { type: 'file:read' }> = {
        type: 'file:read',
        uuid: '00000000-0000-4000-8000-000000000011',
        path: '/workspace/assets/photo.png',
      };

      await handleFileRead(message);

      expect(mockConvertFileSrc).toHaveBeenCalledWith(message.path);
      expect(mockGetFileInfo).toHaveBeenCalledWith(message.path);
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockSetImageFile).toHaveBeenCalledWith(message.path, 7, {
        assetUrl: 'asset:///workspace/assets/photo.png',
        mimeType: 'image/png',
        fileSize: 4096,
      });
      expect(postMessageSpy).not.toHaveBeenCalled();

      postMessageSpy.mockRestore();
    });

    it('closes the tab and posts an error when image metadata lookup fails', async () => {
      viewerStoreState.openTabs = [{ path: '/workspace/assets/photo.png', instanceId: 8 }];
      mockGetFileInfo.mockRejectedValueOnce(new Error('metadata failed'));
      const postMessageSpy = vi.spyOn(window, 'postMessage');
      const message: Extract<WebviewMessage, { type: 'file:read' }> = {
        type: 'file:read',
        uuid: '00000000-0000-4000-8000-000000000012',
        path: '/workspace/assets/photo.png',
      };

      await handleFileRead(message);

      expect(mockCloseTab).toHaveBeenCalledWith(message.path);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'metadata failed',
        }),
        '*'
      );

      postMessageSpy.mockRestore();
    });
  });
});
