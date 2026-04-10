export const CHAT_SCROLLER_SELECTOR = '[data-testid="chat-scroller"]';

export const CHAT_LIST_SURFACE_SELECTOR = '[data-testid="chat-list-inner"]';

export function findChatScroller(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(CHAT_SCROLLER_SELECTOR);
}

export function findChatListSurface(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(CHAT_LIST_SURFACE_SELECTOR);
}
