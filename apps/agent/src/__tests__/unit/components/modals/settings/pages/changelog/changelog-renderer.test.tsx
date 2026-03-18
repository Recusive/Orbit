import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({
    postMessage: mockPostMessage,
    isConnected: true,
    isMockMode: true,
  }),
}));

import { ChangelogRenderer } from '@/components/modals/settings/pages/changelog/changelog-renderer';

describe('ChangelogRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders safe https links as clickable anchors', () => {
    render(<ChangelogRenderer markdown="[Docs](https://example.com/docs)" />);

    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
  });

  it('renders safe mailto links as clickable anchors', () => {
    render(<ChangelogRenderer markdown="[Email](mailto:team@orbit.build)" />);

    expect(screen.getByRole('link', { name: 'Email' })).toBeInTheDocument();
  });

  it('renders javascript links as plain text instead of clickable links', () => {
    render(<ChangelogRenderer markdown="[Bad Link](javascript:alert(1))" />);

    expect(screen.getByText('Bad Link')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bad Link' })).not.toBeInTheDocument();
  });

  it('renders malformed URLs as plain text instead of clickable links', () => {
    render(<ChangelogRenderer markdown="[Broken Link](not a url)" />);

    expect(screen.getByText('Broken Link')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Broken Link' })).not.toBeInTheDocument();
  });

  it('posts a url:open bridge message when a safe link is clicked', async () => {
    const user = userEvent.setup();

    render(<ChangelogRenderer markdown="[Docs](https://example.com/docs)" />);

    await user.click(screen.getByRole('link', { name: 'Docs' }));

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        type: 'url:open',
        url: 'https://example.com/docs',
        uuid: expect.any(String),
      })
    );
  });
});
