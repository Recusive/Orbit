/**
 * DeviceFrameSelector - Device frame picker
 *
 * Dropdown menu with categorized device presets for responsive preview.
 */
import React, { useCallback, useState, useRef, useEffect } from 'react';

import {
  DEVICE_PRESETS,
  DEVICE_CATEGORIES,
  getDevicesByCategory,
} from '../sandpack/sandpackConfig';

import type { DevicePreset } from '../sandpack/sandpackConfig';

export interface DeviceFrameSelectorProps {
  selectedDevice: string;
  onDeviceChange: (deviceId: string, preset: DevicePreset) => void;
  compact?: boolean;
}

// Icons
const ChevronDownIcon = (): React.JSX.Element => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const PhoneIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

const TabletIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

const MonitorIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const WatchIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="7" />
    <polyline points="12 9 12 12 13.5 13.5" />
    <path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83" />
    <path d="M7.49 6.65l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83" />
  </svg>
);

const TvIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
    <polyline points="17 2 12 7 7 2" />
  </svg>
);

const ShareIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const categoryIcons: Record<string, () => React.JSX.Element> = {
  phone: PhoneIcon,
  tablet: TabletIcon,
  desktop: MonitorIcon,
  watch: WatchIcon,
  tv: TvIcon,
  social: ShareIcon,
};

export function DeviceFrameSelector({
  selectedDevice,
  onDeviceChange,
  compact = false,
}: DeviceFrameSelectorProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentPreset = DEVICE_PRESETS[selectedDevice];
  const currentCategory = currentPreset?.category ?? 'desktop';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleDeviceSelect = useCallback(
    (deviceId: string) => {
      const preset = DEVICE_PRESETS[deviceId];
      if (preset) {
        onDeviceChange(deviceId, preset);
        setIsOpen(false);
      }
    },
    [onDeviceChange]
  );

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }, []);

  const CategoryIcon = categoryIcons[currentCategory] ?? MonitorIcon;

  return (
    <div ref={dropdownRef} style={styles['container']}>
      {/* Trigger Button */}
      <button
        onClick={(): void => {
          setIsOpen(!isOpen);
        }}
        style={{
          ...styles['trigger'],
          ...(compact ? styles['triggerCompact'] : {}),
        }}
        title={`${currentPreset?.label ?? 'Desktop'} (${String(currentPreset?.width ?? 0)}×${String(currentPreset?.height ?? 0)})`}
      >
        <CategoryIcon />
        {!compact && (
          <>
            <span style={styles['triggerLabel']}>{currentPreset?.label ?? 'Desktop'}</span>
            <span style={styles['triggerSize']}>
              {currentPreset?.width}×{currentPreset?.height}
            </span>
          </>
        )}
        <ChevronDownIcon />
      </button>

      {/* Dropdown Menu */}
      {isOpen ? (
        <div style={styles['dropdown']}>
          <div style={styles['dropdownHeader']}>Frame</div>

          {Object.entries(DEVICE_CATEGORIES).map(([categoryKey, categoryLabel]) => {
            const Icon = categoryIcons[categoryKey] ?? MonitorIcon;
            const devices = getDevicesByCategory(categoryKey as DevicePreset['category']);
            const isExpanded = expandedCategory === categoryKey;

            return (
              <div key={categoryKey} style={styles['category']}>
                {/* Category Header */}
                <button
                  onClick={(): void => {
                    toggleCategory(categoryKey);
                  }}
                  style={styles['categoryHeader']}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <polygon points="6 4 20 12 6 20" />
                  </svg>
                  <Icon />
                  <span style={styles['categoryLabel']}>{categoryLabel}</span>
                </button>

                {/* Device List */}
                {isExpanded ? (
                  <div style={styles['deviceList']}>
                    {devices.map(({ id, preset }) => (
                      <button
                        key={id}
                        onClick={(): void => {
                          handleDeviceSelect(id);
                        }}
                        style={{
                          ...styles['deviceItem'],
                          ...(selectedDevice === id ? styles['deviceItemSelected'] : {}),
                        }}
                      >
                        <span style={styles['deviceLabel']}>{preset.label}</span>
                        <span style={styles['deviceSize']}>
                          {preset.width} × {preset.height}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    color: '#e5e7eb',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  triggerCompact: {
    padding: '3px 6px',
  },
  triggerLabel: {
    fontWeight: 500,
  },
  triggerSize: {
    color: '#9ca3af',
    fontSize: 10,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    width: 280,
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 8,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#e5e7eb',
    borderBottom: '1px solid #374151',
  },
  category: {
    borderBottom: '1px solid #374151',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
  },
  categoryLabel: {
    flex: 1,
  },
  deviceList: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  deviceItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '6px 12px 6px 32px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#d1d5db',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.1s ease',
  },
  deviceItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60a5fa',
  },
  deviceLabel: {
    flex: 1,
  },
  deviceSize: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: 'monospace',
  },
};

// Add hover styles via CSS injection
if (typeof document !== 'undefined' && !document.getElementById('device-frame-selector-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'device-frame-selector-styles';
  styleEl.textContent = `
		.device-frame-selector button:hover {
			background-color: rgba(255, 255, 255, 0.15) !important;
		}
	`;
  document.head.appendChild(styleEl);
}
