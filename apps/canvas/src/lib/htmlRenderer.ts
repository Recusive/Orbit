import { customCSSToString } from '../types/customCSS';

import type { Node, Edge } from '@xyflow/react';

// Node data type definitions (matching nodeTypes.ts)
interface ButtonNodeData {
  label: string;
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  customCSS?: Record<string, string>;
}

interface InputNodeData {
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number';
  placeholder?: string;
  required?: boolean;
  customCSS?: Record<string, string>;
}

interface CardNodeData {
  title?: string;
  description?: string;
  hasImage?: boolean;
  hasFooter?: boolean;
  customCSS?: Record<string, string>;
}

interface ContainerNodeData {
  layout?: 'flex-row' | 'flex-col' | 'grid';
  gap?: 'sm' | 'md' | 'lg';
  padding?: 'sm' | 'md' | 'lg';
  customCSS?: Record<string, string>;
}

interface FormNodeData {
  title?: string;
  fields?: { name: string; type: string; label: string }[];
  submitLabel?: string;
  customCSS?: Record<string, string>;
}

interface TextNodeData {
  content: string;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'small';
  align?: 'left' | 'center' | 'right';
  customCSS?: Record<string, string>;
}

interface ImageNodeData {
  src?: string;
  alt?: string;
  width?: 'sm' | 'md' | 'lg' | 'full';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  customCSS?: Record<string, string>;
}

interface LinkNodeData {
  text: string;
  href?: string;
  target?: '_self' | '_blank' | '_parent' | '_top';
  underline?: boolean;
  customCSS?: Record<string, string>;
}

interface DividerNodeData {
  orientation?: 'horizontal' | 'vertical';
  thickness?: 'thin' | 'medium' | 'thick';
  style?: 'solid' | 'dashed' | 'dotted';
  customCSS?: Record<string, string>;
}

interface BadgeNodeData {
  text: string;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  customCSS?: Record<string, string>;
}

interface CheckboxNodeData {
  label: string;
  checked?: boolean;
  disabled?: boolean;
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
  | TextareaNodeData;

/**
 * HTMLRenderer - Renders React Flow nodes as live HTML preview
 *
 * Generates a complete HTML document with:
 * - Embedded CSS styles
 * - Rendered components with proper styling
 * - Hierarchical structure based on edges
 */
export class HTMLRenderer {
  /**
   * Render nodes and edges to complete HTML document
   */
  public renderToHTML(nodes: Node[], edges: Edge[]): string {
    if (nodes.length === 0) {
      return this.getEmptyPreview();
    }

    const hierarchy = this.buildHierarchy(nodes, edges);
    const bodyContent = this.generateBodyContent(hierarchy, nodes);

    return this.wrapInHTMLDocument(bodyContent);
  }

  /**
   * Build node hierarchy from edges
   */
  private buildHierarchy(nodes: Node[], edges: Edge[]): Map<string, string[]> {
    const hierarchy = new Map<string, string[]>();

    for (const node of nodes) {
      hierarchy.set(node.id, []);
    }

    for (const edge of edges) {
      const children = hierarchy.get(edge.source) ?? [];
      children.push(edge.target);
      hierarchy.set(edge.source, children);
    }

    return hierarchy;
  }

  /**
   * Generate body content from node hierarchy
   */
  private generateBodyContent(hierarchy: Map<string, string[]>, allNodes: Node[]): string {
    const childNodeIds = new Set<string>();
    for (const children of hierarchy.values()) {
      for (const childId of children) {
        childNodeIds.add(childId);
      }
    }

    const rootNodes = allNodes.filter((node) => !childNodeIds.has(node.id));

    if (rootNodes.length === 0 && allNodes.length > 0) {
      return allNodes.map((node) => this.renderNode(node, hierarchy, allNodes, 0)).join('\n');
    }

    return rootNodes.map((node) => this.renderNode(node, hierarchy, allNodes, 0)).join('\n');
  }

  /**
   * Render a single node and its children
   */
  private renderNode(
    node: Node,
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    depth: number
  ): string {
    const indent = '  '.repeat(depth);
    const data = node.data as AllNodeData;

    switch (node.type) {
      case 'button':
        return this.renderButton(data as ButtonNodeData, indent);
      case 'input':
        return this.renderInput(data as InputNodeData, indent);
      case 'card':
        return this.renderCard(data as CardNodeData, hierarchy, allNodes, node.id, indent, depth);
      case 'container':
        return this.renderContainer(
          data as ContainerNodeData,
          hierarchy,
          allNodes,
          node.id,
          indent,
          depth
        );
      case 'form':
        return this.renderForm(data as FormNodeData, hierarchy, allNodes, node.id, indent, depth);
      case 'text':
        return this.renderText(data as TextNodeData, indent);
      case 'image':
        return this.renderImage(data as ImageNodeData, indent);
      case 'link':
        return this.renderLink(data as LinkNodeData, indent);
      case 'divider':
        return this.renderDivider(data as DividerNodeData, indent);
      case 'badge':
        return this.renderBadge(data as BadgeNodeData, indent);
      case 'checkbox':
        return this.renderCheckbox(data as CheckboxNodeData, indent);
      case 'radio':
        return this.renderRadio(data as RadioNodeData, indent);
      case 'select':
        return this.renderSelect(data as SelectNodeData, indent);
      case 'toggle':
        return this.renderToggle(data as ToggleNodeData, indent);
      case 'textarea':
        return this.renderTextarea(data as TextareaNodeData, indent);
      case undefined:
        return '';
      default:
        return '';
    }
  }

  /**
   * Render Button node
   */
  private renderButton(data: ButtonNodeData, indent: string): string {
    const variantStyles: Record<string, string> = {
      default: 'background: white; color: #1f2937; border: 1px solid #d1d5db;',
      primary: 'background: #3b82f6; color: white; border: none;',
      secondary: 'background: #6b7280; color: white; border: none;',
      ghost: 'background: transparent; color: #374151; border: 1px solid transparent;',
      destructive: 'background: #ef4444; color: white; border: none;',
    };

    const sizeStyles: Record<string, string> = {
      sm: 'padding: 6px 12px; font-size: 12px;',
      md: 'padding: 8px 16px; font-size: 14px;',
      lg: 'padding: 12px 24px; font-size: 16px;',
    };

    const variant = data.variant ?? 'default';
    const size = data.size ?? 'md';
    const baseStyle =
      'border-radius: 6px; font-weight: 500; cursor: pointer; transition: all 0.2s ease;';
    const customStyle = customCSSToString(data.customCSS);
    const fullStyle = `${baseStyle} ${variantStyles[variant] ?? ''} ${sizeStyles[size] ?? ''} ${customStyle}`;

    return `${indent}<button style="${fullStyle}">${data.label}</button>`;
  }

  /**
   * Render Input node
   */
  private renderInput(data: InputNodeData, indent: string): string {
    const required = data.required ? ' *' : '';
    const customStyle = customCSSToString(data.customCSS);
    const html: string[] = [];

    html.push(`${indent}<div style="display: flex; flex-direction: column; gap: 6px;">`);
    html.push(
      `${indent}  <label style="font-size: 14px; font-weight: 500; color: #374151;">${data.label ?? 'Input'}${required}</label>`
    );
    html.push(
      `${indent}  <input type="${data.type ?? 'text'}" placeholder="${data.placeholder ?? ''}" ${data.required ? 'required' : ''} style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; ${customStyle}" />`
    );
    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Card node
   */
  private renderCard(
    data: CardNodeData,
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    nodeId: string,
    indent: string,
    depth: number
  ): string {
    const customStyle = customCSSToString(data.customCSS);
    const cardStyle = `background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; ${customStyle}`;
    const html: string[] = [];

    const childIds = hierarchy.get(nodeId) ?? [];
    const childNodes = childIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is Node => n !== undefined);

    html.push(`${indent}<div class="card" style="${cardStyle}">`);

    if (data.hasImage === true) {
      html.push(
        `${indent}  <div style="height: 192px; background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px;">Image</div>`
      );
    }

    html.push(`${indent}  <div style="padding: 24px;">`);
    html.push(
      `${indent}    <h3 style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 8px;">${data.title ?? 'Card Title'}</h3>`
    );
    html.push(
      `${indent}    <p style="font-size: 14px; color: #6b7280; margin-bottom: 16px;">${data.description ?? 'Card description'}</p>`
    );

    if (childNodes.length > 0) {
      html.push(`${indent}    <div style="display: flex; flex-direction: column; gap: 16px;">`);
      for (const child of childNodes) {
        html.push(this.renderNode(child, hierarchy, allNodes, depth + 2));
      }
      html.push(`${indent}    </div>`);
    }

    html.push(`${indent}  </div>`);

    if (data.hasFooter === true) {
      html.push(
        `${indent}  <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; gap: 8px;">`
      );
      html.push(
        `${indent}    <button style="padding: 6px 12px; font-size: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Action</button>`
      );
      html.push(
        `${indent}    <button style="padding: 6px 12px; font-size: 12px; background: transparent; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;">Cancel</button>`
      );
      html.push(`${indent}  </div>`);
    }

    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Container node with children
   */
  private renderContainer(
    data: ContainerNodeData,
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    nodeId: string,
    indent: string,
    depth: number
  ): string {
    const layoutStyles: Record<string, string> = {
      'flex-row': 'display: flex; flex-direction: row;',
      'flex-col': 'display: flex; flex-direction: column;',
      grid: 'display: grid; grid-template-columns: repeat(2, 1fr);',
    };

    const gapStyles: Record<string, string> = {
      sm: 'gap: 8px;',
      md: 'gap: 16px;',
      lg: 'gap: 24px;',
    };

    const paddingStyles: Record<string, string> = {
      sm: 'padding: 8px;',
      md: 'padding: 16px;',
      lg: 'padding: 24px;',
    };

    const layout = data.layout ?? 'flex-col';
    const gap = data.gap ?? 'md';
    const padding = data.padding ?? 'md';
    const customStyle = customCSSToString(data.customCSS);
    const style = `${layoutStyles[layout] ?? ''} ${gapStyles[gap] ?? ''} ${paddingStyles[padding] ?? ''} border: 1px solid #e5e7eb; border-radius: 8px; ${customStyle}`;

    const html: string[] = [];
    html.push(`${indent}<div style="${style}">`);

    const childIds = hierarchy.get(nodeId) ?? [];
    const childNodes = childIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is Node => n !== undefined);

    if (childNodes.length > 0) {
      for (const child of childNodes) {
        html.push(this.renderNode(child, hierarchy, allNodes, depth + 1));
      }
    } else {
      for (let i = 0; i < 2; i++) {
        html.push(
          `${indent}  <div style="height: 80px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 14px;">Item ${String(i + 1)}</div>`
        );
      }
    }

    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Form node
   */
  private renderForm(
    data: FormNodeData,
    hierarchy: Map<string, string[]>,
    allNodes: Node[],
    nodeId: string,
    indent: string,
    depth: number
  ): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` ${customStyle}` : '';
    const html: string[] = [];

    const childIds = hierarchy.get(nodeId) ?? [];
    const childNodes = childIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is Node => n !== undefined);

    html.push(
      `${indent}<form style="display: flex; flex-direction: column; gap: 16px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);${styleAttr}">`
    );
    html.push(
      `${indent}  <h2 style="font-size: 20px; font-weight: 600; color: #111827;">${data.title ?? 'Form'}</h2>`
    );

    if (childNodes.length > 0) {
      for (const child of childNodes) {
        html.push(this.renderNode(child, hierarchy, allNodes, depth + 1));
      }
    } else {
      const fields = data.fields ?? [];
      for (const field of fields.slice(0, 3)) {
        html.push(`${indent}  <div style="display: flex; flex-direction: column; gap: 6px;">`);
        html.push(
          `${indent}    <label style="font-size: 14px; font-weight: 500; color: #374151;">${field.label}</label>`
        );
        if (field.type === 'textarea') {
          html.push(
            `${indent}    <textarea rows="4" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; resize: none;"></textarea>`
          );
        } else {
          html.push(
            `${indent}    <input type="${field.type}" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;" />`
          );
        }
        html.push(`${indent}  </div>`);
      }
    }

    html.push(
      `${indent}  <button type="submit" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">${data.submitLabel ?? 'Submit'}</button>`
    );
    html.push(`${indent}</form>`);

    return html.join('\n');
  }

  /**
   * Render Text node
   */
  private renderText(data: TextNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style="${customStyle}"` : '';

    const variantTags: Record<string, string> = {
      h1: 'h1',
      h2: 'h2',
      h3: 'h3',
      h4: 'h4',
      h5: 'h5',
      h6: 'h6',
      p: 'p',
      small: 'small',
    };

    const variantStyles: Record<string, string> = {
      h1: 'font-size: 36px; font-weight: 700; color: #111827;',
      h2: 'font-size: 30px; font-weight: 700; color: #111827;',
      h3: 'font-size: 24px; font-weight: 600; color: #111827;',
      h4: 'font-size: 20px; font-weight: 600; color: #111827;',
      h5: 'font-size: 18px; font-weight: 500; color: #111827;',
      h6: 'font-size: 16px; font-weight: 500; color: #111827;',
      p: 'font-size: 14px; color: #4b5563;',
      small: 'font-size: 12px; color: #6b7280;',
    };

    const alignStyles: Record<string, string> = {
      left: 'text-align: left;',
      center: 'text-align: center;',
      right: 'text-align: right;',
    };

    const variant = data.variant ?? 'p';
    const align = data.align ?? 'left';
    const tag = variantTags[variant] ?? 'p';
    const style = `${variantStyles[variant] ?? ''} ${alignStyles[align] ?? ''}`;

    return `${indent}<${tag} style="${style}"${styleAttr}>${data.content}</${tag}>`;
  }

  /**
   * Render Image node
   */
  private renderImage(data: ImageNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);

    const widthStyles: Record<string, string> = {
      full: 'width: 100%;',
      sm: 'width: 128px;',
      md: 'width: 192px;',
      lg: 'width: 256px;',
    };

    const roundedStyles: Record<string, string> = {
      none: 'border-radius: 0;',
      sm: 'border-radius: 4px;',
      md: 'border-radius: 8px;',
      lg: 'border-radius: 12px;',
      full: 'border-radius: 9999px;',
    };

    const width = data.width ?? 'md';
    const rounded = data.rounded ?? 'md';
    const style = `${widthStyles[width] ?? ''} ${roundedStyles[rounded] ?? ''} object-fit: cover; ${customStyle}`;

    if (data.src !== undefined && data.src !== '') {
      return `${indent}<img src="${data.src}" alt="${data.alt ?? 'Image'}" style="${style}" />`;
    } else {
      return `${indent}<div style="${widthStyles[width] ?? ''} height: 192px; ${roundedStyles[rounded] ?? ''} background: linear-gradient(135deg, #c084fc 0%, #f472b6 100%); display: flex; align-items: center; justify-content: center; ${customStyle}">
${indent}  <svg style="width: 64px; height: 64px; color: rgba(255,255,255,0.5);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
${indent}    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
${indent}  </svg>
${indent}</div>`;
    }
  }

  /**
   * Render Link node
   */
  private renderLink(data: LinkNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const styleAttr = customStyle ? ` style="${customStyle}"` : '';
    const underlineStyle = data.underline
      ? 'text-decoration: underline;'
      : 'text-decoration: none;';
    const target = data.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : '';

    return `${indent}<a href="${data.href ?? '#'}" style="color: #3b82f6; ${underlineStyle}"${target}${styleAttr}>${data.text}</a>`;
  }

  /**
   * Render Divider node
   */
  private renderDivider(data: DividerNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);

    const thicknessStyles: Record<string, string> = {
      thin: 'border-width: 1px;',
      medium: 'border-width: 2px;',
      thick: 'border-width: 4px;',
    };

    const styleTypes: Record<string, string> = {
      solid: 'border-style: solid;',
      dashed: 'border-style: dashed;',
      dotted: 'border-style: dotted;',
    };

    const thickness = data.thickness ?? 'thin';
    const styleType = data.style ?? 'solid';
    const style = `width: 100%; border-color: #d1d5db; ${thicknessStyles[thickness] ?? ''} ${styleTypes[styleType] ?? ''} ${customStyle}`;

    return `${indent}<hr style="${style}" />`;
  }

  /**
   * Render Badge node
   */
  private renderBadge(data: BadgeNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);

    const variantStyles: Record<string, string> = {
      default: 'background: #f3f4f6; color: #374151;',
      primary: 'background: #dbeafe; color: #1d4ed8;',
      secondary: 'background: #f3f4f6; color: #4b5563;',
      success: 'background: #dcfce7; color: #15803d;',
      warning: 'background: #fef3c7; color: #b45309;',
      error: 'background: #fee2e2; color: #b91c1c;',
    };

    const sizeStyles: Record<string, string> = {
      sm: 'padding: 2px 8px; font-size: 11px;',
      md: 'padding: 4px 10px; font-size: 12px;',
      lg: 'padding: 6px 12px; font-size: 14px;',
    };

    const variant = data.variant ?? 'default';
    const size = data.size ?? 'md';
    const style = `display: inline-flex; align-items: center; border-radius: 9999px; font-weight: 500; ${variantStyles[variant] ?? ''} ${sizeStyles[size] ?? ''} ${customStyle}`;

    return `${indent}<span style="${style}">${data.text}</span>`;
  }

  /**
   * Render Checkbox node
   */
  private renderCheckbox(data: CheckboxNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const checkedAttr = data.checked ? ' checked' : '';
    const disabledAttr = data.disabled ? ' disabled' : '';
    const checkboxId = `checkbox-${String(Date.now())}`;

    const html: string[] = [];
    html.push(
      `${indent}<div style="display: flex; align-items: center; gap: 8px; ${customStyle}">`
    );
    html.push(
      `${indent}  <input type="checkbox" id="${checkboxId}" style="width: 16px; height: 16px; accent-color: #3b82f6;"${checkedAttr}${disabledAttr} />`
    );
    html.push(
      `${indent}  <label for="${checkboxId}" style="font-size: 14px; color: #374151;">${data.label}</label>`
    );
    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Radio node
   */
  private renderRadio(data: RadioNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const checkedAttr = data.checked ? ' checked' : '';
    const radioId = `radio-${data.name ?? 'option'}`;

    const html: string[] = [];
    html.push(
      `${indent}<div style="display: flex; align-items: center; gap: 8px; ${customStyle}">`
    );
    html.push(
      `${indent}  <input type="radio" name="${data.name ?? 'radio-group'}" id="${radioId}" value="${data.value ?? ''}" style="width: 16px; height: 16px; accent-color: #3b82f6;"${checkedAttr} />`
    );
    html.push(
      `${indent}  <label for="${radioId}" style="font-size: 14px; color: #374151;">${data.label}</label>`
    );
    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Select node
   */
  private renderSelect(data: SelectNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const options = data.options ?? [];

    const html: string[] = [];
    html.push(`${indent}<div style="display: flex; flex-direction: column; gap: 6px;">`);
    html.push(
      `${indent}  <label style="font-size: 14px; font-weight: 500; color: #374151;">${data.label ?? 'Select'}</label>`
    );
    html.push(
      `${indent}  <select style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; ${customStyle}">`
    );
    html.push(`${indent}    <option value="">${data.placeholder ?? 'Select an option'}</option>`);

    for (const option of options.slice(0, 5)) {
      html.push(`${indent}    <option value="${option.value}">${option.label}</option>`);
    }

    html.push(`${indent}  </select>`);
    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Toggle node
   */
  private renderToggle(data: ToggleNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const bgColor = data.checked ? '#3b82f6' : '#d1d5db';
    const translateX = data.checked ? '20px' : '2px';

    const html: string[] = [];
    html.push(
      `${indent}<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; ${customStyle}">`
    );
    html.push(`${indent}  <label style="font-size: 14px; color: #374151;">${data.label}</label>`);
    html.push(
      `${indent}  <button type="button" role="switch" aria-checked="${data.checked ? 'true' : 'false'}" style="position: relative; display: inline-flex; width: 44px; height: 24px; border: none; border-radius: 12px; background: ${bgColor}; cursor: pointer; transition: background 0.2s;"${data.disabled ? ' disabled' : ''}>`
    );
    html.push(
      `${indent}    <span style="position: absolute; width: 20px; height: 20px; top: 2px; left: ${translateX}; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: left 0.2s;"></span>`
    );
    html.push(`${indent}  </button>`);
    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Render Textarea node
   */
  private renderTextarea(data: TextareaNodeData, indent: string): string {
    const customStyle = customCSSToString(data.customCSS);
    const required = data.required ? ' *' : '';
    const rows = data.rows ?? 4;

    const html: string[] = [];
    html.push(`${indent}<div style="display: flex; flex-direction: column; gap: 6px;">`);
    html.push(
      `${indent}  <label style="font-size: 14px; font-weight: 500; color: #374151;">${data.label ?? 'Textarea'}${required}</label>`
    );
    html.push(
      `${indent}  <textarea rows="${String(rows)}" placeholder="${data.placeholder ?? ''}" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; resize: none; font-family: inherit; ${customStyle}"${data.required === true ? ' required' : ''}></textarea>`
    );
    html.push(`${indent}</div>`);

    return html.join('\n');
  }

  /**
   * Wrap content in complete HTML document
   */
  private wrapInHTMLDocument(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Component Preview</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
			-webkit-font-smoothing: antialiased;
			padding: 2rem;
			background: linear-gradient(to bottom right, #f8fafc, #e2e8f0);
			min-height: 100vh;
			color: #1f2937;
		}

		button {
			font-family: inherit;
			transition: all 0.2s ease;
		}

		button:hover {
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		}

		button:active {
			transform: translateY(0);
		}

		input, textarea, select {
			font-family: inherit;
			transition: all 0.2s ease;
		}

		input:focus, textarea:focus, select:focus {
			outline: none;
			border-color: #3b82f6;
			box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
		}

		.card {
			transition: all 0.3s ease;
		}

		.card:hover {
			box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
			transform: translateY(-2px);
		}

		a {
			transition: color 0.2s ease;
		}

		a:hover {
			color: #1d4ed8;
		}
	</style>
</head>
<body>
	${content}
</body>
</html>`;
  }

  /**
   * Empty preview when no nodes
   */
  private getEmptyPreview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Component Preview</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			background: #f9fafb;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
		}
	</style>
</head>
<body>
	<div style="text-align: center; color: #9ca3af;">
		<svg style="width: 64px; height: 64px; margin: 0 auto 1rem; opacity: 0.5;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
		</svg>
		<p style="font-size: 0.875rem; font-weight: 500;">No components yet</p>
		<p style="font-size: 0.75rem; margin-top: 0.5rem;">Drag components from the palette to see a live preview</p>
	</div>
</body>
</html>`;
  }
}

// Export singleton instance
export const htmlRenderer = new HTMLRenderer();
