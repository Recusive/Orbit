(function () {
  'use strict';

  const RUNTIME_VERSION = '1.0.0';
  const SNAPSHOT_CHAR_LIMIT = 450000;
  const SNAPSHOT_TRUNCATION_BUFFER = 256;
  const CONSOLE_LOG_LIMIT = 1000;
  const NETWORK_REQUEST_LIMIT = 1000;
  const PERSISTED_STATE_STORAGE_KEY = '__orbit_runtime_state__';
  const WINDOW_NAME_STATE_MARKER = '__orbit_runtime_state__:';
  const CLOSED_SHADOW_HOSTS_KEY = '__orbitClosedShadowHosts';
  const CONSOLE_BUFFER_KEY = '__orbitConsoleBuffer';
  const NETWORK_BUFFER_KEY = '__orbitNetworkBuffer';
  const PATCH_STATE_KEY = '__orbitPatchState';

  const INTERACTIVE_ROLES = new Set([
    'button',
    'checkbox',
    'combobox',
    'link',
    'listbox',
    'menuitem',
    'option',
    'radio',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
  ]);

  const TAG_ROLE_MAP = new Map([
    ['a', 'link'],
    ['article', 'article'],
    ['aside', 'complementary'],
    ['button', 'button'],
    ['details', 'group'],
    ['dialog', 'dialog'],
    ['footer', 'footer'],
    ['form', 'form'],
    ['header', 'header'],
    ['main', 'main'],
    ['menu', 'menu'],
    ['nav', 'navigation'],
    ['ol', 'list'],
    ['option', 'option'],
    ['p', 'paragraph'],
    ['section', 'region'],
    ['select', 'combobox'],
    ['summary', 'button'],
    ['table', 'table'],
    ['tbody', 'rowgroup'],
    ['td', 'cell'],
    ['textarea', 'textbox'],
    ['tfoot', 'rowgroup'],
    ['th', 'columnheader'],
    ['thead', 'rowgroup'],
    ['tr', 'row'],
    ['ul', 'list'],
  ]);

  function getGlobalStore(key, factory) {
    if (!Object.prototype.hasOwnProperty.call(window, key)) {
      window[key] = factory();
    }
    return window[key];
  }

  function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function toDurationMs(start) {
    return Math.round(now() - start);
  }

  function collapseWhitespace(value) {
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function escapeSnapshotText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function parsePositiveInteger(value) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function isElement(node) {
    return typeof Element !== 'undefined' && node instanceof Element;
  }

  function isHTMLElement(node) {
    return typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;
  }

  function isInputElement(node) {
    return typeof HTMLInputElement !== 'undefined' && node instanceof HTMLInputElement;
  }

  function isSelectElement(node) {
    return typeof HTMLSelectElement !== 'undefined' && node instanceof HTMLSelectElement;
  }

  function isTextAreaElement(node) {
    return typeof HTMLTextAreaElement !== 'undefined' && node instanceof HTMLTextAreaElement;
  }

  function isContentEditable(node) {
    return isHTMLElement(node) && node.isContentEditable;
  }

  function getAttributeValue(element, name) {
    const raw = element.getAttribute(name);
    return raw === null ? '' : collapseWhitespace(raw);
  }

  function escapeSelectorToken(token) {
    if (typeof CSS !== 'undefined' && CSS !== null && typeof CSS.escape === 'function') {
      return CSS.escape(token);
    }
    return String(token).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function serializeSelector(element) {
    if (!isElement(element)) {
      return undefined;
    }

    if (element.id) {
      return `#${escapeSelectorToken(element.id)}`;
    }

    const tagName = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).slice(0, 2);
    const classSelector =
      classes.length > 0
        ? classes.map((className) => `.${escapeSelectorToken(className)}`).join('')
        : '';

    if (!element.parentElement) {
      return `${tagName}${classSelector}`;
    }

    let siblingIndex = 1;
    let sibling = element;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName === element.tagName) {
        siblingIndex += 1;
      }
    }

    return `${tagName}${classSelector}:nth-of-type(${String(siblingIndex)})`;
  }

  function normalizeBoolean(value, defaultValue) {
    return typeof value === 'boolean' ? value : defaultValue;
  }

  function getSnapshotOptions(options) {
    const normalized = options && typeof options === 'object' ? options : {};
    const interactive = normalizeBoolean(normalized.interactive, true);
    const compact = normalizeBoolean(normalized.compact, false);
    const cursor = interactive ? normalizeBoolean(normalized.cursor, false) : false;

    return {
      interactive,
      compact,
      cursor,
    };
  }

  function getHeadingInfo(element) {
    const tagName = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      return {
        role: 'heading',
        level: Number.parseInt(tagName.slice(1), 10),
      };
    }

    const ariaRole = getAttributeValue(element, 'role');
    if (ariaRole === 'heading') {
      return {
        role: 'heading',
        level: parsePositiveInteger(getAttributeValue(element, 'aria-level')),
      };
    }

    return null;
  }

  function getInputRole(element) {
    if (!isInputElement(element)) {
      return null;
    }

    const type = element.type.toLowerCase();
    if (
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'image' ||
      type === 'file'
    ) {
      return 'button';
    }
    if (type === 'checkbox') {
      return 'checkbox';
    }
    if (type === 'radio') {
      return 'radio';
    }
    if (type === 'range') {
      return 'slider';
    }
    if (type === 'number') {
      return 'spinbutton';
    }
    if (type === 'search') {
      return 'searchbox';
    }
    return 'textbox';
  }

  function getRoleInfo(element) {
    const explicitRole = getAttributeValue(element, 'role');
    if (explicitRole !== '') {
      const headingInfo = getHeadingInfo(element);
      return headingInfo !== null ? headingInfo : { role: explicitRole.split(/\s+/)[0], level: null };
    }

    const headingInfo = getHeadingInfo(element);
    if (headingInfo !== null) {
      return headingInfo;
    }

    if (isInputElement(element)) {
      return { role: getInputRole(element), level: null };
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === 'img') {
      return { role: 'image', level: null };
    }
    if (tagName === 'iframe') {
      return { role: 'iframe', level: null };
    }
    if (tagName === 'li') {
      return { role: 'listitem', level: null };
    }
    if (tagName === 'span' || tagName === 'div') {
      const hasElementChildren = element.children.length > 0;
      const text = collapseWhitespace(element.textContent || '');
      if (!hasElementChildren && text !== '') {
        return { role: 'text', level: null };
      }
    }

    if (TAG_ROLE_MAP.has(tagName)) {
      return { role: TAG_ROLE_MAP.get(tagName), level: null };
    }

    if (isContentEditable(element)) {
      return { role: 'textbox', level: null };
    }

    return { role: 'generic', level: null };
  }

  function getReferencedText(element, attributeName) {
    const ids = getAttributeValue(element, attributeName);
    if (ids === '') {
      return '';
    }

    const ownerDocument = element.ownerDocument;
    if (!ownerDocument) {
      return '';
    }

    return collapseWhitespace(
      ids
        .split(/\s+/)
        .map((id) => {
          const target = ownerDocument.getElementById(id);
          return target ? target.textContent || '' : '';
        })
        .join(' ')
    );
  }

  function getAssociatedLabelText(element) {
    if (!('labels' in element) || !element.labels) {
      return '';
    }

    return collapseWhitespace(
      Array.from(element.labels)
        .map((label) => label.textContent || '')
        .join(' ')
    );
  }

  function getElementName(element) {
    const ariaLabel = getAttributeValue(element, 'aria-label');
    if (ariaLabel !== '') {
      return ariaLabel;
    }

    const labelledBy = getReferencedText(element, 'aria-labelledby');
    if (labelledBy !== '') {
      return labelledBy;
    }

    if (isInputElement(element)) {
      const type = element.type.toLowerCase();
      if (
        type === 'button' ||
        type === 'submit' ||
        type === 'reset' ||
        type === 'image'
      ) {
        return collapseWhitespace(element.value || element.alt || '');
      }

      const labelText = getAssociatedLabelText(element);
      if (labelText !== '') {
        return labelText;
      }

      const placeholder = collapseWhitespace(element.placeholder || '');
      if (placeholder !== '') {
        return placeholder;
      }
    }

    if (isTextAreaElement(element)) {
      const labelText = getAssociatedLabelText(element);
      if (labelText !== '') {
        return labelText;
      }

      const placeholder = collapseWhitespace(element.placeholder || '');
      if (placeholder !== '') {
        return placeholder;
      }
    }

    if (isSelectElement(element)) {
      const labelText = getAssociatedLabelText(element);
      if (labelText !== '') {
        return labelText;
      }
    }

    const alt = getAttributeValue(element, 'alt');
    if (alt !== '') {
      return alt;
    }

    const title = getAttributeValue(element, 'title');
    if (title !== '') {
      return title;
    }

    const text = collapseWhitespace(element.textContent || '');
    if (text !== '') {
      return text;
    }

    if (isInputElement(element) && element.value) {
      return collapseWhitespace(element.value);
    }

    return '';
  }

  function isDisabled(element) {
    if ('disabled' in element && element.disabled === true) {
      return true;
    }
    return getAttributeValue(element, 'aria-disabled') === 'true';
  }

  function isRoleInteractive(role) {
    return INTERACTIVE_ROLES.has(role);
  }

  function hasPositiveTabIndex(element) {
    if (!isHTMLElement(element)) {
      return false;
    }
    return element.tabIndex > 0;
  }

  function isCursorInteractive(element) {
    if (!isHTMLElement(element)) {
      return false;
    }

    const hasOnClick =
      typeof element.onclick === 'function' || element.hasAttribute('onclick');
    if (hasOnClick || hasPositiveTabIndex(element)) {
      return true;
    }

    try {
      const style = window.getComputedStyle(element);
      return style.cursor === 'pointer';
    } catch (_) {
      return false;
    }
  }

  function shouldAssignRef(element, role, options) {
    if (!options.interactive) {
      return true;
    }
    if (isRoleInteractive(role)) {
      return true;
    }
    return options.cursor && isCursorInteractive(element);
  }

  function getTraversalRoots(doc) {
    if (doc.body && doc.body.children.length > 0) {
      return Array.from(doc.body.children);
    }
    if (doc.documentElement && doc.documentElement.children.length > 0) {
      return Array.from(doc.documentElement.children);
    }
    return [];
  }

  function appendSnapshotLine(context, depth, content) {
    if (context.truncated) {
      return false;
    }

    const line = `${'  '.repeat(depth)}- ${content}`;
    const nextLength =
      context.snapshotLength + line.length + (context.lines.length > 0 ? 1 : 0);

    if (nextLength > SNAPSHOT_CHAR_LIMIT - SNAPSHOT_TRUNCATION_BUFFER) {
      context.truncated = true;
      return false;
    }

    context.lines.push(line);
    context.snapshotLength = nextLength;
    return true;
  }

  function appendSnapshotFooter(context, content) {
    const line = `- ${content}`;
    const nextLength =
      context.snapshotLength + line.length + (context.lines.length > 0 ? 1 : 0);

    if (nextLength > SNAPSHOT_CHAR_LIMIT) {
      return false;
    }

    context.lines.push(line);
    context.snapshotLength = nextLength;
    return true;
  }

  function formatSnapshotNode(roleInfo, name, refId, nthValue) {
    let line = roleInfo.role;
    if (name !== '') {
      line += ` "${escapeSnapshotText(name)}"`;
    }
    if (roleInfo.level !== null) {
      line += ` [level=${String(roleInfo.level)}]`;
    }
    if (refId !== null) {
      line += ` [ref=${refId}]`;
    }
    if (nthValue !== null && nthValue > 1) {
      line += ` [nth=${String(nthValue)}]`;
    }
    return line;
  }

  function persistRuntimeState(state) {
    const payload = JSON.stringify(state);

    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(PERSISTED_STATE_STORAGE_KEY, payload);
      }
    } catch (_) {
      // Ignore storage failures. `window.name` is the cross-origin fallback.
    }

    try {
      const currentName = String(window.name || '');
      if (currentName !== '' && currentName.indexOf(WINDOW_NAME_STATE_MARKER) === -1) {
        return;
      }
      const nextName = `${WINDOW_NAME_STATE_MARKER}${payload}`;
      window.name = nextName;
    } catch (_) {
      // Ignore window.name persistence failures.
    }
  }

  function loadPersistedRuntimeState() {
    let payload = null;

    try {
      if (window.sessionStorage) {
        payload = window.sessionStorage.getItem(PERSISTED_STATE_STORAGE_KEY);
      }
    } catch (_) {
      payload = null;
    }

    if (!payload) {
      const currentName = String(window.name || '');
      if (currentName.indexOf(WINDOW_NAME_STATE_MARKER) === 0) {
        payload = currentName.slice(WINDOW_NAME_STATE_MARKER.length);
      }
    }

    if (!payload) {
      return {
        epoch: 0,
        knownRefs: {},
      };
    }

    try {
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid persisted state');
      }

      const epoch =
        typeof parsed.epoch === 'number' && Number.isFinite(parsed.epoch) ? parsed.epoch : 0;
      const knownRefs =
        parsed.knownRefs && typeof parsed.knownRefs === 'object' ? parsed.knownRefs : {};

      return {
        epoch,
        knownRefs,
      };
    } catch (_) {
      return {
        epoch: 0,
        knownRefs: {},
      };
    }
  }

  function createElementReference(element) {
    if (typeof WeakRef === 'function') {
      return new WeakRef(element);
    }
    return {
      deref() {
        return element;
      },
    };
  }

  function dereferenceElement(reference) {
    if (!reference || typeof reference.deref !== 'function') {
      return null;
    }
    return reference.deref();
  }

  function normalizeRef(rawRef) {
    if (typeof rawRef !== 'string') {
      return null;
    }

    let normalized = rawRef.trim();
    if (normalized === '') {
      return null;
    }

    if (normalized.startsWith('ref=')) {
      normalized = normalized.slice(4);
    }
    if (normalized.startsWith('@')) {
      normalized = normalized.slice(1);
    }

    if (/^(?:f\d+-)*e\d+$/.test(normalized)) {
      return normalized;
    }

    return null;
  }

  function buildAvailableRefsMessage(refMap) {
    const keys = Object.keys(refMap);
    if (keys.length === 0) {
      return 'none';
    }

    const simpleRefs = keys.every((refId) => /^e\d+$/.test(refId));
    if (simpleRefs) {
      return `e1-e${String(keys.length)}`;
    }

    return keys.slice(0, 10).join(', ');
  }

  function getTargetParts(target) {
    if (typeof target === 'string') {
      const normalizedRef = normalizeRef(target);
      return normalizedRef !== null ? { ref: normalizedRef } : { selector: target };
    }

    if (!target || typeof target !== 'object') {
      return {};
    }

    const normalizedRef = normalizeRef(target.ref);
    const selector = typeof target.selector === 'string' ? target.selector : undefined;

    if (normalizedRef !== null) {
      return { ref: normalizedRef };
    }
    if (selector) {
      return { selector };
    }
    return {};
  }

  function dispatchBubbledEvent(target, type, init) {
    target.dispatchEvent(new Event(type, Object.assign({ bubbles: true }, init)));
  }

  function dispatchKeyboardEvent(target, type, key) {
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
    target.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key,
        code,
        keyCode,
        charCode: keyCode,
        which: keyCode,
      })
    );
  }

  function focusElement(target) {
    if (typeof target.focus === 'function') {
      target.focus();
    }
    dispatchBubbledEvent(target, 'focusin');
  }

  function setElementValue(target, value) {
    if (isInputElement(target) || isTextAreaElement(target)) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(target),
        'value'
      );
      if (nativeSetter && typeof nativeSetter.set === 'function') {
        nativeSetter.set.call(target, value);
      } else {
        target.value = value;
      }
      return true;
    }

    if (isContentEditable(target)) {
      target.textContent = value;
      return true;
    }

    return false;
  }

  function getElementValue(target) {
    if (isInputElement(target) || isTextAreaElement(target)) {
      return target.value;
    }
    if (isContentEditable(target)) {
      return target.textContent || '';
    }
    return '';
  }

  function appendElementValue(target, text) {
    const nextValue = `${getElementValue(target)}${text}`;
    return setElementValue(target, nextValue);
  }

  function isVisible(target) {
    if (!isElement(target) || !target.isConnected) {
      return false;
    }

    let current = target;
    while (isElement(current)) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      current = current.parentElement;
    }

    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getStorageForType(storeType) {
    try {
      if (storeType === 'session') {
        return window.sessionStorage;
      }
      return window.localStorage;
    } catch (_) {
      throw new Error('Storage access blocked by page policy');
    }
  }

  function parseCookieString(value) {
    if (!value) {
      return [];
    }

    return value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const equalsIndex = part.indexOf('=');
        const name = equalsIndex === -1 ? part : part.slice(0, equalsIndex);
        const cookieValue = equalsIndex === -1 ? '' : part.slice(equalsIndex + 1);
        return {
          name,
          value: cookieValue,
          domain: window.location.hostname,
          path: '/',
          expires: null,
        };
      });
  }

  function registerNetworkRequest(buffer, entry) {
    buffer.push(entry);
    if (buffer.length > NETWORK_REQUEST_LIMIT) {
      buffer.splice(0, buffer.length - NETWORK_REQUEST_LIMIT);
    }
  }

  const closedShadowHosts = getGlobalStore(CLOSED_SHADOW_HOSTS_KEY, () => new WeakSet());
  const consoleBuffer = getGlobalStore(CONSOLE_BUFFER_KEY, () => []);
  const networkBuffer = getGlobalStore(NETWORK_BUFFER_KEY, () => []);
  const patchState = getGlobalStore(PATCH_STATE_KEY, () => ({
    consolePatched: false,
    networkPatched: false,
    shadowPatched: false,
    navigationListenersInstalled: false,
  }));

  function installClosedShadowTracking() {
    if (patchState.shadowPatched || !Element.prototype.attachShadow) {
      return;
    }

    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function attachShadow(init) {
      const shadowRoot = originalAttachShadow.call(this, init);
      if (init && init.mode === 'closed') {
        closedShadowHosts.add(this);
      }
      return shadowRoot;
    };
    patchState.shadowPatched = true;
  }

  function installConsoleCapture() {
    if (patchState.consolePatched) {
      return;
    }

    const methods = ['error', 'warn', 'info', 'log'];
    const originals = {};

    methods.forEach((method) => {
      if (typeof console[method] !== 'function') {
        return;
      }

      originals[method] = console[method].bind(console);
      console[method] = function orbitConsoleCapture() {
        const message = Array.from(arguments)
          .map((value) => {
            try {
              return typeof value === 'string' ? value : JSON.stringify(value);
            } catch (_) {
              return String(value);
            }
          })
          .join(' ');

        consoleBuffer.push({
          level: method,
          message,
          timestamp: Date.now(),
        });

        if (consoleBuffer.length > CONSOLE_LOG_LIMIT) {
          consoleBuffer.splice(0, consoleBuffer.length - CONSOLE_LOG_LIMIT);
        }

        return originals[method].apply(console, arguments);
      };
    });

    patchState.consolePatched = true;
  }

  function installNetworkCapture() {
    if (patchState.networkPatched) {
      return;
    }

    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function orbitFetch(input, init) {
        const startedAt = now();
        const method =
          init && typeof init.method === 'string'
            ? init.method.toUpperCase()
            : input && typeof input === 'object' && typeof input.method === 'string'
              ? input.method.toUpperCase()
              : 'GET';

        const requestUrl =
          typeof input === 'string'
            ? input
            : input && typeof input.url === 'string'
              ? input.url
              : String(input);

        try {
          const response = await originalFetch(input, init);
          registerNetworkRequest(networkBuffer, {
            url: response.url || requestUrl,
            method,
            status: response.status,
            duration: Math.round(now() - startedAt),
            size: Number.parseInt(response.headers.get('content-length') || '0', 10) || 0,
          });
          return response;
        } catch (error) {
          registerNetworkRequest(networkBuffer, {
            url: requestUrl,
            method,
            status: 0,
            duration: Math.round(now() - startedAt),
            size: 0,
          });
          throw error;
        }
      };
    }

    if (typeof XMLHttpRequest !== 'undefined') {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function orbitOpen(method, url) {
        this.__orbitRequestMeta = {
          method: String(method || 'GET').toUpperCase(),
          url: String(url || ''),
          startedAt: 0,
        };
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function orbitSend() {
        if (this.__orbitRequestMeta) {
          this.__orbitRequestMeta.startedAt = now();
        }

        const finalize = () => {
          const meta = this.__orbitRequestMeta;
          if (!meta) {
            return;
          }

          registerNetworkRequest(networkBuffer, {
            url: meta.url,
            method: meta.method,
            status: this.status || 0,
            duration: Math.round(now() - meta.startedAt),
            size:
              typeof this.responseText === 'string'
                ? this.responseText.length
                : Number.parseInt(this.getResponseHeader('content-length') || '0', 10) || 0,
          });
        };

        this.addEventListener('loadend', finalize, { once: true });
        return originalSend.apply(this, arguments);
      };
    }

    patchState.networkPatched = true;
  }

  const persistedState = loadPersistedRuntimeState();
  const existingRuntime =
    window.__orbit && typeof window.__orbit === 'object' ? window.__orbit : null;

  const runtime = {
    VERSION: RUNTIME_VERSION,
    version: RUNTIME_VERSION,
    _epoch:
      existingRuntime && typeof existingRuntime._epoch === 'number'
        ? existingRuntime._epoch
        : persistedState.epoch,
    _refCounter:
      existingRuntime && typeof existingRuntime._refCounter === 'number'
        ? existingRuntime._refCounter
        : 0,
    _refMap:
      existingRuntime && existingRuntime._refMap && typeof existingRuntime._refMap === 'object'
        ? existingRuntime._refMap
        : Object.create(null),
    _knownRefs:
      existingRuntime && existingRuntime._knownRefs && typeof existingRuntime._knownRefs === 'object'
        ? Object.assign({}, persistedState.knownRefs, existingRuntime._knownRefs)
        : Object.assign({}, persistedState.knownRefs),
    _consoleBuffer: consoleBuffer,
    _networkBuffer: networkBuffer,

    _persistState() {
      persistRuntimeState({
        epoch: this._epoch,
        knownRefs: this._knownRefs,
      });
    },

    _incrementEpoch(nextEpoch) {
      if (typeof nextEpoch === 'number' && Number.isFinite(nextEpoch) && nextEpoch > this._epoch) {
        this._epoch = nextEpoch;
      } else {
        this._epoch += 1;
      }
      this._persistState();
      return this._epoch;
    },

    _nextRefId(framePath) {
      this._refCounter += 1;
      const baseId = `e${String(this._refCounter)}`;
      if (!Array.isArray(framePath) || framePath.length === 0) {
        return baseId;
      }
      const prefix = framePath.map((frameIndex) => `f${String(frameIndex)}`).join('-');
      return `${prefix}-${baseId}`;
    },

    _registerRef(refId, element, roleInfo, name, nthValue, frameIndex) {
      this._knownRefs[refId] = this._epoch;
      this._refMap[refId] = {
        ref: createElementReference(element),
        role: roleInfo.role,
        name,
        epoch: this._epoch,
        nth: nthValue,
        selector: serializeSelector(element),
        frameIndex,
      };
      return refId;
    },

    _resolveTarget(target) {
      const parts = getTargetParts(target);
      if (parts.ref) {
        const entry = this._refMap[parts.ref];
        if (!entry) {
          const knownEpoch = this._knownRefs[parts.ref];
          if (typeof knownEpoch === 'number' && knownEpoch !== this._epoch) {
            throw new Error(
              `Ref is stale (epoch ${String(knownEpoch)}, current ${String(this._epoch)}). Call browser_snapshot again.`
            );
          }
          throw new Error(
            `Unknown ref: ${parts.ref}. Available refs: ${buildAvailableRefsMessage(this._refMap)}.`
          );
        }

        if (entry.epoch !== this._epoch) {
          throw new Error(
            `Ref is stale (epoch ${String(entry.epoch)}, current ${String(this._epoch)}). Call browser_snapshot again.`
          );
        }

        const element = dereferenceElement(entry.ref);
        if (!element) {
          throw new Error(
            'Element no longer in DOM (garbage collected). Call browser_snapshot again.'
          );
        }
        if (!element.isConnected) {
          throw new Error(
            'Element no longer in DOM (disconnected). Call browser_snapshot again.'
          );
        }
        return element;
      }

      if (parts.selector) {
        const element = document.querySelector(parts.selector);
        if (!element) {
          throw new Error(`No element found for selector: ${parts.selector}`);
        }
        return element;
      }

      throw new Error('Provide ref (from snapshot) or selector (CSS)');
    },

    snapshot(options) {
      const startedAt = now();
      const normalizedOptions = getSnapshotOptions(options);

      this._incrementEpoch();
      this._refCounter = 0;
      this._refMap = Object.create(null);

      const context = {
        duplicateCounts: new Map(),
        emittedElements: 0,
        frameCounter: 0,
        lines: [],
        refCount: 0,
        snapshotLength: 0,
        totalElements: 0,
        truncated: false,
      };

      const traverse = (element, depth, framePath) => {
        if (!isElement(element)) {
          return;
        }

        context.totalElements += 1;

        const roleInfo = getRoleInfo(element);
        const resolvedRole =
          roleInfo.role === 'generic' && normalizedOptions.cursor && isCursorInteractive(element)
            ? 'clickable'
            : roleInfo.role;

        const resolvedRoleInfo = {
          role: resolvedRole,
          level: roleInfo.level,
        };
        const name = getElementName(element);
        const duplicateKey = `${resolvedRole}\u0000${name}`;
        const nextDuplicateCount = (context.duplicateCounts.get(duplicateKey) || 0) + 1;
        context.duplicateCounts.set(duplicateKey, nextDuplicateCount);
        const nthValue = nextDuplicateCount > 1 ? nextDuplicateCount : null;

        const assignRef = shouldAssignRef(element, resolvedRole, normalizedOptions);
        const shouldEmit = assignRef || !normalizedOptions.compact;

        let refId = null;
        if (assignRef) {
          refId = this._nextRefId(framePath);
          this._registerRef(
            refId,
            element,
            resolvedRoleInfo,
            name,
            nthValue,
            framePath.length > 0 ? framePath[framePath.length - 1] : undefined
          );
          context.refCount += 1;
        }

        const childDepth = shouldEmit ? depth + 1 : depth;
        if (shouldEmit) {
          const appended = appendSnapshotLine(
            context,
            depth,
            formatSnapshotNode(resolvedRoleInfo, name, refId, nthValue)
          );
          if (appended) {
            context.emittedElements += 1;
          }
        }

        if (element.tagName.toLowerCase() === 'iframe') {
          const frameIndex = context.frameCounter + 1;
          context.frameCounter = frameIndex;

          try {
            const frameDocument = element.contentDocument;
            const frameWindow = element.contentWindow;
            if (!frameDocument || !frameWindow || !frameDocument.documentElement) {
              throw new Error('cross-origin');
            }

            void frameWindow.location.href;

            getTraversalRoots(frameDocument).forEach((child) => {
              traverse(child, childDepth, framePath.concat(frameIndex));
            });
          } catch (_) {
            if (!normalizedOptions.compact) {
              appendSnapshotLine(context, childDepth, 'iframe [cross-origin iframe]');
            }
          }
          return;
        }

        if (element.shadowRoot) {
          Array.from(element.shadowRoot.children).forEach((child) => {
            traverse(child, childDepth, framePath);
          });
        } else if (closedShadowHosts.has(element) && !normalizedOptions.compact) {
          appendSnapshotLine(context, childDepth, '[closed shadow root]');
        }

        Array.from(element.children).forEach((child) => {
          traverse(child, childDepth, framePath);
        });
      };

      getTraversalRoots(document).forEach((root) => {
        traverse(root, 0, []);
      });

      if (context.lines.length === 0) {
        context.lines.push('- document (empty)');
      } else if (context.truncated) {
        const omittedElements = Math.max(context.totalElements - context.emittedElements, 0);
        appendSnapshotFooter(context, `[truncated: ${String(omittedElements)} more elements]`);
      }

      this._persistState();

      return {
        epoch: this._epoch,
        snapshot: context.lines.join('\n'),
        refCount: context.refCount,
        totalElements: context.totalElements,
        emittedElements: context.emittedElements,
        truncated: context.truncated,
        url: window.location.href,
        title: document.title || '',
        durationMs: toDurationMs(startedAt),
      };
    },

    click(target) {
      const element = this._resolveTarget(target);
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'center', inline: 'center' });
      }
      if (typeof element.click === 'function') {
        element.click();
      } else {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return { clicked: true };
    },

    fill(target, value) {
      const element = this._resolveTarget(target);
      if (!setElementValue(element, String(value))) {
        throw new Error('Target is not a fillable element');
      }
      focusElement(element);
      dispatchBubbledEvent(element, 'input');
      dispatchBubbledEvent(element, 'change');
      return { filled: true };
    },

    type(target, text) {
      const element = this._resolveTarget(target);
      focusElement(element);

      const content = String(text);
      for (const character of content) {
        dispatchKeyboardEvent(element, 'keydown', character);
        dispatchKeyboardEvent(element, 'keypress', character);
        if (!appendElementValue(element, character)) {
          throw new Error('Target is not a typable element');
        }
        dispatchBubbledEvent(element, 'input');
        dispatchKeyboardEvent(element, 'keyup', character);
      }
      dispatchBubbledEvent(element, 'change');
      return { typed: true };
    },

    select(target, values) {
      const element = this._resolveTarget(target);
      if (!isSelectElement(element)) {
        throw new Error('Target is not a select element');
      }

      const valueList = Array.isArray(values) ? values.map(String) : [String(values)];
      if (!element.multiple) {
        Array.from(element.options).forEach((option) => {
          option.selected = false;
        });
      }

      const selectedValues = new Set(valueList);
      Array.from(element.options).forEach((option) => {
        option.selected = selectedValues.has(option.value) || selectedValues.has(option.text);
      });

      dispatchBubbledEvent(element, 'input');
      dispatchBubbledEvent(element, 'change');
      return { selected: true };
    },

    check(target) {
      const element = this._resolveTarget(target);
      if (isInputElement(element) && element.type.toLowerCase() === 'checkbox') {
        if (!element.checked) {
          element.checked = true;
          dispatchBubbledEvent(element, 'input');
          dispatchBubbledEvent(element, 'change');
        }
        return { checked: true };
      }

      if (getRoleInfo(element).role === 'switch' || getAttributeValue(element, 'role') === 'switch') {
        if (getAttributeValue(element, 'aria-checked') !== 'true') {
          element.setAttribute('aria-checked', 'true');
          dispatchBubbledEvent(element, 'change');
        }
        return { checked: true };
      }

      throw new Error('Target is not a checkbox or switch');
    },

    uncheck(target) {
      const element = this._resolveTarget(target);
      if (isInputElement(element) && element.type.toLowerCase() === 'checkbox') {
        if (element.checked) {
          element.checked = false;
          dispatchBubbledEvent(element, 'input');
          dispatchBubbledEvent(element, 'change');
        }
        return { unchecked: true };
      }

      if (getRoleInfo(element).role === 'switch' || getAttributeValue(element, 'role') === 'switch') {
        if (getAttributeValue(element, 'aria-checked') === 'true') {
          element.setAttribute('aria-checked', 'false');
          dispatchBubbledEvent(element, 'change');
        }
        return { unchecked: true };
      }

      throw new Error('Target is not a checkbox or switch');
    },

    hover(target) {
      const element = this._resolveTarget(target);
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      return { hovered: true };
    },

    focus(target) {
      const element = this._resolveTarget(target);
      focusElement(element);
      dispatchBubbledEvent(element, 'focus');
      return { focused: true };
    },

    scroll(target, direction, amount) {
      const delta = typeof amount === 'number' && Number.isFinite(amount) ? amount : 300;
      const axis = {
        up: { left: 0, top: -delta },
        down: { left: 0, top: delta },
        left: { left: -delta, top: 0 },
        right: { left: delta, top: 0 },
      }[String(direction)];

      if (!axis) {
        throw new Error(`Unsupported scroll direction: ${String(direction)}`);
      }

      if (target) {
        const element = this._resolveTarget(target);
        if (typeof element.scrollBy === 'function') {
          element.scrollBy(axis.left, axis.top);
        }
        return {
          scrollX: Number.isFinite(element.scrollLeft) ? element.scrollLeft : 0,
          scrollY: Number.isFinite(element.scrollTop) ? element.scrollTop : 0,
        };
      }

      window.scrollBy(axis.left, axis.top);
      return {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    },

    scrollIntoView(target) {
      const element = this._resolveTarget(target);
      if (typeof element.scrollIntoViewIfNeeded === 'function') {
        element.scrollIntoViewIfNeeded();
      } else if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({
          behavior: 'instant',
          block: 'center',
          inline: 'center',
        });
      }
      return { scrolled: true };
    },

    getUrl() {
      return { url: window.location.href };
    },

    getTitle() {
      return { title: document.title || '' };
    },

    getText(target) {
      const element = this._resolveTarget(target);
      return { text: collapseWhitespace(element.textContent || '') };
    },

    getHtml(target, outer) {
      const element = this._resolveTarget(target);
      return { html: outer === true ? element.outerHTML : element.innerHTML };
    },

    isVisible(target) {
      const element = this._resolveTarget(target);
      return { visible: isVisible(element) };
    },

    isEnabled(target) {
      const element = this._resolveTarget(target);
      return { enabled: !isDisabled(element) };
    },

    getAttribute(target, name) {
      const element = this._resolveTarget(target);
      return { value: element.getAttribute(String(name)) };
    },

    boundingBox(target) {
      const element = this._resolveTarget(target);
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    },

    count(selector) {
      return { count: document.querySelectorAll(String(selector)).length };
    },

    getCookies(filters) {
      const normalizedFilters = filters && typeof filters === 'object' ? filters : {};
      const nameFilter =
        normalizedFilters.name && typeof normalizedFilters.name === 'string'
          ? normalizedFilters.name
          : null;
      const domainFilter =
        normalizedFilters.domain && typeof normalizedFilters.domain === 'string'
          ? normalizedFilters.domain
          : null;

      const cookies = parseCookieString(document.cookie).filter((cookie) => {
        if (nameFilter && cookie.name !== nameFilter) {
          return false;
        }
        if (domainFilter && cookie.domain !== domainFilter) {
          return false;
        }
        return true;
      });

      return { cookies };
    },

    clearCookies(filters) {
      const cookies = this.getCookies(filters).cookies;
      cookies.forEach((cookie) => {
        const parts = [`${cookie.name}=`, 'expires=Thu, 01 Jan 1970 00:00:00 GMT', 'path=/'];
        if (filters && typeof filters.domain === 'string' && filters.domain !== '') {
          parts.push(`domain=${filters.domain}`);
        }
        document.cookie = parts.join('; ');
      });

      return { cleared: cookies.length };
    },

    storageGet(key, storeType) {
      const store = getStorageForType(storeType === 'session' ? 'session' : 'local');
      return { value: store.getItem(String(key)) };
    },

    storageSet(key, value, storeType) {
      try {
        const store = getStorageForType(storeType === 'session' ? 'session' : 'local');
        store.setItem(String(key), String(value));
        return { success: true };
      } catch (error) {
        throw new Error(
          `Storage write failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    storageClear(storeType) {
      try {
        const store = getStorageForType(storeType === 'session' ? 'session' : 'local');
        store.clear();
        return { success: true };
      } catch (error) {
        throw new Error(
          `Storage write failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    getNetworkRequests(filter) {
      const normalizedFilter = filter && typeof filter === 'object' ? filter : {};
      const requests = this._networkBuffer
        .filter((entry) => {
          if (
            normalizedFilter.url &&
            typeof normalizedFilter.url === 'string' &&
            !entry.url.includes(normalizedFilter.url)
          ) {
            return false;
          }
          if (
            normalizedFilter.method &&
            typeof normalizedFilter.method === 'string' &&
            entry.method !== normalizedFilter.method.toUpperCase()
          ) {
            return false;
          }
          if (
            typeof normalizedFilter.status === 'number' &&
            entry.status !== normalizedFilter.status
          ) {
            return false;
          }
          return true;
        })
        .map((entry) => Object.assign({}, entry));

      this._networkBuffer.splice(0, this._networkBuffer.length);
      return { requests };
    },

    getConsoleLogs(level) {
      const logs = this._consoleBuffer
        .filter((entry) => {
          return typeof level === 'string' ? entry.level === level : true;
        })
        .map((entry) => Object.assign({}, entry));

      return { logs };
    },

    runtimeInfo() {
      let storageAccess = true;
      try {
        void window.localStorage;
      } catch (_) {
        storageAccess = false;
      }

      return {
        available: true,
        version: this.VERSION,
        epoch: this._epoch,
        capabilities: {
          snapshot: true,
          refResolution: true,
          consoleCapture: patchState.consolePatched,
          networkCapture: patchState.networkPatched,
          storageAccess,
        },
      };
    },
  };

  function installNavigationListeners() {
    if (patchState.navigationListenersInstalled) {
      return;
    }

    const persistOnNavigation = () => {
      if (window.__orbit && typeof window.__orbit._incrementEpoch === 'function') {
        window.__orbit._incrementEpoch();
      }
    };

    const persistBeforeUnload = () => {
      if (!window.__orbit) {
        return;
      }
      persistRuntimeState({
        epoch: window.__orbit._epoch + 1,
        knownRefs: window.__orbit._knownRefs,
      });
    };

    window.addEventListener('popstate', persistOnNavigation);
    window.addEventListener('hashchange', persistOnNavigation);
    window.addEventListener('pagehide', persistBeforeUnload);

    patchState.navigationListenersInstalled = true;
  }

  installClosedShadowTracking();
  installConsoleCapture();
  installNetworkCapture();
  installNavigationListeners();
  runtime._persistState();

  window.__orbit = runtime;
})();
