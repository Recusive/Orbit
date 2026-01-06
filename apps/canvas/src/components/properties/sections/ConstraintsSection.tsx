/**
 * ConstraintsSection
 *
 * Wraps the existing ConstraintPicker in a collapsible section
 * for the new properties panel.
 */

import React from 'react';

import { ConstraintPicker } from '../../ConstraintPicker';
import { CollapsibleSection } from '../shared/CollapsibleSection';

import type { Constraints } from '../../../types/designNodeTypes';

export interface ConstraintsSectionProps {
  constraints: Constraints;
  onChange: (constraints: Constraints) => void;
  disabled?: boolean;
}

// Icon
const ConstraintsIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <line x1="4" y1="12" x2="20" y2="12" opacity="0.5" />
    <line x1="12" y1="4" x2="12" y2="20" opacity="0.5" />
  </svg>
);

export function ConstraintsSection({
  constraints,
  onChange,
  disabled = false,
}: ConstraintsSectionProps): React.JSX.Element {
  // Preview text showing current constraints
  const previewText = `${constraints.horizontal} / ${constraints.vertical}`;

  return (
    <CollapsibleSection
      title="Constraints"
      sectionId="constraints"
      icon={<ConstraintsIcon />}
      defaultOpen={false}
      preview={
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{previewText}</span>
      }
    >
      <ConstraintPicker constraints={constraints} onChange={onChange} disabled={disabled} />
    </CollapsibleSection>
  );
}

export default ConstraintsSection;
