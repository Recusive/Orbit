import { createLogger } from '@orbit/common/lib';

import { queryVisible } from './cursor';
import { sleep } from './wait-utils';

const logger = createLogger('DemoTypingEngine');

const DEFAULT_BASE_CHAR_DELAY_MS = 45;
const SPACE_EXTRA_DELAY_MS = 30;
const PUNCTUATION_EXTRA_DELAY_MS = 80;
const RANDOM_VARIANCE_MS = 15;

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function dispatchInputEvent(inputElement: HTMLElement): void {
  inputElement.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

export function computeCharDelay(
  character: string,
  baseDelayMs: number,
  speedMultiplier: number
): number {
  let delay = baseDelayMs;

  if (character === ' ') {
    delay += SPACE_EXTRA_DELAY_MS;
  }

  if (/[,.;:!?]/.test(character)) {
    delay += PUNCTUATION_EXTRA_DELAY_MS;
  }

  const variance = (Math.random() * 2 - 1) * RANDOM_VARIANCE_MS;
  const scaledDelay = (delay + variance) * speedMultiplier;
  return Math.max(8, Math.round(scaledDelay));
}

export function clearInput(inputElement: HTMLElement): void {
  inputElement.textContent = '';
  dispatchInputEvent(inputElement);
}

export async function typeText(
  text: string,
  options: {
    charDelay?: number;
    signal?: AbortSignal;
    inputElement?: HTMLElement;
    speedMultiplier?: number;
  } = {}
): Promise<HTMLElement> {
  const inputElement = options.inputElement ?? queryVisible('[data-demo-input]');
  if (!inputElement) {
    throw new Error('No visible chat input found for demo typing');
  }

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  const baseDelay = options.charDelay ?? DEFAULT_BASE_CHAR_DELAY_MS;
  const speedMultiplier = options.speedMultiplier ?? 1;

  clearInput(inputElement);

  for (const character of text) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    inputElement.textContent = `${inputElement.textContent}${character}`;
    dispatchInputEvent(inputElement);

    const delay = computeCharDelay(character, baseDelay, speedMultiplier);
    await sleep(delay, options.signal);
  }

  logger.debug('Typed demo text', { length: text.length });
  return inputElement;
}

/**
 * Type into a ProseMirror editor using `beforeinput` events.
 * ProseMirror doesn't respond to textContent mutation — it handles
 * InputEvents natively via its input rules and edit pipeline.
 */
export async function typeIntoProseMirror(
  element: HTMLElement,
  text: string,
  options: { charDelay?: number; signal?: AbortSignal; speedMultiplier?: number } = {}
): Promise<void> {
  element.focus();

  const baseDelay = options.charDelay ?? DEFAULT_BASE_CHAR_DELAY_MS;
  const speedMultiplier = options.speedMultiplier ?? 1;

  for (const char of text) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    if (char === '\n') {
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertParagraph',
          data: null,
        })
      );
    } else {
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: char,
        })
      );
    }

    await sleep(computeCharDelay(char, baseDelay, speedMultiplier), options.signal);
  }

  logger.debug('Typed into ProseMirror', { length: text.length });
}
