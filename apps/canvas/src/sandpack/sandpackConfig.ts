/**
 * Sandpack configuration for the Orbit Canvas
 * Defines default dependencies, templates, and viewport presets
 */

// Device preset structure
export interface DevicePreset {
  width: number;
  height: number;
  label: string;
  category: 'phone' | 'tablet' | 'desktop' | 'watch' | 'tv' | 'social';
}

// Comprehensive device presets
export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  // Phone
  'iphone-se': { width: 375, height: 667, label: 'iPhone SE', category: 'phone' },
  'iphone-14': { width: 390, height: 844, label: 'iPhone 14', category: 'phone' },
  'iphone-14-pro': { width: 393, height: 852, label: 'iPhone 14 Pro', category: 'phone' },
  'iphone-14-pro-max': { width: 430, height: 932, label: 'iPhone 14 Pro Max', category: 'phone' },
  'iphone-15-pro': { width: 393, height: 852, label: 'iPhone 15 Pro', category: 'phone' },
  'pixel-7': { width: 412, height: 915, label: 'Pixel 7', category: 'phone' },
  'galaxy-s23': { width: 360, height: 780, label: 'Galaxy S23', category: 'phone' },

  // Tablet
  'ipad-mini': { width: 744, height: 1133, label: 'iPad Mini', category: 'tablet' },
  ipad: { width: 810, height: 1080, label: 'iPad', category: 'tablet' },
  'ipad-air': { width: 820, height: 1180, label: 'iPad Air', category: 'tablet' },
  'ipad-pro-11': { width: 834, height: 1194, label: 'iPad Pro 11"', category: 'tablet' },
  'ipad-pro-12': { width: 1024, height: 1366, label: 'iPad Pro 12.9"', category: 'tablet' },
  'surface-pro': { width: 912, height: 1368, label: 'Surface Pro', category: 'tablet' },

  // Desktop
  'macbook-air': { width: 1280, height: 832, label: 'MacBook Air', category: 'desktop' },
  'macbook-pro-14': { width: 1512, height: 982, label: 'MacBook Pro 14"', category: 'desktop' },
  'macbook-pro-16': { width: 1728, height: 1117, label: 'MacBook Pro 16"', category: 'desktop' },
  'desktop-1440': { width: 1440, height: 1024, label: 'Desktop', category: 'desktop' },
  'desktop-1920': { width: 1920, height: 1080, label: 'Desktop HD', category: 'desktop' },
  wireframe: { width: 1440, height: 1024, label: 'Wireframe', category: 'desktop' },

  // Watch
  'apple-watch-41': { width: 176, height: 215, label: 'Apple Watch 41mm', category: 'watch' },
  'apple-watch-45': { width: 198, height: 242, label: 'Apple Watch 45mm', category: 'watch' },
  'apple-watch-ultra': { width: 205, height: 251, label: 'Apple Watch Ultra', category: 'watch' },

  // TV
  'tv-720': { width: 1280, height: 720, label: 'TV 720p', category: 'tv' },
  'tv-1080': { width: 1920, height: 1080, label: 'TV 1080p', category: 'tv' },
  'tv-4k': { width: 3840, height: 2160, label: 'TV 4K', category: 'tv' },

  // Social Media
  'instagram-post': { width: 1080, height: 1080, label: 'Instagram Post', category: 'social' },
  'instagram-story': { width: 1080, height: 1920, label: 'Instagram Story', category: 'social' },
  'twitter-post': { width: 1200, height: 675, label: 'Twitter Post', category: 'social' },
  'linkedin-post': { width: 1200, height: 627, label: 'LinkedIn Post', category: 'social' },
  'youtube-thumbnail': { width: 1280, height: 720, label: 'YouTube Thumbnail', category: 'social' },
} as const;

// Category labels for UI grouping
export const DEVICE_CATEGORIES = {
  phone: 'Phone',
  tablet: 'Tablet',
  desktop: 'Desktop',
  watch: 'Watch',
  tv: 'TV',
  social: 'Social Media',
} as const;

// Get devices by category
export function getDevicesByCategory(
  category: DevicePreset['category']
): { id: string; preset: DevicePreset }[] {
  return Object.entries(DEVICE_PRESETS)
    .filter(([, preset]) => preset.category === category)
    .map(([id, preset]) => ({ id, preset }));
}

// Legacy viewport presets (for backwards compatibility)
export const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 667, label: 'iPhone SE' },
  tablet: { width: 768, height: 1024, label: 'iPad' },
  desktop: { width: 1200, height: 800, label: 'Desktop' },
} as const;

export type ViewportType = keyof typeof VIEWPORT_PRESETS;
export type DeviceId = keyof typeof DEVICE_PRESETS;

// Minimal dependencies for fast Sandpack loading
// Only React is required - Tailwind is loaded via CDN
// Additional dependencies can be added per-component when needed
export const SANDPACK_DEPENDENCIES = {
  // Core React (required)
  react: '^18.2.0',
  'react-dom': '^18.2.0',
} as const;

// Extended dependencies - use these when components need them
// Add to individual SandpackProvider customSetup.dependencies as needed
export const EXTENDED_DEPENDENCIES = {
  // Animation & Motion
  'framer-motion': '^11.0.0',

  // Icons
  'lucide-react': '^0.300.0',

  // Utility Libraries
  clsx: '^2.0.0',
  'tailwind-merge': '^2.0.0',
  'class-variance-authority': '^0.7.0',

  // Radix Primitives (foundation of shadcn/ui)
  '@radix-ui/react-slot': '^1.0.2',
  '@radix-ui/react-dialog': '^1.0.5',
  '@radix-ui/react-dropdown-menu': '^2.0.6',
  '@radix-ui/react-tabs': '^1.1.0',
  '@radix-ui/react-accordion': '^1.1.2',
  '@radix-ui/react-select': '^2.0.0',
  '@radix-ui/react-checkbox': '^1.0.4',
  '@radix-ui/react-switch': '^1.0.3',
  '@radix-ui/react-tooltip': '^1.0.7',
  '@radix-ui/react-popover': '^1.0.7',
  '@radix-ui/react-alert-dialog': '^1.0.5',
  '@radix-ui/react-avatar': '^1.0.4',
  '@radix-ui/react-hover-card': '^1.0.7',
  '@radix-ui/react-navigation-menu': '^1.1.4',
  '@radix-ui/react-progress': '^1.0.3',
  '@radix-ui/react-radio-group': '^1.1.3',
  '@radix-ui/react-scroll-area': '^1.0.5',
  '@radix-ui/react-separator': '^1.0.3',
  '@radix-ui/react-slider': '^1.1.2',
  '@radix-ui/react-toast': '^1.1.5',
  '@radix-ui/react-toggle': '^1.0.3',
  '@radix-ui/react-toggle-group': '^1.0.4',

  // Date Handling
  'date-fns': '^3.0.0',
} as const;

// Tailwind CSS CDN script to inject into preview
export const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"></script>';

// Default App.tsx template for new components
export const DEFAULT_APP_TEMPLATE = `import React from 'react';

export default function App() {
	return (
		<div className="p-4">
			<h1 className="text-2xl font-bold text-gray-900">
				Hello from Sandpack
			</h1>
			<p className="text-gray-600 mt-2">
				Edit this component to see live updates
			</p>
		</div>
	);
}
`;

// Index file that mounts the App component
export const INDEX_TEMPLATE = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
`;

// Utility file with cn function (shadcn/ui pattern)
export const UTILS_TEMPLATE = `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS conflict resolution
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
`;

// Bridge script for bidirectional communication with parent window
// Includes instanceId for multi-preview routing
const BRIDGE_SCRIPT = `
<script>
(function() {
	// Get node ID and instance ID from global variables (injected by template)
	const nodeId = window.__ORBIT_NODE_ID__ ?? 'unknown';
	const instanceId = window.__ORBIT_INSTANCE_ID__ ?? nodeId;
	let lastErrors = [];

	// Report when component is ready
	window.addEventListener('load', () => {
		window.parent.postMessage({
			type: 'component-ready',
			instanceId: instanceId,
			nodeId: nodeId
		}, '*');
	});

	// Report component dimensions after render
	const reportDimensions = () => {
		const root = document.getElementById('root');
		if (root !== null && root !== undefined) {
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
	};

	// Observe DOM changes to report dimensions
	const observer = new MutationObserver(reportDimensions);
	setTimeout(() => {
		observer.observe(document.body, { childList: true, subtree: true });
		reportDimensions();
	}, 100);

	// Report errors to parent
	window.onerror = (message, source, lineno, colno, error) => {
		const errorInfo = { error: message, errorStack: error?.stack };
		lastErrors.push(errorInfo);
		window.parent.postMessage({
			type: 'component-error',
			instanceId: instanceId,
			nodeId: nodeId,
			payload: errorInfo
		}, '*');
		return false;
	};

	// Report unhandled promise rejections
	window.onunhandledrejection = (event) => {
		const errorInfo = {
			error: event.reason?.message ?? event.reason,
			errorStack: event.reason?.stack
		};
		lastErrors.push(errorInfo);
		window.parent.postMessage({
			type: 'component-error',
			instanceId: instanceId,
			nodeId: nodeId,
			payload: errorInfo
		}, '*');
	};

	// Report user interactions (for click-to-select)
	document.addEventListener('click', (e) => {
		const target = e.target as Element;
		const sourceLocEl = target.closest('[data-source-loc]');
		const sourceLoc = sourceLocEl?.getAttribute('data-source-loc');
		const tagName = target.tagName.toLowerCase();
		const className = (target as HTMLElement).className || '';
		const id = (target as HTMLElement).id || '';

		window.parent.postMessage({
			type: 'user-interaction',
			instanceId: instanceId,
			nodeId: nodeId,
			payload: {
				event: 'click',
				target: id ?? className ?? tagName,
				sourceLoc: sourceLoc ?? null,
				rect: sourceLocEl ? sourceLocEl.getBoundingClientRect() : null
			}
		}, '*');
	}, true);

	// === Perception API ===

	// Build ARIA tree from DOM element
	function buildAriaTree(el, includeHidden = false) {
		if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

		const style = window.getComputedStyle(el);
		const isHidden = style.display === 'none' ||
										 style.visibility === 'hidden' ||
										 el.getAttribute('aria-hidden') === 'true';

		if (isHidden && !includeHidden) return null;

		// Compute accessible role
		const explicitRole = el.getAttribute('role');
		const implicitRole = getImplicitRole(el);
		const role = explicitRole ?? implicitRole ?? 'generic';

		// Compute accessible name
		const name = getAccessibleName(el);

		// Build node
		const node = { role };
		if (name !== null && name !== undefined && name !== '') node.name = name;

		// Add ARIA states
		const ariaChecked = el.getAttribute('aria-checked');
		if (ariaChecked !== null) {
			node.checked = ariaChecked === 'mixed' ? 'mixed' : ariaChecked === 'true';
		}
		if (el.getAttribute('aria-selected') === 'true') node.selected = true;
		if (el.getAttribute('aria-expanded') !== null) {
			node.expanded = el.getAttribute('aria-expanded') === 'true';
		}
		if (el.getAttribute('aria-disabled') === 'true' || el.disabled) node.disabled = true;
		if (el.getAttribute('aria-required') === 'true' || el.required) node.required = true;

		const level = el.getAttribute('aria-level');
		if (level !== null && level !== undefined && level !== '') node.level = parseInt(level, 10);
		if (el.tagName.match(/^H[1-6]$/i)) {
			node.level = parseInt(el.tagName.charAt(1), 10);
		}

		// Recurse to children
		const children = [];
		for (const child of el.children) {
			const childNode = buildAriaTree(child, includeHidden);
			if (childNode !== null && childNode !== undefined) children.push(childNode);
		}
		if (children.length > 0) node.children = children;

		return node;
	}

	function getImplicitRole(el) {
		const tag = el.tagName.toLowerCase();
		const roleMap = {
			'a': el.hasAttribute('href') ? 'link' : null,
			'article': 'article',
			'aside': 'complementary',
			'button': 'button',
			'dialog': 'dialog',
			'form': 'form',
			'h1': 'heading', 'h2': 'heading', 'h3': 'heading',
			'h4': 'heading', 'h5': 'heading', 'h6': 'heading',
			'header': 'banner',
			'img': 'img',
			'input': getInputRole(el),
			'li': 'listitem',
			'main': 'main',
			'nav': 'navigation',
			'ol': 'list',
			'option': 'option',
			'progress': 'progressbar',
			'section': el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : null,
			'select': 'combobox',
			'table': 'table',
			'tbody': 'rowgroup',
			'td': 'cell',
			'textarea': 'textbox',
			'th': 'columnheader',
			'thead': 'rowgroup',
			'tr': 'row',
			'ul': 'list'
		};
		return roleMap[tag] || null;
	}

	function getInputRole(el) {
		const type = (el.getAttribute('type') ?? 'text').toLowerCase();
		const inputRoles = {
			'button': 'button', 'checkbox': 'checkbox', 'email': 'textbox',
			'number': 'spinbutton', 'radio': 'radio', 'range': 'slider',
			'search': 'searchbox', 'submit': 'button', 'tel': 'textbox',
			'text': 'textbox', 'url': 'textbox'
		};
		return inputRoles[type] ?? 'textbox';
	}

	function getAccessibleName(el) {
		// aria-label takes precedence
		const ariaLabel = el.getAttribute('aria-label');
		if (ariaLabel !== null && ariaLabel !== undefined && ariaLabel !== '') return ariaLabel;

		// aria-labelledby
		const labelledBy = el.getAttribute('aria-labelledby');
		if (labelledBy !== null && labelledBy !== undefined && labelledBy !== '') {
			const labels = labelledBy.split(/\\s+/).map(id => {
				const labelEl = document.getElementById(id);
				return labelEl !== null && labelEl !== undefined ? labelEl.textContent : '';
			}).filter(Boolean);
			if (labels.length > 0) return labels.join(' ');
		}

		// For inputs, check associated label
		if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
			const id = el.getAttribute('id');
			if (id !== null && id !== undefined && id !== '') {
				const label = document.querySelector('label[for="' + id + '"]');
				if (label !== null && label !== undefined) return label.textContent?.trim();
			}
		}

		// alt text for images
		if (el.tagName === 'IMG') {
			return el.getAttribute('alt') || '';
		}

		// For buttons and links, use text content
		if (el.tagName === 'BUTTON' || el.tagName === 'A') {
			return el.textContent?.trim() || '';
		}

		return null;
	}

	// Serialize ARIA tree to text
	function serializeAriaTree(node: any, indent: number = 0): string {
		if (node === null || node === undefined) return '';
		const pad = '  '.repeat(indent);
		let line = pad + String(node.role ?? '');
		if (node.name !== null && node.name !== undefined && node.name !== '') line += ' "' + String(node.name) + '"';
		if (node.level !== null && node.level !== undefined && node.level !== 0) line += ' level=' + String(node.level);
		if (node.checked !== undefined) line += ' checked=' + String(node.checked);
		if (node.selected === true) line += ' selected';
		if (node.expanded !== undefined) line += ' expanded=' + String(node.expanded);
		if (node.disabled === true) line += ' disabled';
		if (node.required === true) line += ' required';
		let result = line + '\\n';
		if (node.children !== null && node.children !== undefined && node.children.length > 0) {
			for (const child of node.children) {
				result += serializeAriaTree(child, indent + 1);
			}
		}
		return result;
	}

	function countAriaNodes(node) {
		if (node === null || node === undefined) return 0;
		let count = 1;
		if (node.children !== null && node.children !== undefined && node.children.length > 0) {
			for (const child of node.children) {
				count += countAriaNodes(child);
			}
		}
		return count;
	}

	// Get computed styles for element
	function getElementComputedStyles(selector, properties) {
		const defaultProps = [
			'color', 'background-color', 'font-size', 'font-weight', 'font-family',
			'line-height', 'padding', 'margin', 'border', 'border-radius',
			'width', 'height', 'display', 'flex-direction', 'justify-content',
			'align-items', 'gap', 'position', 'top', 'right', 'bottom', 'left'
		];
		const propsToGet = properties ?? defaultProps;

		const root = document.getElementById('root');
		const el = selector ? root?.querySelector(selector) : root?.firstElementChild;
		if (!el) return { matchCount: 0, styles: {} };

		const matches = selector ? root.querySelectorAll(selector) : [el];
		const computed = window.getComputedStyle(el);
		const styles = {};

		for (const prop of propsToGet) {
			const value = computed.getPropertyValue(prop);
			if (value !== null && value !== undefined && value !== '') {
				styles[prop] = { raw: value };
			}
		}

		return { matchCount: matches.length, styles };
	}

	// Get element bounds
	function getElementsBounds(selector, includeChildren) {
		const root = document.getElementById('root');
		if (root === null || root === undefined) return { elements: [], viewport: { width: 0, height: 0 } };

		let elements = [];
		if (selector === null || selector === undefined || selector === '' || selector === ':root') {
			const el = root.firstElementChild;
			if (el !== null && el !== undefined) elements = [el];
		} else if (selector === '*') {
			elements = Array.from(root.querySelectorAll('*'));
		} else {
			elements = Array.from(root.querySelectorAll(selector));
		}

		if (includeChildren === true && elements.length === 1) {
			elements = [elements[0], ...Array.from(elements[0].querySelectorAll('*'))];
		}

		const results = elements.map(el => {
			const rect = el.getBoundingClientRect();
			return {
				selector: getElementSelector(el),
				tagName: el.tagName.toLowerCase(),
				id: el.id || undefined,
				className: el.className || undefined,
				rect: {
					x: rect.x, y: rect.y,
					width: rect.width, height: rect.height,
					top: rect.top, right: rect.right,
					bottom: rect.bottom, left: rect.left
				},
				sourceLoc: el.getAttribute('data-source-loc') || undefined
			};
		});

		return {
			elements: results,
			viewport: { width: window.innerWidth, height: window.innerHeight }
		};
	}

	function getElementSelector(el) {
		if (el.id !== null && el.id !== undefined && el.id !== '') return '#' + el.id;
		if (el.className !== null && el.className !== undefined && el.className !== '') return el.tagName.toLowerCase() + '.' + el.className.split(' ')[0];
		return el.tagName.toLowerCase();
	}

	// Listen for perception requests from parent
	window.addEventListener('message', (event) => {
		const msg = event.data;
		// Accept messages targeted at this instance or node
		if (!msg || (msg.instanceId !== instanceId && msg.nodeId !== nodeId)) return;

		if (msg.type === 'reset') {
			lastErrors = [];
			location.reload();
			return;
		}

		// Handle perception requests
		if (msg.type === 'get-aria-snapshot') {
			const root = document.getElementById('root');
			const ariaTree = root ? buildAriaTree(root.firstElementChild, msg.includeHidden) : null;
			window.parent.postMessage({
				type: 'aria-snapshot-result',
				instanceId: instanceId,
				nodeId: nodeId,
				requestId: msg.requestId,
				payload: {
					ariaTree: ariaTree ?? { role: 'generic' },
					textRepresentation: ariaTree ? serializeAriaTree(ariaTree) : '',
					elementCount: countAriaNodes(ariaTree)
				}
			}, '*');
		}

		if (msg.type === 'get-computed-styles') {
			const result = getElementComputedStyles(msg.selector, msg.properties);
			window.parent.postMessage({
				type: 'computed-styles-result',
				instanceId: instanceId,
				nodeId: nodeId,
				requestId: msg.requestId,
				payload: {
					selector: msg.selector ?? ':root',
					...result
				}
			}, '*');
		}

		if (msg.type === 'get-element-bounds') {
			const result = getElementsBounds(msg.selector, msg.includeChildren);
			window.parent.postMessage({
				type: 'element-bounds-result',
				instanceId: instanceId,
				nodeId: nodeId,
				requestId: msg.requestId,
				payload: result
			}, '*');
		}

		if (msg.type === 'verify-component') {
			const root = document.getElementById('root');
			const ariaTree = root ? buildAriaTree(root.firstElementChild, false) : null;
			const ariaSummary = ariaTree ? serializeAriaTree(ariaTree) : 'No accessible content';

			// Check expected elements
			let foundElements, missingElements;
			if (msg.expectedElements !== null && msg.expectedElements !== undefined && msg.expectedElements.length > 0) {
				foundElements = [];
				missingElements = [];
				for (const sel of msg.expectedElements) {
					if (root?.querySelector(sel) !== null && root?.querySelector(sel) !== undefined) {
						foundElements.push(sel);
					} else {
						missingElements.push(sel);
					}
				}
			}

			window.parent.postMessage({
				type: 'verify-result',
				instanceId: instanceId,
				nodeId: nodeId,
				requestId: msg.requestId,
				payload: {
					rendered: root?.firstElementChild ? true : false,
					errors: lastErrors.map(e => e.error),
					ariaSummary: ariaSummary,
					foundElements: foundElements,
					missingElements: missingElements,
					dimensions: root ? {
						width: root.scrollWidth,
						height: root.scrollHeight
					} : undefined
				}
			}, '*');
		}
	});
})();
</script>
`;

// HTML template with Tailwind CDN
export const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	${TAILWIND_CDN}
	<style>
		html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
		body { font-family: system-ui, -apple-system, sans-serif; background-color: white; overflow-x: hidden; }
		#root { height: 100%; }
	</style>
</head>
<body>
	<div id="root"></div>
</body>
</html>
`;

// HTML template with bridge script for bidirectional communication
// instanceId is optional for backwards compatibility - defaults to nodeId if not provided
export function createHtmlTemplateWithBridge(nodeId: string, instanceId?: string): string {
  const effectiveInstanceId = instanceId ?? nodeId;
  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	${TAILWIND_CDN}
	<style>
		html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
		body { font-family: system-ui, -apple-system, sans-serif; background-color: white; overflow-x: hidden; }
		#root { height: 100%; }
	</style>
	<script>
		window.__ORBIT_NODE_ID__ = ${JSON.stringify(nodeId)};
		window.__ORBIT_INSTANCE_ID__ = ${JSON.stringify(effectiveInstanceId)};
	</script>
	${BRIDGE_SCRIPT}
</head>
<body>
	<div id="root"></div>
</body>
</html>
`;
}

// Sandpack configuration for SandpackProvider
export const SANDPACK_CONFIG = {
  template: 'react-ts' as const,
  customSetup: {
    dependencies: SANDPACK_DEPENDENCIES,
  },
  options: {
    showNavigator: false,
    showTabs: false,
    showLineNumbers: true,
    editorHeight: 'auto' as const,
    externalResources: ['https://cdn.tailwindcss.com'],
  },
};

// Default files for a new Sandpack instance
export function createDefaultFiles(
  componentCode?: string,
  options?: { includeUtils?: boolean }
): Record<string, string> {
  const files: Record<string, string> = {
    '/App.tsx': componentCode ?? DEFAULT_APP_TEMPLATE,
    '/index.tsx': INDEX_TEMPLATE,
    '/public/index.html': HTML_TEMPLATE,
  };

  // Include utils by default for design system components
  if (options?.includeUtils === undefined || options.includeUtils) {
    files['/lib/utils.ts'] = UTILS_TEMPLATE;
  }

  return files;
}

/**
 * Ensure code has React import for JSX support
 * Sandpack requires explicit React import for JSX in TypeScript files
 */
export function ensureReactImport(code: string): string {
  // Check if React is already imported
  if (/import\s+React\b/.test(code) || /import\s*\*\s*as\s+React\b/.test(code)) {
    return code;
  }
  // Prepend React import
  return `import React from 'react';\n${code}`;
}

// Error message templates for common issues
export const ERROR_MESSAGES = {
  COMPILE_ERROR: 'Component failed to compile. Check your syntax.',
  RUNTIME_ERROR: 'Component crashed during execution.',
  TIMEOUT_ERROR: 'Component took too long to render. Possible infinite loop.',
  NETWORK_ERROR: 'Failed to load dependencies. Check your network connection.',
} as const;

// Timeout configuration for sandbox execution
export const SANDBOX_TIMEOUTS = {
  compileTimeout: 15000, // 15 seconds for compilation
  renderTimeout: 15000, // 15 seconds for initial render (Sandpack bundler needs time)
  idleTimeout: 30000, // 30 seconds before pausing idle sandboxes
} as const;
