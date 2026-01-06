/**
 * TextSection
 *
 * Text properties section containing:
 * - Font family dropdown
 * - Font size
 * - Font weight
 * - Line height
 * - Letter spacing
 * - Text alignment (horizontal + vertical)
 * - Text decoration
 * - Text case
 */

import React, { useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/designTokens';
import { NumberInput } from '../inputs/NumberInput';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { IconButton, IconButtonGroup } from '../shared/IconButton';
import { PropertyRow, InputWrapper } from '../shared/PropertyRow';

import type { TextAlign, TextAlignVertical, TextDecoration } from '../../../types/designNodeTypes';

export interface TextSectionProps {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | 'auto';
  letterSpacing: number;
  textAlign: TextAlign;
  textAlignVertical: TextAlignVertical;
  textDecoration: TextDecoration;
  textCase?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  onFontFamilyChange: (family: string) => void;
  onFontSizeChange: (size: number) => void;
  onFontWeightChange: (weight: number) => void;
  onLineHeightChange: (height: number | 'auto') => void;
  onLetterSpacingChange: (spacing: number) => void;
  onTextAlignChange: (align: TextAlign) => void;
  onTextAlignVerticalChange: (align: TextAlignVertical) => void;
  onTextDecorationChange: (decoration: TextDecoration) => void;
  onTextCaseChange?: (textCase: 'none' | 'uppercase' | 'lowercase' | 'capitalize') => void;
  disabled?: boolean;
}

// Icons
const TextIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

const AlignLeftIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="15" y2="12" />
    <line x1="3" y1="18" x2="18" y2="18" />
  </svg>
);

const AlignCenterIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="6" y1="12" x2="18" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

const AlignRightIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="9" y1="12" x2="21" y2="12" />
    <line x1="6" y1="18" x2="21" y2="18" />
  </svg>
);

const AlignJustifyIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const AlignTopIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="4" x2="21" y2="4" />
    <line x1="6" y1="8" x2="6" y2="16" opacity="0.5" />
    <line x1="12" y1="8" x2="12" y2="20" opacity="0.5" />
    <line x1="18" y1="8" x2="18" y2="14" opacity="0.5" />
  </svg>
);

const AlignMiddleIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="6" y1="8" x2="6" y2="16" opacity="0.5" />
    <line x1="12" y1="6" x2="12" y2="18" opacity="0.5" />
    <line x1="18" y1="9" x2="18" y2="15" opacity="0.5" />
  </svg>
);

const AlignBottomIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="20" x2="21" y2="20" />
    <line x1="6" y1="8" x2="6" y2="16" opacity="0.5" />
    <line x1="12" y1="4" x2="12" y2="16" opacity="0.5" />
    <line x1="18" y1="10" x2="18" y2="16" opacity="0.5" />
  </svg>
);

const UnderlineIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 4v6a6 6 0 0 0 12 0V4" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

const StrikethroughIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="12" x2="20" y2="12" />
    <path d="M17.5 6.5a4 4 0 0 0-5-3.5c-2.7.5-4.5 2.5-4.5 5 0 3.5 4 5.5 8 5.5" opacity="0.5" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 50,
  },
  select: {
    flex: 1,
    height: 28,
    padding: `0 ${String(spacing.md)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--input)',
    color: 'var(--foreground)',
    fontSize: fontSize.sm,
    outline: 'none',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  alignmentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
  },
  decorationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
};

const fontFamilyOptions = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Source Sans Pro',
  'Playfair Display',
  'Merriweather',
  'system-ui',
];

const fontWeightOptions = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'Extra Light' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi Bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra Bold' },
  { value: 900, label: 'Black' },
];

export function TextSection({
  fontFamily,
  fontSize: fontSizeVal,
  fontWeight: fontWeightVal,
  lineHeight,
  letterSpacing,
  textAlign,
  textAlignVertical,
  textDecoration,
  textCase = 'none',
  onFontFamilyChange,
  onFontSizeChange,
  onFontWeightChange,
  onLineHeightChange,
  onLetterSpacingChange,
  onTextAlignChange,
  onTextAlignVerticalChange,
  onTextDecorationChange,
  onTextCaseChange,
  disabled = false,
}: TextSectionProps): React.JSX.Element {
  // Handle line height change
  const handleLineHeightChange = useCallback(
    (value: number) => {
      onLineHeightChange(value);
    },
    [onLineHeightChange]
  );

  // Handle auto line height toggle
  const handleLineHeightAutoToggle = useCallback(() => {
    if (lineHeight === 'auto') {
      onLineHeightChange(1.5);
    } else {
      onLineHeightChange('auto');
    }
  }, [lineHeight, onLineHeightChange]);

  return (
    <CollapsibleSection title="Text" sectionId="text" icon={<TextIcon />} defaultOpen={false}>
      <div style={styles.content}>
        {/* Font Family */}
        <div style={styles.row}>
          <span style={styles.label}>Font</span>
          <select
            value={fontFamily}
            onChange={(e) => {
              onFontFamilyChange(e.target.value);
            }}
            disabled={disabled}
            style={styles.select}
          >
            {fontFamilyOptions.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size & Weight */}
        <PropertyRow inline gap="md" marginBottom="none">
          <InputWrapper label="Size">
            <NumberInput
              value={fontSizeVal}
              onChange={onFontSizeChange}
              min={1}
              max={999}
              disabled={disabled}
            />
          </InputWrapper>
          <div style={{ flex: 1 }}>
            <select
              value={fontWeightVal}
              onChange={(e) => {
                onFontWeightChange(Number(e.target.value));
              }}
              disabled={disabled}
              style={{ ...styles.select, width: '100%' }}
            >
              {fontWeightOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </PropertyRow>

        {/* Line Height & Letter Spacing */}
        <PropertyRow inline gap="md" marginBottom="none">
          <InputWrapper label="Line H">
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              {lineHeight === 'auto' ? (
                <span
                  style={{
                    flex: 1,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 ${String(spacing.sm)}px`,
                    border: '1px solid var(--border)',
                    borderRadius: radii.sm,
                    backgroundColor: 'var(--input)',
                    color: 'var(--muted-foreground)',
                    fontSize: fontSize.sm,
                    cursor: 'pointer',
                  }}
                  onClick={handleLineHeightAutoToggle}
                >
                  Auto
                </span>
              ) : (
                <NumberInput
                  value={lineHeight}
                  onChange={handleLineHeightChange}
                  min={0.5}
                  max={5}
                  step={0.1}
                  precision={1}
                  disabled={disabled}
                />
              )}
            </div>
          </InputWrapper>
          <InputWrapper label="Letter">
            <NumberInput
              value={letterSpacing}
              onChange={onLetterSpacingChange}
              min={-10}
              max={100}
              step={0.1}
              precision={1}
              disabled={disabled}
            />
          </InputWrapper>
        </PropertyRow>

        {/* Horizontal Alignment */}
        <div style={styles.alignmentRow}>
          <span style={styles.label}>Align</span>
          <IconButtonGroup>
            <IconButton
              icon={<AlignLeftIcon />}
              onClick={() => {
                onTextAlignChange('left');
              }}
              isActive={textAlign === 'left'}
              disabled={disabled}
              title="Align left"
              size="sm"
            />
            <IconButton
              icon={<AlignCenterIcon />}
              onClick={() => {
                onTextAlignChange('center');
              }}
              isActive={textAlign === 'center'}
              disabled={disabled}
              title="Align center"
              size="sm"
            />
            <IconButton
              icon={<AlignRightIcon />}
              onClick={() => {
                onTextAlignChange('right');
              }}
              isActive={textAlign === 'right'}
              disabled={disabled}
              title="Align right"
              size="sm"
            />
            <IconButton
              icon={<AlignJustifyIcon />}
              onClick={() => {
                onTextAlignChange('justify');
              }}
              isActive={textAlign === 'justify'}
              disabled={disabled}
              title="Justify"
              size="sm"
            />
          </IconButtonGroup>
        </div>

        {/* Vertical Alignment */}
        <div style={styles.alignmentRow}>
          <span style={styles.label}>Vert</span>
          <IconButtonGroup>
            <IconButton
              icon={<AlignTopIcon />}
              onClick={() => {
                onTextAlignVerticalChange('top');
              }}
              isActive={textAlignVertical === 'top'}
              disabled={disabled}
              title="Align top"
              size="sm"
            />
            <IconButton
              icon={<AlignMiddleIcon />}
              onClick={() => {
                onTextAlignVerticalChange('center');
              }}
              isActive={textAlignVertical === 'center'}
              disabled={disabled}
              title="Align middle"
              size="sm"
            />
            <IconButton
              icon={<AlignBottomIcon />}
              onClick={() => {
                onTextAlignVerticalChange('bottom');
              }}
              isActive={textAlignVertical === 'bottom'}
              disabled={disabled}
              title="Align bottom"
              size="sm"
            />
          </IconButtonGroup>
        </div>

        {/* Decoration */}
        <div style={styles.decorationRow}>
          <span style={styles.label}>Style</span>
          <IconButtonGroup>
            <IconButton
              icon={<UnderlineIcon />}
              onClick={() => {
                onTextDecorationChange(textDecoration === 'underline' ? 'none' : 'underline');
              }}
              isActive={textDecoration === 'underline'}
              disabled={disabled}
              title="Underline"
              size="sm"
            />
            <IconButton
              icon={<StrikethroughIcon />}
              onClick={() => {
                onTextDecorationChange(textDecoration === 'line-through' ? 'none' : 'line-through');
              }}
              isActive={textDecoration === 'line-through'}
              disabled={disabled}
              title="Strikethrough"
              size="sm"
            />
          </IconButtonGroup>

          {/* Text case */}
          {onTextCaseChange ? (
            <select
              value={textCase}
              onChange={(e) => {
                onTextCaseChange(e.target.value as typeof textCase);
              }}
              disabled={disabled}
              style={{ ...styles.select, flex: 0, width: 100 }}
            >
              <option value="none">None</option>
              <option value="uppercase">UPPER</option>
              <option value="lowercase">lower</option>
              <option value="capitalize">Title</option>
            </select>
          ) : null}
        </div>
      </div>
    </CollapsibleSection>
  );
}

export default TextSection;
