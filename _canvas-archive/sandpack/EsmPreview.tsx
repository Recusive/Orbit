/**
 * EsmPreview - Lightweight preview using ESM CDN imports (no Sandpack bundler)
 *
 * This approach loads React directly from esm.sh CDN and uses Babel standalone
 * for in-browser JSX transpilation. Much faster and more reliable than Sandpack
 * which requires external bundler service calls.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ERROR_MESSAGES } from './sandpackConfig';

export interface EsmPreviewProps {
  nodeId: string;
  instanceId: string;
  code: string;
  deviceId: string;
  deviceWidth: number;
  deviceHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  editMode?: boolean;
  pendingClassUpdate?: string | null;
  pendingStyleUpdate?: { property: string; value: string } | null;
  onError?: (instanceId: string, error: string) => void;
  onReady?: (instanceId: string) => void;
  onElementSelect?: (element: SelectedElement) => void;
}

export interface SelectedElement {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  rect: DOMRect;
  computedStyles: Record<string, string>;
  path: string; // CSS selector path
  jsxPath: string; // JSX element path for structural editing (e.g., "0.1.2")
}

// Message types from iframe
interface IframeMessage {
  type: string;
  instanceId?: string;
  nodeId?: string;
  payload?: {
    error?: string;
    tagName?: string;
    className?: string;
    id?: string;
    textContent?: string;
    rect?: DOMRect;
    computedStyles?: Record<string, string>;
    path?: string;
    jsxPath?: string;
  };
}

function isIframeMessage(data: unknown): data is IframeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as IframeMessage).type === 'string'
  );
}

interface PreviewState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
}

/**
 * Calculate scale factor to fit viewport dimensions inside node bounds.
 * Ensures a minimum scale of 0.5 so content remains readable.
 */
function calculateScale(
  viewportWidth: number,
  viewportHeight: number,
  nodeWidth: number,
  nodeHeight: number
): number {
  const availableWidth = nodeWidth - 16;
  const availableHeight = nodeHeight - 16;

  const scaleX = availableWidth / viewportWidth;
  const scaleY = availableHeight / viewportHeight;

  // Use the smaller scale to fit entirely, but enforce minimum 0.5 for readability
  const fitScale = Math.min(scaleX, scaleY, 1);
  return Math.max(fitScale, 0.5);
}

/**
 * Generate HTML document with ESM imports and inline Babel transpilation
 */
function generatePreviewHtml(code: string, nodeId: string, instanceId: string): string {
  // Remove TypeScript type annotations for browser compatibility
  const cleanedCode = code
    // Remove type imports
    .replace(/import\s+type\s+.*?from\s+['"][^'"]+['"];?\n?/g, '')
    // Remove inline type annotations like : string, : number, etc.
    .replace(
      /:\s*(string|number|boolean|any|void|null|undefined|React\.[\w<>,\s]+|[\w]+\[\])\s*([,)=;{])/g,
      '$2'
    )
    // Remove generic type params like <T> but preserve JSX
    .replace(/<([A-Z][a-zA-Z]*(?:,\s*[A-Z][a-zA-Z]*)*)>(?=\s*\()/g, '')
    // Remove "as" type assertions
    .replace(/\s+as\s+[\w<>[\]|&]+/g, '')
    // Remove interface/type declarations
    .replace(/(?:export\s+)?(?:interface|type)\s+\w+.*?(?:;|\{[\s\S]*?\})\n?/g, '')
    // Remove React.FC type annotations
    .replace(/:\s*React\.FC(?:<[^>]*>)?/g, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<script src="https://cdn.tailwindcss.com"></script>
	<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
	<style>
		html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
		body { font-family: system-ui, -apple-system, sans-serif; background-color: white; overflow-x: hidden; }
		#root { height: 100%; position: relative; }
		.preview-loading { display: flex; align-items: center; justify-content: center; height: 100%; color: #6b7280; }
		.preview-error { padding: 16px; background: #fef2f2; color: #991b1b; font-size: 12px; white-space: pre-wrap; }

		/* Selection overlay styles */
		#orbit-selection-overlay {
			position: fixed;
			pointer-events: none;
			z-index: 99999;
			border: 2px solid #3b82f6;
			background: rgba(59, 130, 246, 0.1);
			transition: all 0.1s ease;
			display: none;
		}
		#orbit-selection-overlay.hover {
			border-style: dashed;
			background: rgba(59, 130, 246, 0.05);
		}
		#orbit-selection-overlay.selected {
			border-style: solid;
			background: rgba(59, 130, 246, 0.1);
		}
		#orbit-selection-label {
			position: absolute;
			top: -20px;
			left: 0;
			background: #3b82f6;
			color: white;
			font-size: 10px;
			padding: 2px 6px;
			border-radius: 2px;
			white-space: nowrap;
			font-family: system-ui, sans-serif;
		}
		.orbit-edit-mode * {
			cursor: crosshair !important;
		}
	</style>
</head>
<body>
	<div id="root"><div class="preview-loading">Loading...</div></div>
	<div id="orbit-selection-overlay"><span id="orbit-selection-label"></span></div>

	<script type="module">
		// Import React from ESM CDN
		import React from 'https://esm.sh/react@18.2.0';
		import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';

		// Make React available globally for transpiled code
		window.React = React;
		window.ReactDOM = ReactDOM;

		const nodeId = ${JSON.stringify(nodeId)};
		const instanceId = ${JSON.stringify(instanceId)};

		// Component code (will be transpiled)
		const componentCode = ${JSON.stringify(cleanedCode)};

		// Selection state
		let editMode = false;
		let selectedElement = null;
		let hoveredElement = null;
		const overlay = document.getElementById('orbit-selection-overlay');
		const overlayLabel = document.getElementById('orbit-selection-label');

		function reportReady() {
			window.parent.postMessage({
				type: 'component-ready',
				instanceId: instanceId,
				nodeId: nodeId
			}, '*');
		}

		function reportError(error) {
			window.parent.postMessage({
				type: 'component-error',
				instanceId: instanceId,
				nodeId: nodeId,
				payload: { error: error.message || String(error), errorStack: error.stack }
			}, '*');
		}

		function reportDimensions() {
			const root = document.getElementById('root');
			if (root) {
				window.parent.postMessage({
					type: 'component-rendered',
					instanceId: instanceId,
					nodeId: nodeId,
					payload: {
						dimensions: {
							width: root.scrollWidth,
							height: root.scrollHeight
						}
					}
				}, '*');
			}
		}

		// Get CSS selector path for element
		function getElementPath(el) {
			if (!el || el === document.body) return 'body';
			const parts = [];
			while (el && el !== document.body) {
				let selector = el.tagName.toLowerCase();
				if (el.id) {
					selector = '#' + el.id;
					parts.unshift(selector);
					break;
				}
				if (el.className && typeof el.className === 'string') {
					const classes = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
					if (classes) selector += '.' + classes;
				}
				const parent = el.parentElement;
				if (parent) {
					const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
					if (siblings.length > 1) {
						const index = siblings.indexOf(el) + 1;
						selector += ':nth-child(' + index + ')';
					}
				}
				parts.unshift(selector);
				el = parent;
			}
			return parts.join(' > ');
		}

		// Get JSX element path (indices of element children only, excluding text nodes)
		function getJSXPath(el) {
			if (!el || el === document.body) return '';
			const indices = [];
			let current = el;

			// Find the React root container
			const rootContainer = document.getElementById('root') || document.body;

			while (current && current !== rootContainer && current.parentElement) {
				const parent = current.parentElement;
				// Get only element children (not text nodes)
				const elementChildren = Array.from(parent.children);
				const index = elementChildren.indexOf(current);
				if (index >= 0) {
					indices.unshift(index);
				}
				current = parent;
			}

			return indices.join('.');
		}

		// Get computed styles for element
		function getElementStyles(el) {
			const computed = window.getComputedStyle(el);
			const styles = {};
			const props = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'fontFamily',
				'padding', 'margin', 'border', 'borderRadius', 'width', 'height',
				'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap'];
			props.forEach(prop => {
				styles[prop] = computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
			});
			return styles;
		}

		// Update overlay position
		function updateOverlay(el, isSelected) {
			if (!el || el === document.body || el.id === 'orbit-selection-overlay') {
				overlay.style.display = 'none';
				return;
			}
			const rect = el.getBoundingClientRect();
			overlay.style.display = 'block';
			overlay.style.left = rect.left + 'px';
			overlay.style.top = rect.top + 'px';
			overlay.style.width = rect.width + 'px';
			overlay.style.height = rect.height + 'px';
			overlay.className = isSelected ? 'selected' : 'hover';

			// Update label
			let label = el.tagName.toLowerCase();
			if (el.id) label += '#' + el.id;
			else if (el.className && typeof el.className === 'string') {
				const firstClass = el.className.trim().split(/\\s+/)[0];
				if (firstClass) label += '.' + firstClass;
			}
			overlayLabel.textContent = label;
		}

		// Report selected element to parent
		function reportElementSelect(el) {
			const rect = el.getBoundingClientRect();
			window.parent.postMessage({
				type: 'element-selected',
				instanceId: instanceId,
				nodeId: nodeId,
				payload: {
					tagName: el.tagName.toLowerCase(),
					className: el.className || '',
					id: el.id || '',
					textContent: (el.textContent || '').slice(0, 100),
					rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
					computedStyles: getElementStyles(el),
					path: getElementPath(el),
					jsxPath: getJSXPath(el)
				}
			}, '*');
		}

		// Handle mouse move for hover highlighting
		document.addEventListener('mousemove', (e) => {
			if (!editMode) return;
			const el = document.elementFromPoint(e.clientX, e.clientY);
			if (el && el !== hoveredElement && el.id !== 'orbit-selection-overlay' && !el.closest('#orbit-selection-overlay')) {
				hoveredElement = el;
				if (!selectedElement || el !== selectedElement) {
					updateOverlay(el, false);
				}
			}
		});

		// Handle click for selection
		document.addEventListener('click', (e) => {
			if (!editMode) return;
			e.preventDefault();
			e.stopPropagation();

			const el = document.elementFromPoint(e.clientX, e.clientY);
			if (el && el.id !== 'orbit-selection-overlay' && !el.closest('#orbit-selection-overlay')) {
				selectedElement = el;
				updateOverlay(el, true);
				reportElementSelect(el);
			}
		}, true);

		// Listen for messages from parent
		window.addEventListener('message', (e) => {
			const msg = e.data;
			if (!msg || (msg.instanceId !== instanceId && msg.nodeId !== nodeId)) return;

			if (msg.type === 'enable-edit-mode') {
				editMode = true;
				document.body.classList.add('orbit-edit-mode');
			}
			if (msg.type === 'disable-edit-mode') {
				editMode = false;
				selectedElement = null;
				hoveredElement = null;
				overlay.style.display = 'none';
				document.body.classList.remove('orbit-edit-mode');
			}
			if (msg.type === 'update-element-style' && selectedElement) {
				const { property, value } = msg.payload;
				selectedElement.style[property] = value;
				updateOverlay(selectedElement, true);
				reportElementSelect(selectedElement);
			}
			if (msg.type === 'update-element-class' && selectedElement) {
				const { className } = msg.payload;
				selectedElement.className = className;
				updateOverlay(selectedElement, true);
				reportElementSelect(selectedElement);
			}
		});

		try {
			// Transpile JSX using Babel
			const transpiledCode = Babel.transform(componentCode, {
				presets: ['react'],
				filename: 'App.jsx'
			}).code;

			// Check if code already has an export default
			const hasExportDefault = /export\\s+default/.test(transpiledCode);

			// Create a module from the transpiled code
			const moduleBlob = new Blob([
				'const React = window.React;\\n',
				'const { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext } = React;\\n',
				transpiledCode,
				hasExportDefault ? '' : '\\nexport default typeof App !== "undefined" ? App : (typeof Component !== "undefined" ? Component : () => React.createElement("div", null, "No component found"));'
			], { type: 'text/javascript' });

			const moduleUrl = URL.createObjectURL(moduleBlob);

			// Dynamically import the module
			const module = await import(moduleUrl);
			const Component = module.default;

			// Render the component
			const root = ReactDOM.createRoot(document.getElementById('root'));
			root.render(React.createElement(Component));

			// Report success
			setTimeout(() => {
				reportReady();
				reportDimensions();
			}, 100);

			URL.revokeObjectURL(moduleUrl);
		} catch (error) {
			console.error('Preview error:', error);
			document.getElementById('root').innerHTML = '<div class="preview-error">' + (error.message || error) + '</div>';
			reportError(error);
		}
	</script>
</body>
</html>`;
}

export function EsmPreview({
  nodeId,
  instanceId,
  code,
  deviceWidth,
  deviceHeight,
  nodeWidth,
  nodeHeight,
  editMode = false,
  pendingClassUpdate,
  pendingStyleUpdate,
  onError,
  onReady,
  onElementSelect,
}: EsmPreviewProps): React.JSX.Element {
  const [state, setState] = useState<PreviewState>({
    status: 'loading',
    error: null,
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const callbackRefs = useRef({ onError, onReady, onElementSelect });
  callbackRefs.current = { onError, onReady, onElementSelect };

  const scale = calculateScale(deviceWidth, deviceHeight, nodeWidth, nodeHeight);

  // Generate preview HTML
  const previewHtml = useMemo(() => {
    return generatePreviewHtml(code, nodeId, instanceId);
  }, [code, nodeId, instanceId]);

  // Send edit mode state to iframe
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: editMode ? 'enable-edit-mode' : 'disable-edit-mode',
          instanceId,
          nodeId,
        },
        '*'
      );
    }
  }, [editMode, instanceId, nodeId]);

  // Send class update to iframe
  useEffect(() => {
    if (
      pendingClassUpdate !== null &&
      pendingClassUpdate !== undefined &&
      iframeRef.current?.contentWindow
    ) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'update-element-class',
          instanceId,
          nodeId,
          payload: { className: pendingClassUpdate },
        },
        '*'
      );
    }
  }, [pendingClassUpdate, instanceId, nodeId]);

  // Send style update to iframe
  useEffect(() => {
    if (pendingStyleUpdate && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'update-element-style',
          instanceId,
          nodeId,
          payload: pendingStyleUpdate,
        },
        '*'
      );
    }
  }, [pendingStyleUpdate, instanceId, nodeId]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      const data: unknown = event.data;
      if (!isIframeMessage(data) || (data.instanceId !== instanceId && data.nodeId !== nodeId)) {
        return;
      }

      if (data.type === 'component-ready') {
        setState({ status: 'ready', error: null });
        callbackRefs.current.onReady?.(instanceId);
      }

      if (data.type === 'component-error') {
        const errorMessage = data.payload?.error ?? ERROR_MESSAGES.RUNTIME_ERROR;
        setState({ status: 'error', error: errorMessage });
        callbackRefs.current.onError?.(instanceId, errorMessage);
      }

      if (data.type === 'element-selected' && data.payload !== undefined) {
        callbackRefs.current.onElementSelect?.(data.payload as SelectedElement);
      }
    };

    window.addEventListener('message', handleMessage);
    return (): void => {
      window.removeEventListener('message', handleMessage);
    };
  }, [instanceId, nodeId]);

  // Timeout detection
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (state.status === 'loading') {
        setState({ status: 'error', error: ERROR_MESSAGES.TIMEOUT_ERROR });
        callbackRefs.current.onError?.(instanceId, ERROR_MESSAGES.TIMEOUT_ERROR);
      }
    }, 10000); // 10 second timeout (much shorter since no bundler)

    return (): void => {
      clearTimeout(timeoutId);
    };
  }, [state.status, instanceId]);

  const handleRetry = useCallback((): void => {
    setState({ status: 'loading', error: null });
    // Force iframe reload by updating src
    if (iframeRef.current) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  return (
    <div style={styles['container']}>
      {/* Loading skeleton */}
      {state.status === 'loading' && (
        <div style={styles['loadingOverlay']}>
          <div style={styles['skeleton']}>
            <div style={styles['skeletonHeader']} />
            <div style={styles['skeletonBody']} />
          </div>
        </div>
      )}

      {/* Error banner */}
      {state.status === 'error' && state.error !== null && (
        <div style={styles['errorBanner']}>
          <span style={styles['errorIcon']}>!</span>
          <span style={styles['errorText']}>
            {state.error.length > 50 ? `${state.error.slice(0, 50)}...` : state.error}
          </span>
          <button style={styles['retryButton']} onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Preview iframe */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: deviceWidth,
          height: deviceHeight,
          transformOrigin: 'top left',
          transform: `scale(${String(scale)})`,
        }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={previewHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#ffffff',
          }}
          sandbox="allow-scripts allow-same-origin"
          title={`Preview ${nodeId}`}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    zIndex: 10,
  },
  skeleton: {
    width: '80%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  skeletonHeader: {
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonBody: {
    height: 60,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    animation: 'pulse 1.5s ease-in-out infinite',
    animationDelay: '0.1s',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    borderTop: '1px solid #fecaca',
    zIndex: 20,
  },
  errorIcon: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    color: '#991b1b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  retryButton: {
    padding: '4px 8px',
    fontSize: 10,
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    flexShrink: 0,
  },
};
