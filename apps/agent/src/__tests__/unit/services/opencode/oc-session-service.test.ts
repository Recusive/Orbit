import type { ImageAttachment } from '@/components/chat/input/types';

const { mockGetClient, mockPromptAsync, mockProviderList, mockProviderAuth } = vi.hoisted(() => {
  const mockPromptAsync = vi.fn();
  const mockProviderList = vi.fn();
  const mockProviderAuth = vi.fn();

  return {
    mockGetClient: vi.fn(() => ({
      session: {
        promptAsync: mockPromptAsync,
      },
      provider: {
        list: mockProviderList,
        auth: mockProviderAuth,
      },
    })),
    mockPromptAsync,
    mockProviderList,
    mockProviderAuth,
  };
});

vi.mock('@/services/opencode/client', () => ({
  getClient: mockGetClient,
}));

import { ocSessionService } from '@/services/opencode/oc-session-service';
import { useOcProviderStore } from '@/stores/opencode';

describe('oc-session-service', () => {
  beforeEach(() => {
    mockGetClient.mockClear();
    mockPromptAsync.mockReset();
    mockProviderList.mockReset();
    mockProviderAuth.mockReset();
    mockPromptAsync.mockResolvedValue({ data: true });
    useOcProviderStore.getState().clear();
  });

  it('builds the promptAsync payload with images in order', async () => {
    const images: ImageAttachment[] = [
      {
        name: 'a.png',
        mimeType: 'image/png',
        data: 'base64a',
        previewUrl: '',
      },
      {
        name: 'b.jpg',
        mimeType: 'image/jpeg',
        data: 'base64b',
        previewUrl: '',
      },
    ];

    await ocSessionService.sendMessage('session-1', 'describe these', {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      agent: 'build',
      variant: 'high',
      images,
    });

    expect(mockPromptAsync).toHaveBeenCalledWith(
      {
        sessionID: 'session-1',
        model: {
          providerID: 'anthropic',
          modelID: 'claude-sonnet-4-5',
        },
        agent: 'build',
        variant: 'high',
        parts: [
          { type: 'text', text: 'describe these' },
          {
            type: 'file',
            mime: 'image/png',
            filename: 'a.png',
            url: 'data:image/png;base64,base64a',
          },
          {
            type: 'file',
            mime: 'image/jpeg',
            filename: 'b.jpg',
            url: 'data:image/jpeg;base64,base64b',
          },
        ],
      },
      { throwOnError: true }
    );
  });

  it('derives supportsImageInput from modalities with attachment fallback', async () => {
    mockProviderList.mockResolvedValue({
      data: {
        all: [
          {
            id: 'ollama',
            name: 'Ollama',
            env: [],
            models: {
              'gpt-oss-120b': {
                id: 'gpt-oss-120b',
                name: 'GPT OSS 120B',
                release_date: '2026-01-01',
                attachment: true,
                reasoning: false,
                temperature: true,
                tool_call: true,
                limit: { context: 128000, output: 4096 },
                options: {},
                modalities: {
                  input: ['text'],
                  output: ['text'],
                },
              },
              'llava-vision': {
                id: 'llava-vision',
                name: 'LLaVA Vision',
                release_date: '2026-01-01',
                attachment: false,
                reasoning: false,
                temperature: true,
                tool_call: true,
                limit: { context: 128000, output: 4096 },
                options: {},
                modalities: {
                  input: ['text', 'image'],
                  output: ['text'],
                },
              },
              'legacy-attachment': {
                id: 'legacy-attachment',
                name: 'Legacy Attachment',
                release_date: '2026-01-01',
                attachment: true,
                reasoning: false,
                temperature: true,
                tool_call: true,
                limit: { context: 128000, output: 4096 },
                options: {},
              },
            },
          },
        ],
        default: { ollama: 'gpt-oss-120b' },
        connected: ['ollama'],
      },
    });
    mockProviderAuth.mockResolvedValue({ data: {} });

    await ocSessionService.loadProviders();

    const models = useOcProviderStore.getState().providers[0]?.models;
    expect(models?.['gpt-oss-120b']?.supportsImageInput).toBe(false);
    expect(models?.['llava-vision']?.supportsImageInput).toBe(true);
    expect(models?.['legacy-attachment']?.supportsImageInput).toBe(true);
  });
});
