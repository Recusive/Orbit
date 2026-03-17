import type { ImageAttachment } from '@/components/chat/input/types';
import type { ProviderListResponses } from '@orbit.build/sdk/v2/client';

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

  it('maps nested capabilities into provider model flags with safe fallbacks', async () => {
    const providerResponse: ProviderListResponses[200] = {
      all: [
        {
          id: 'ollama',
          name: 'Ollama',
          env: [],
          source: 'custom',
          options: {},
          models: {
            'gpt-oss-120b': {
              id: 'gpt-oss-120b',
              name: 'GPT OSS 120B',
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: true,
                toolcall: true,
                input: {
                  text: true,
                  audio: false,
                  image: false,
                  video: false,
                  pdf: false,
                },
                output: {
                  text: true,
                  audio: false,
                  image: false,
                  video: false,
                  pdf: false,
                },
                interleaved: false,
              },
              limit: { context: 128000, output: 4096 },
            },
            'llava-vision': {
              id: 'llava-vision',
              name: 'LLaVA Vision',
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: false,
                toolcall: true,
                input: {
                  text: true,
                  audio: false,
                  image: true,
                  video: false,
                  pdf: false,
                },
                output: {
                  text: true,
                  audio: false,
                  image: false,
                  video: false,
                  pdf: false,
                },
                interleaved: false,
              },
              limit: { context: 128000, output: 4096 },
            },
            'legacy-attachment': {
              id: 'legacy-attachment',
              name: 'Legacy Attachment',
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: true,
                toolcall: true,
                input: {
                  text: true,
                  audio: false,
                  image: undefined as unknown as boolean,
                  video: false,
                  pdf: false,
                },
                output: {
                  text: true,
                  audio: false,
                  image: false,
                  video: false,
                  pdf: false,
                },
                interleaved: false,
              },
              limit: { context: 128000, output: 4096 },
            } as unknown as ProviderListResponses[200]['all'][number]['models'][string],
          },
        },
        {
          id: 'openai',
          name: 'OpenAI',
          env: ['OPENAI_API_KEY'],
          source: 'config',
          options: {},
          models: {
            'gpt-5': {
              id: 'gpt-5',
              name: 'GPT-5',
              capabilities: {
                temperature: true,
                reasoning: true,
                attachment: true,
                toolcall: true,
                input: {
                  text: true,
                  audio: false,
                  image: true,
                  video: false,
                  pdf: true,
                },
                output: {
                  text: true,
                  audio: false,
                  image: false,
                  video: false,
                  pdf: false,
                },
                interleaved: false,
              },
              limit: { context: 256000, input: 128000, output: 8192 },
              variants: { high: {} },
            },
            broken: {
              id: 'broken',
              name: 'Broken Model',
              limit: { context: 4096, output: 1024 },
            } as unknown as ProviderListResponses[200]['all'][number]['models'][string],
          },
        },
      ],
      default: { ollama: 'gpt-oss-120b', openai: 'gpt-5' },
      connected: ['openai'],
    };

    mockProviderList.mockResolvedValue({
      data: providerResponse,
    });
    mockProviderAuth.mockResolvedValue({ data: {} });

    await ocSessionService.loadProviders();

    const providers = useOcProviderStore.getState().providers;
    const ollamaModels = providers.find((provider) => provider.id === 'ollama')?.models;
    const openAiModels = providers.find((provider) => provider.id === 'openai')?.models;

    expect(ollamaModels?.['gpt-oss-120b']?.supportsImageInput).toBe(false);
    expect(ollamaModels?.['llava-vision']?.supportsImageInput).toBe(true);
    expect(ollamaModels?.['legacy-attachment']?.supportsImageInput).toBe(true);
    expect(openAiModels?.['broken']?.supportsImageInput).toBe(false);
    expect(openAiModels?.['gpt-5']?.supportsImageInput).toBe(true);
    expect(openAiModels?.['gpt-5']?.reasoning).toBe(true);
  });
});
