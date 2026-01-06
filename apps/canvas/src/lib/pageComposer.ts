/**
 * Page Composer for Design System Canvas
 *
 * Generates React code from page compositions with multiple components.
 */

import type { PageNodeData, ComponentSlot, PageLayout } from '../types/pageTypes';

/**
 * Generate layout styles as CSS-in-JS object string
 */
function generateLayoutStyle(layout: PageLayout): string {
  const styles: string[] = [];

  switch (layout.type) {
    case 'flex':
      styles.push(`display: 'flex'`);
      styles.push(`flexDirection: '${layout.direction ?? 'column'}'`);
      if (layout.wrap === true) styles.push(`flexWrap: 'wrap'`);
      if (layout.alignItems !== undefined) styles.push(`alignItems: '${layout.alignItems}'`);
      if (layout.justifyContent !== undefined)
        styles.push(`justifyContent: '${layout.justifyContent}'`);
      break;

    case 'stack':
      styles.push(`display: 'flex'`);
      styles.push(`flexDirection: 'column'`);
      if (layout.wrap === true) styles.push(`flexWrap: 'wrap'`);
      if (layout.alignItems !== undefined) styles.push(`alignItems: '${layout.alignItems}'`);
      if (layout.justifyContent !== undefined)
        styles.push(`justifyContent: '${layout.justifyContent}'`);
      break;

    case 'grid':
      styles.push(`display: 'grid'`);
      if (layout.gridTemplate?.columns !== undefined) {
        styles.push(`gridTemplateColumns: '${layout.gridTemplate.columns}'`);
      }
      if (layout.gridTemplate?.rows !== undefined) {
        styles.push(`gridTemplateRows: '${layout.gridTemplate.rows}'`);
      }
      if (layout.gridTemplate?.areas !== undefined) {
        const areas = layout.gridTemplate.areas;
        const areaValue = Array.isArray(areas) ? areas.join(' ') : areas;
        styles.push(`gridTemplateAreas: '${areaValue}'`);
      }
      break;

    case 'absolute':
      styles.push(`position: 'relative'`);
      break;
  }

  if (layout.gap !== undefined) styles.push(`gap: '${layout.gap}'`);
  if (layout.padding !== undefined) styles.push(`padding: '${layout.padding}'`);

  return styles.join(',\n            ');
}

/**
 * Generate position styles for a slot
 */
function generatePositionStyle(position: ComponentSlot['position']): string {
  const styles: string[] = [];

  if (position.mode === 'absolute') {
    styles.push(`position: 'absolute'`);
    if (position.x !== undefined) styles.push(`left: ${String(position.x)}`);
    if (position.y !== undefined) styles.push(`top: ${String(position.y)}`);
    if (position.width !== undefined) {
      styles.push(
        `width: ${typeof position.width === 'number' ? String(position.width) : `'${position.width}'`}`
      );
    }
    if (position.height !== undefined) {
      styles.push(
        `height: ${typeof position.height === 'number' ? String(position.height) : `'${position.height}'`}`
      );
    }
  } else {
    // Flow mode
    if (position.gridArea !== undefined) styles.push(`gridArea: '${position.gridArea}'`);
    if (position.flexGrow !== undefined) styles.push(`flexGrow: ${String(position.flexGrow)}`);
    if (position.flexShrink !== undefined)
      styles.push(`flexShrink: ${String(position.flexShrink)}`);
    if (position.flexBasis !== undefined) styles.push(`flexBasis: '${position.flexBasis}'`);
    if (position.alignSelf !== undefined) styles.push(`alignSelf: '${position.alignSelf}'`);
    if (position.justifySelf !== undefined) styles.push(`justifySelf: '${position.justifySelf}'`);
    if (position.order !== undefined) styles.push(`order: ${String(position.order)}`);
  }

  return styles.join(', ');
}

/**
 * Generate props string for a component
 */
function generatePropsString(props?: Record<string, unknown>): string {
  if (props === undefined || Object.keys(props).length === 0) {
    return '';
  }

  return Object.entries(props)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}="${value}"`;
      } else if (typeof value === 'boolean') {
        return value ? key : '';
      } else {
        return `${key}={${JSON.stringify(value)}}`;
      }
    })
    .filter((v) => v !== '')
    .join(' ');
}

/**
 * PageComposer class for generating page code
 */
export class PageComposer {
  /**
   * Generate preview code for a page
   * This code is used in Sandpack for live preview
   */
  public generatePreviewCode(page: PageNodeData, components: Map<string, string>): string {
    // Generate component definitions from slot codes
    const componentDefs = page.slots
      .filter((slot) => slot.visible)
      .map((slot, index) => {
        const code = components.get(slot.componentId);
        if (!code) {
          return `const Component_${String(index)} = () => <div>Component not found</div>;`;
        }

        // Transform the component code to be embeddable
        // Replace 'export default function App' with a named component
        const transformedCode = code
          .replace(/export default function App/g, `function Component_${String(index)}`)
          .replace(/export default function \w+/g, `function Component_${String(index)}`);

        return transformedCode;
      })
      .join('\n\n');

    // Generate layout styles
    const layoutStyle = generateLayoutStyle(page.layout);

    // Generate slot elements
    const slotElements = page.slots
      .filter((slot) => slot.visible)
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((slot, index) => {
        const positionStyle = generatePositionStyle(slot.position);
        const propsString = generatePropsString(slot.props);

        return `        <div
					key="${slot.id}"
					data-layer-id="${slot.layerId}"
					data-source-loc="${slot.componentId}"
					style={{
						${positionStyle}${positionStyle !== '' ? ',' : ''}
						zIndex: ${String(slot.zIndex)},
					}}
				>
					<Component_${String(index)} ${propsString}/>
				</div>`;
      })
      .join('\n');

    // Generate background styles
    const backgroundStyles: string[] = [];
    if (page.background?.color !== undefined) {
      backgroundStyles.push(`backgroundColor: '${page.background.color}'`);
    }
    if (page.background?.gradient !== undefined) {
      backgroundStyles.push(`backgroundImage: '${page.background.gradient}'`);
    }
    if (page.background?.image !== undefined) {
      backgroundStyles.push(`backgroundImage: 'url(${page.background.image})'`);
      backgroundStyles.push(`backgroundSize: '${page.background.size ?? 'cover'}'`);
      backgroundStyles.push(`backgroundPosition: '${page.background.position ?? 'center'}'`);
    }

    return `import React from 'react';

${componentDefs}

export default function App() {
	return (
		<div
			style={{
				${layoutStyle},
				minHeight: '100vh',
				position: 'relative',
				${backgroundStyles.join(',\n        ')}
			}}
		>
${slotElements}
		</div>
	);
}`;
  }

  /**
   * Generate export-ready code for a page
   * This is cleaner code for production use
   */
  public generateExportCode(
    page: PageNodeData,
    components: Map<string, { name: string; code: string }>
  ): string {
    // Generate imports
    const imports = Array.from(components.values())
      .map((c) => c.name)
      .map((name) => `import { ${name} } from './${name}';`)
      .join('\n');

    // Generate layout styles
    const layoutStyle = generateLayoutStyle(page.layout);

    // Generate slot elements with actual component names
    const componentList = Array.from(components.entries());
    const slotElements = page.slots
      .filter((slot) => slot.visible)
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((slot) => {
        const component = componentList.find(([id]) => id === slot.componentId);
        const componentName = component?.[1].name ?? 'UnknownComponent';
        const positionStyle = generatePositionStyle(slot.position);
        const propsString = generatePropsString(slot.props);

        if (slot.position.mode === 'absolute' || positionStyle !== '') {
          return `      <div style={{ ${positionStyle}, zIndex: ${String(slot.zIndex)} }}>
				<${componentName} ${propsString}/>
			</div>`;
        }

        return `      <${componentName} ${propsString}/>`;
      })
      .join('\n');

    // Generate background styles
    const backgroundStyles: string[] = [];
    if (page.background?.color !== undefined) {
      backgroundStyles.push(`backgroundColor: '${page.background.color}'`);
    }

    const pageName =
      page.name.replace(/[^a-zA-Z0-9]/g, '') !== ''
        ? page.name.replace(/[^a-zA-Z0-9]/g, '')
        : 'Page';

    return `import React from 'react';
${imports}

export function ${pageName}() {
	return (
		<div
			style={{
				${layoutStyle},
				minHeight: '100vh',
				${backgroundStyles.join(',\n        ')}
			}}
		>
${slotElements}
		</div>
	);
}

export default ${pageName};`;
  }

  /**
   * Generate a simple page preview without component embedding
   * Used for quick visualization
   */
  public generateSimplePreview(page: PageNodeData): string {
    const layoutStyle = generateLayoutStyle(page.layout);

    const slots = page.slots
      .filter((s) => s.visible)
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((slot) => {
        const positionStyle = generatePositionStyle(slot.position);
        return `      <div
				data-slot-id="${slot.id}"
				style={{
					${positionStyle}${positionStyle !== '' ? ',' : ''}
					zIndex: ${String(slot.zIndex)},
					padding: '16px',
					backgroundColor: 'rgba(59, 130, 246, 0.1)',
					border: '1px dashed rgba(59, 130, 246, 0.3)',
					borderRadius: '4px',
				}}
			>
				<span style={{ fontSize: '12px', color: '#6b7280' }}>
					${slot.componentId}
				</span>
			</div>`;
      })
      .join('\n');

    return `export default function App() {
	return (
		<div
			style={{
				${layoutStyle},
				minHeight: '100vh',
				backgroundColor: '${page.background?.color ?? '#ffffff'}',
			}}
		>
${slots !== '' ? slots : '      <p style={{ color: "#9ca3af", textAlign: "center" }}>No components added</p>'}
		</div>
	);
}`;
  }
}

// Export singleton instance
export const pageComposer = new PageComposer();
