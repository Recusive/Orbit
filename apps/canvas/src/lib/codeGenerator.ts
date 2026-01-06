import { customCSSToString } from '../types/customCSS';

import type { Node, Edge } from '@xyflow/react';

// Node data type definitions
interface ButtonNodeData {
  label: string;
  variant: 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
  size: 'sm' | 'md' | 'lg';
  customCSS?: Record<string, string>;
}

interface InputNodeData {
  label: string;
  type: string;
  placeholder: string;
  required?: boolean;
  customCSS?: Record<string, string>;
}

interface CardNodeData {
  title: string;
  description: string;
  hasImage?: boolean;
  hasFooter?: boolean;
  customCSS?: Record<string, string>;
}

interface ContainerNodeData {
  layout: 'flex-row' | 'flex-col' | 'grid';
  gap: 'sm' | 'md' | 'lg';
  padding: 'none' | 'sm' | 'md' | 'lg';
  customCSS?: Record<string, string>;
}

interface FormNodeData {
  title: string;
  submitLabel: string;
  fields: { label: string; type: string }[];
  customCSS?: Record<string, string>;
}

interface TextNodeData {
  content: string;
  variant: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
  align: 'left' | 'center' | 'right';
  customCSS?: Record<string, string>;
}

interface ImageNodeData {
  src?: string;
  alt: string;
  width: 'full' | 'auto' | 'sm' | 'md' | 'lg';
  rounded: 'none' | 'sm' | 'md' | 'lg' | 'full';
  customCSS?: Record<string, string>;
}

interface LinkNodeData {
  text: string;
  href: string;
  target: '_blank' | '_self';
  underline?: boolean;
  customCSS?: Record<string, string>;
}

interface DividerNodeData {
  thickness: 'thin' | 'medium' | 'thick';
  style: 'solid' | 'dashed' | 'dotted';
  customCSS?: Record<string, string>;
}

interface BadgeNodeData {
  text: string;
  variant: 'default' | 'success' | 'warning' | 'error' | 'info';
  size: 'sm' | 'md' | 'lg';
  customCSS?: Record<string, string>;
}

interface CheckboxNodeData {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  customCSS?: Record<string, string>;
}

interface RadioNodeData {
  label: string;
  value?: string;
  checked?: boolean;
  name?: string;
  customCSS?: Record<string, string>;
}

interface SelectNodeData {
  label?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
  value?: string;
  customCSS?: Record<string, string>;
}

interface ToggleNodeData {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  customCSS?: Record<string, string>;
}

interface TextareaNodeData {
  label?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  customCSS?: Record<string, string>;
}

interface SandpackNodeData {
  label: string;
  code: string;
  viewport: 'mobile' | 'tablet' | 'desktop';
  showCode: boolean;
  customCSS?: Record<string, string>;
}

// Union type for all node data types
type AllNodeData =
  | ButtonNodeData
  | InputNodeData
  | CardNodeData
  | ContainerNodeData
  | FormNodeData
  | TextNodeData
  | ImageNodeData
  | LinkNodeData
  | DividerNodeData
  | BadgeNodeData
  | CheckboxNodeData
  | RadioNodeData
  | SelectNodeData
  | ToggleNodeData
  | TextareaNodeData
  | SandpackNodeData;

/**
 * CodeGenerator - Generates React/TypeScript code from React Flow graph
 *
 * Traverses the node graph and generates valid React components with:
 * - Proper component hierarchy (based on edges)
 * - Type-safe props
 * - Tailwind CSS styling
 * - Clean formatting
 */
export class CodeGenerator {
  /**
   * Generate TypeScript React component from nodes and edges
   */
  public generateTSX(nodes: Node[], edges: Edge[]): string {
    if (nodes.length === 0) {
      return this.getEmptyComponent();
    }

    const hierarchy = this.buildHierarchy(nodes, edges);
    const componentName = 'GeneratedComponent';
    const imports = this.generateImports();
    const component = this.generateComponent(componentName, hierarchy, nodes, edges);

    return `${imports}\n\n${component}`;
  }

  /**
   * Generate JavaScript React component (JSX)
   */
  public generateJSX(nodes: Node[], edges: Edge[]): string {
    const tsx = this.generateTSX(nodes, edges);

    // Remove TypeScript-specific syntax
    return tsx
      .replace(/: React\.FC/g, '')
      .replace(/interface \w+Props \{[^}]+\}\n\n/g, '')
      .replace(/export function (\w+)\(\): JSX\.Element/g, 'export function $1()');
  }

  /**
   * Generate CSS for the component
   */
  public generateCSS(): string {
    // For Tailwind-based components, we don't need custom CSS
    // This could be extended to generate utility classes or custom styles
    return `/* Tailwind CSS is used for styling */\n/* No custom CSS needed */`;
  }

  /**
   * Build node hierarchy from edges
   * Returns map of parent node ID to child node IDs
   */
  private buildHierarchy(nodes: Node[], edges: Edge[]): Map<string, string[]> {
    const hierarchy = new Map<string, string[]>();

    // Initialize all nodes
    for (const node of nodes) {
      hierarchy.set(node.id, []);
    }

    // Build parent-child relationships from edges
    for (const edge of edges) {
      const children = hierarchy.get(edge.source) ?? [];
      children.push(edge.target);
      hierarchy.set(edge.source, children);
    }

    return hierarchy;
  }

  /**
   * Find root nodes (nodes with no incoming edges)
   */
  private findRootNodes(nodes: Node[], edges: Edge[]): Node[] {
    const nodesWithParents = new Set(edges.map((e) => e.target));
    return nodes.filter((node) => !nodesWithParents.has(node.id));
  }

  /**
   * Generate import statements
   */
  private generateImports(): string {
    return `import React from 'react';`;
  }

  /**
   * Generate the main component function
   */
  private generateComponent(
    name: string,
    hierarchy: Map<string, string[]>,
    nodes: Node[],
    edges: Edge[]
  ): string {
    const rootNodes = this.findRootNodes(nodes, edges);

    if (rootNodes.length === 0) {
      return `export function ${name}() {
	return (
		<div>Empty canvas</div>
	);
}`;
    }

    const jsxElements = rootNodes
      .map((node) => this.generateNodeJSX(node, hierarchy, nodes, 1))
      .join('\n');

    // Wrap in fragment if multiple root nodes
    if (rootNodes.length > 1) {
      return `export function ${name}() {
	return (
		<>
${jsxElements}
		</>
	);
}`;
    }

    return `export function ${name}() {
	return (
${jsxElements}
	);
}`;
  }

  /**
   * Generate JSX for a single node and its children
   */
  private generateNodeJSX(
    node: Node,
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    depth: number
  ): string {
    const indent = '  '.repeat(depth + 1);
    const childrenIds = hierarchy.get(node.id) ?? [];
    const childNodes = childrenIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is Node => n !== undefined);

    const data = node.data as AllNodeData;

    switch (node.type) {
      case 'button':
        return this.generateButtonJSX(data as ButtonNodeData, node.id, indent);

      case 'input':
        return this.generateInputJSX(data as InputNodeData, node.id, indent);

      case 'card':
        return this.generateCardJSX(
          data as CardNodeData,
          node.id,
          childNodes,
          hierarchy,
          allNodes,
          indent,
          depth
        );

      case 'container':
        return this.generateContainerJSX(
          data as ContainerNodeData,
          node.id,
          childNodes,
          hierarchy,
          allNodes,
          indent,
          depth
        );

      case 'form':
        return this.generateFormJSX(
          data as FormNodeData,
          node.id,
          childNodes,
          hierarchy,
          allNodes,
          indent,
          depth
        );

      case 'text':
        return this.generateTextJSX(data as TextNodeData, node.id, indent);

      case 'image':
        return this.generateImageJSX(data as ImageNodeData, node.id, indent);

      case 'link':
        return this.generateLinkJSX(data as LinkNodeData, node.id, indent);

      case 'divider':
        return this.generateDividerJSX(data as DividerNodeData, node.id, indent);

      case 'badge':
        return this.generateBadgeJSX(data as BadgeNodeData, node.id, indent);

      case 'checkbox':
        return this.generateCheckboxJSX(data as CheckboxNodeData, node.id, indent);

      case 'radio':
        return this.generateRadioJSX(data as RadioNodeData, node.id, indent);

      case 'select':
        return this.generateSelectJSX(data as SelectNodeData, node.id, indent);

      case 'toggle':
        return this.generateToggleJSX(data as ToggleNodeData, node.id, indent);

      case 'textarea':
        return this.generateTextareaJSX(data as TextareaNodeData, node.id, indent);

      case 'sandpack':
        return this.generateSandpackJSX(data as SandpackNodeData, node.id, indent);

      case undefined:
        return `${indent}<div data-source-loc="${node.id}">Node has no type defined</div>`;

      default:
        return `${indent}<div data-source-loc="${node.id}">Unknown node type: ${node.type}</div>`;
    }
  }

  /**
   * Generate JSX for Button node
   */
  private generateButtonJSX(data: ButtonNodeData, nodeId: string, indent: string): string {
    const variantClasses: Record<ButtonNodeData['variant'], string> = {
      default: 'border border-border bg-background text-foreground hover:bg-accent',
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'bg-transparent text-foreground hover:bg-accent',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    };

    const sizeClasses: Record<ButtonNodeData['size'], string> = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    const classes = `rounded-md font-medium transition-colors ${variantClasses[data.variant]} ${sizeClasses[data.size]}`;
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    return `${indent}<button data-source-loc="${nodeId}" className="${classes}"${styleAttr}>
${indent}  ${data.label}
${indent}</button>`;
  }

  /**
   * Generate JSX for Input node
   */
  private generateInputJSX(data: InputNodeData, nodeId: string, indent: string): string {
    const inputClasses =
      'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}    style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const labelElement =
      data.label !== ''
        ? `${indent}<label className="text-sm font-medium text-foreground">
${indent}  ${data.label}${data.required ? '<span className="text-destructive">*</span>' : ''}
${indent}</label>\n`
        : '';

    return `${indent}<div data-source-loc="${nodeId}" className="space-y-2">
${labelElement}${indent}  <input
${indent}    type="${data.type}"
${indent}    placeholder="${data.placeholder}"
${indent}    ${data.required ? 'required' : ''}
${indent}    className="${inputClasses}"${styleAttr}
${indent}  />
${indent}</div>`;
  }

  /**
   * Generate JSX for Card node
   */
  private generateCardJSX(
    data: CardNodeData,
    nodeId: string,
    children: Node[],
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    indent: string,
    depth: number
  ): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style={{ ${this.cssStringToJSXStyle(customStyle)} }}` : '';

    const imageElement = data.hasImage
      ? `${indent}  <div className="h-24 rounded-md bg-muted flex items-center justify-center">
${indent}    <span className="text-xs text-muted-foreground">Image</span>
${indent}  </div>\n`
      : '';

    const footerElement = data.hasFooter
      ? `${indent}  <div className="border-t border-border pt-2">
${indent}    <div className="flex gap-2">
${indent}      <button className="h-6 flex-1 rounded bg-muted">Action 1</button>
${indent}      <button className="h-6 flex-1 rounded bg-muted">Action 2</button>
${indent}    </div>
${indent}  </div>\n`
      : '';

    const childrenJSX =
      children.length > 0
        ? children
            .map((child) => this.generateNodeJSX(child, hierarchy, allNodes, depth + 1))
            .join('\n') + '\n'
        : '';

    return `${indent}<div data-source-loc="${nodeId}" className="rounded-md border border-border bg-background p-3 space-y-3"${styleAttr}>
${imageElement}${indent}  <div className="space-y-1.5">
${indent}    <h3 className="text-sm font-semibold text-foreground">${data.title}</h3>
${indent}    <p className="text-xs text-muted-foreground">${data.description}</p>
${indent}  </div>
${childrenJSX}${footerElement}${indent}</div>`;
  }

  /**
   * Generate JSX for Container node
   */
  private generateContainerJSX(
    data: ContainerNodeData,
    nodeId: string,
    children: Node[],
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    indent: string,
    depth: number
  ): string {
    const layoutClasses: Record<ContainerNodeData['layout'], string> = {
      'flex-row': 'flex flex-row',
      'flex-col': 'flex flex-col',
      grid: 'grid grid-cols-2',
    };

    const gapClasses: Record<ContainerNodeData['gap'], string> = {
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
    };

    const paddingClasses: Record<ContainerNodeData['padding'], string> = {
      none: 'p-0',
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
    };

    const classes = `${layoutClasses[data.layout]} ${gapClasses[data.gap]} ${paddingClasses[data.padding]}`;
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style={{ ${this.cssStringToJSXStyle(customStyle)} }}` : '';

    const childrenJSX =
      children.length > 0
        ? '\n' +
          children
            .map((child) => this.generateNodeJSX(child, hierarchy, allNodes, depth + 1))
            .join('\n') +
          '\n' +
          indent
        : '\n' + indent + '  {/* Add children here */}\n' + indent;

    return `${indent}<div data-source-loc="${nodeId}" className="${classes}"${styleAttr}>${childrenJSX}</div>`;
  }

  /**
   * Generate JSX for Form node
   */
  private generateFormJSX(
    data: FormNodeData,
    nodeId: string,
    children: Node[],
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    indent: string,
    depth: number
  ): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style={{ ${this.cssStringToJSXStyle(customStyle)} }}` : '';

    const titleElement =
      data.title !== ''
        ? `${indent}  <h3 className="text-base font-semibold text-foreground">${data.title}</h3>\n`
        : '';

    const fieldsJSX = data.fields
      .map(
        (field) =>
          `${indent}  <div className="space-y-1">
${indent}    <label className="text-xs font-medium text-foreground">${field.label}</label>
${indent}    <input
${indent}      type="${field.type}"
${indent}      className="w-full h-8 rounded-md border border-input bg-background px-3 py-2 text-sm"
${indent}    />
${indent}  </div>`
      )
      .join('\n');

    const childrenJSX =
      children.length > 0
        ? '\n' +
          children
            .map((child) => this.generateNodeJSX(child, hierarchy, allNodes, depth + 1))
            .join('\n')
        : '';

    return `${indent}<form data-source-loc="${nodeId}" className="space-y-3 rounded-md border border-border bg-background p-4"${styleAttr}>
${titleElement}${indent}  <div className="space-y-3">
${fieldsJSX}
${indent}  </div>${childrenJSX}
${indent}  <button
${indent}    type="submit"
${indent}    className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
${indent}  >
${indent}    ${data.submitLabel}
${indent}  </button>
${indent}</form>`;
  }

  /**
   * Generate JSX for Text node
   */
  private generateTextJSX(data: TextNodeData, nodeId: string, indent: string): string {
    const variantClasses: Record<TextNodeData['variant'], string> = {
      h1: 'text-4xl font-bold text-foreground',
      h2: 'text-3xl font-bold text-foreground',
      h3: 'text-2xl font-semibold text-foreground',
      h4: 'text-xl font-semibold text-foreground',
      h5: 'text-lg font-medium text-foreground',
      h6: 'text-base font-medium text-foreground',
      p: 'text-sm text-foreground',
    };

    const alignClasses: Record<TextNodeData['align'], string> = {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    };

    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const Tag = data.variant;
    const classes = `${variantClasses[data.variant]} ${alignClasses[data.align]}`;

    return `${indent}<${Tag} data-source-loc="${nodeId}" className="${classes}"${styleAttr}>
${indent}  ${data.content}
${indent}</${Tag}>`;
  }

  /**
   * Generate JSX for Image node
   */
  private generateImageJSX(data: ImageNodeData, nodeId: string, indent: string): string {
    const widthClasses: Record<ImageNodeData['width'], string> = {
      full: 'w-full',
      auto: 'w-auto',
      sm: 'w-32',
      md: 'w-48',
      lg: 'w-64',
    };

    const roundedClasses: Record<ImageNodeData['rounded'], string> = {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-lg',
      full: 'rounded-full',
    };

    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const classes = `${widthClasses[data.width]} ${roundedClasses[data.rounded]} object-cover`;

    if (data.src !== undefined && data.src !== '') {
      return `${indent}<img
${indent}  data-source-loc="${nodeId}"
${indent}  src="${data.src}"
${indent}  alt="${data.alt}"
${indent}  className="${classes}"${styleAttr}
${indent}/>`;
    } else {
      return `${indent}<div data-source-loc="${nodeId}" className="${widthClasses[data.width]} h-48 ${roundedClasses[data.rounded]} bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center"${styleAttr}>
${indent}  <span className="text-muted-foreground text-sm">Image placeholder</span>
${indent}</div>`;
    }
  }

  /**
   * Generate JSX for Link node
   */
  private generateLinkJSX(data: LinkNodeData, nodeId: string, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const underlineClass = data.underline ? 'underline' : 'no-underline';
    const classes = `text-blue-600 hover:text-blue-800 ${underlineClass}`;

    const targetAttr = data.target === '_blank' ? '\n' + indent + '  target="_blank"' : '';
    const relAttr = data.target === '_blank' ? '\n' + indent + '  rel="noopener noreferrer"' : '';

    return `${indent}<a
${indent}  data-source-loc="${nodeId}"
${indent}  href="${data.href}"
${indent}  className="${classes}"${targetAttr}${relAttr}${styleAttr}
${indent}>
${indent}  ${data.text}
${indent}</a>`;
  }

  /**
   * Generate JSX for Divider node
   */
  private generateDividerJSX(data: DividerNodeData, nodeId: string, indent: string): string {
    const thicknessClasses: Record<DividerNodeData['thickness'], string> = {
      thin: 'border-t',
      medium: 'border-t-2',
      thick: 'border-t-4',
    };

    const styleClasses: Record<DividerNodeData['style'], string> = {
      solid: 'border-solid',
      dashed: 'border-dashed',
      dotted: 'border-dotted',
    };

    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style={{ ${this.cssStringToJSXStyle(customStyle)} }}` : '';

    const classes = `w-full border-border ${thicknessClasses[data.thickness]} ${styleClasses[data.style]}`;

    return `${indent}<hr data-source-loc="${nodeId}" className="${classes}"${styleAttr} />`;
  }

  /**
   * Generate JSX for Badge node
   */
  private generateBadgeJSX(data: BadgeNodeData, nodeId: string, indent: string): string {
    const variantClasses: Record<BadgeNodeData['variant'], string> = {
      default: 'bg-gray-100 text-gray-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      error: 'bg-red-100 text-red-800',
      info: 'bg-blue-100 text-blue-800',
    };

    const sizeClasses: Record<BadgeNodeData['size'], string> = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-sm',
      lg: 'px-3 py-1.5 text-base',
    };

    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const classes = `inline-flex items-center rounded-full font-medium ${variantClasses[data.variant]} ${sizeClasses[data.size]}`;

    return `${indent}<span data-source-loc="${nodeId}" className="${classes}"${styleAttr}>
${indent}  ${data.text}
${indent}</span>`;
  }

  /**
   * Generate JSX for Checkbox node
   */
  private generateCheckboxJSX(data: CheckboxNodeData, nodeId: string, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const checkedAttr = data.checked ? '\n' + indent + '    defaultChecked' : '';
    const disabledAttr = data.disabled ? '\n' + indent + '    disabled' : '';

    return `${indent}<div data-source-loc="${nodeId}" className="flex items-center gap-2"${styleAttr}>
${indent}  <input
${indent}    type="checkbox"
${indent}    id="checkbox-${nodeId}"
${indent}    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"${checkedAttr}${disabledAttr}
${indent}  />
${indent}  <label htmlFor="checkbox-${nodeId}" className="text-sm text-gray-700">
${indent}    ${data.label}${data.required ? '<span className="text-red-500">*</span>' : ''}
${indent}  </label>
${indent}</div>`;
  }

  /**
   * Generate JSX for Radio node
   */
  private generateRadioJSX(data: RadioNodeData, nodeId: string, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style={{ ${this.cssStringToJSXStyle(customStyle)} }}` : '';

    const radioId = `radio-${data.name ?? 'option'}`;
    const checkedAttr = data.checked ? '\n' + indent + '    defaultChecked' : '';

    return `${indent}<div data-source-loc="${nodeId}" className="flex items-center gap-2"${styleAttr}>
${indent}  <input
${indent}    type="radio"
${indent}    name="${data.name ?? 'radio-group'}"
${indent}    id="${radioId}"
${indent}    value="${data.value ?? ''}"
${indent}    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"${checkedAttr}
${indent}  />
${indent}  <label htmlFor="${radioId}" className="text-sm text-gray-700">
${indent}    ${data.label}
${indent}  </label>
${indent}</div>`;
  }

  /**
   * Generate JSX for Select node
   */
  private generateSelectJSX(data: SelectNodeData, nodeId: string, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}    style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const options = data.options ?? [];
    const optionsJSX = options
      .slice(0, 3)
      .map((option) => `${indent}    <option value="${option.value}">${option.label}</option>`)
      .join('\n');

    const moreOptions =
      options.length > 3
        ? `\n${indent}    {/* +${String(options.length - 3)} more options */}`
        : '';

    return `${indent}<div data-source-loc="${nodeId}" className="flex flex-col gap-1.5">
${indent}  <label className="text-sm font-medium text-gray-700">
${indent}    ${data.label ?? 'Select'}
${indent}  </label>
${indent}  <select
${indent}    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"${styleAttr}
${indent}  >
${indent}    <option value="">${data.placeholder ?? 'Select an option'}</option>
${optionsJSX}${moreOptions}
${indent}  </select>
${indent}</div>`;
  }

  /**
   * Generate JSX for Toggle node
   */
  private generateToggleJSX(data: ToggleNodeData, nodeId: string, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}  style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const disabledAttr = data.disabled ? '\n' + indent + '    disabled' : '';
    const bgColor = data.checked ? 'bg-blue-600' : 'bg-gray-200';
    const translateX = data.checked ? 'translate-x-5' : 'translate-x-0';

    return `${indent}<div data-source-loc="${nodeId}" className="flex items-center justify-between gap-3"${styleAttr}>
${indent}  <label className="text-sm text-gray-700">${data.label}</label>
${indent}  <button
${indent}    type="button"
${indent}    role="switch"
${indent}    aria-checked="${data.checked ? 'true' : 'false'}"
${indent}    className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${bgColor}"${disabledAttr}
${indent}  >
${indent}    <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${translateX}" />
${indent}  </button>
${indent}</div>`;
  }

  /**
   * Generate JSX for Textarea node
   */
  private generateTextareaJSX(data: TextareaNodeData, nodeId: string, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle
      ? `\n${indent}    style={{ ${this.cssStringToJSXStyle(customStyle)} }}`
      : '';

    const requiredAttr = data.required ? '\n' + indent + '    required' : '';
    const rows = data.rows ?? 4;

    return `${indent}<div data-source-loc="${nodeId}" className="flex flex-col gap-1.5">
${indent}  <label className="text-sm font-medium text-gray-700">
${indent}    ${data.label ?? 'Textarea'}${data.required ? '<span className="text-red-500">*</span>' : ''}
${indent}  </label>
${indent}  <textarea
${indent}    rows={${String(rows)}}
${indent}    placeholder="${data.placeholder ?? ''}"
${indent}    className="resize-none px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"${requiredAttr}${styleAttr}
${indent}  />
${indent}</div>`;
  }

  /**
   * Generate JSX for Sandpack node (code-first canvas)
   * Extracts the component body from the node's code and embeds it
   */
  private generateSandpackJSX(data: SandpackNodeData, nodeId: string, indent: string): string {
    // SandpackNodes contain complete React components
    // Extract the return statement body for embedding
    const code = data.code || '';

    // Try to extract the JSX from the return statement
    const returnMatch = /return\s*\(\s*([\s\S]*?)\s*\);?\s*\}[\s\S]*$/.exec(code);
    if (returnMatch?.[1] !== undefined) {
      // Re-indent the extracted JSX
      const jsxBody = returnMatch[1].trim();
      const lines = jsxBody.split('\n');
      const reindented = lines
        .map((line, i) => {
          if (i === 0) return indent + line.trim();
          // Preserve relative indentation
          const trimmed = line.replace(/^\s+/, '');
          return indent + '  ' + trimmed;
        })
        .join('\n');

      // Wrap in a div with data-source-loc for click-to-select
      return `${indent}<div data-source-loc="${nodeId}">
${reindented}
${indent}</div>`;
    }

    // Fallback: show component label as placeholder
    return `${indent}<div data-source-loc="${nodeId}" className="p-4 border border-dashed border-gray-300 rounded-lg">
${indent}  <span className="text-sm text-gray-500">${data.label}</span>
${indent}</div>`;
  }

  /**
   * Convert CSS string to JSX style object syntax
   */
  private cssStringToJSXStyle(cssString: string): string {
    if (cssString === '') {
      return '';
    }

    const properties = cssString.split(';').filter((prop) => prop.trim() !== '');
    const jsxProps = properties.map((prop) => {
      const [key, value] = prop.split(':').map((s) => s.trim());
      if (key === undefined || key === '' || value === undefined || value === '') {
        return '';
      }

      // Convert kebab-case to camelCase
      const camelKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      return `${camelKey}: '${value}'`;
    });

    return jsxProps.filter((p) => p !== '').join(', ');
  }

  /**
   * Get empty component template
   */
  private getEmptyComponent(): string {
    return `import React from 'react';

export function GeneratedComponent(): React.JSX.Element {
	return (
		<div className="flex items-center justify-center min-h-[200px] rounded-md border border-dashed border-border bg-muted/10">
			<p className="text-sm text-muted-foreground">
				Drag components onto the canvas to generate code
			</p>
		</div>
	);
}`;
  }
}

// Export singleton instance
export const codeGenerator = new CodeGenerator();
