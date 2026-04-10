import {
  CHAT_LIST_SURFACE_SELECTOR,
  CHAT_SCROLLER_SELECTOR,
  findChatListSurface,
  findChatScroller,
} from '@/lib/chat/chat-selectors';

describe('chat-selectors', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the chat scroller', () => {
    document.body.innerHTML = `
      <div data-testid="chat-scroller" id="next"></div>
    `;

    expect(CHAT_SCROLLER_SELECTOR).toBe('[data-testid="chat-scroller"]');
    expect(findChatScroller(document)?.id).toBe('next');
  });

  it('finds the list surface', () => {
    document.body.innerHTML = `
      <div data-testid="chat-list-inner" id="next"></div>
    `;
    expect(CHAT_LIST_SURFACE_SELECTOR).toBe('[data-testid="chat-list-inner"]');
    expect(findChatListSurface(document)?.id).toBe('next');
  });
});
