import React, { useState, useRef, useEffect, useCallback } from 'react';

import {
  generatePrompt,
  generateIterationPrompt,
  generateVariationsPrompt,
  copyToClipboard,
  getAvailablePlatforms,
  PLATFORM_CONFIGS,
  DEFAULT_PLATFORM,
} from '../lib/promptGenerator';

import type { Platform } from '../lib/promptGenerator';

export interface CopyPromptMenuProps {
  code: string;
  onCopySuccess?: (platform: Platform) => void;
  onCopyError?: (error: string) => void;
}

// Icons
const CopyIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const SparklesIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l1.912 5.813L20 12l-6.088 3.187L12 21l-1.912-5.813L4 12l6.088-3.187L12 3z"></path>
  </svg>
);

const RefreshIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 4v6h-6"></path>
    <path d="M1 20v-6h6"></path>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
);

type MenuMode = 'copy' | 'iterate' | 'variations';

/**
 * CopyPromptMenu - Dropdown for copying AI prompts to different platforms
 */
export function CopyPromptMenu({
  code,
  onCopySuccess,
  onCopyError,
}: CopyPromptMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(DEFAULT_PLATFORM);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [menuMode, setMenuMode] = useState<MenuMode>('copy');
  const [feedback, setFeedback] = useState('');
  const [variationType, setVariationType] = useState<'style' | 'layout' | 'color' | 'all'>('all');
  const menuRef = useRef<HTMLDivElement>(null);

  const platforms = getAvailablePlatforms();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle copy action
  const handleCopy = useCallback(
    async (platform: Platform): Promise<void> => {
      let prompt: string;

      switch (menuMode) {
        case 'copy':
          prompt = generatePrompt(code, platform);
          break;
        case 'iterate':
          prompt = generateIterationPrompt(code, feedback, platform);
          break;
        case 'variations':
          prompt = generateVariationsPrompt(code, variationType, platform);
          break;
      }

      const success = await copyToClipboard(prompt);

      if (success) {
        setCopyState('copied');
        setSelectedPlatform(platform);
        onCopySuccess?.(platform);
        setTimeout((): void => {
          setCopyState('idle');
        }, 2000);
      } else {
        onCopyError?.('Failed to copy to clipboard');
      }
    },
    [code, feedback, variationType, menuMode, onCopySuccess, onCopyError]
  );

  // Quick copy with last used platform
  const handleQuickCopy = useCallback((): void => {
    void handleCopy(selectedPlatform);
  }, [handleCopy, selectedPlatform]);

  return (
    <div ref={menuRef} style={styles['container']}>
      {/* Main copy button */}
      <div style={styles['buttonGroup']}>
        <button
          style={styles['mainButton']}
          onClick={handleQuickCopy}
          title={`Copy prompt for ${PLATFORM_CONFIGS[selectedPlatform].name}`}
        >
          {copyState === 'copied' ? <CheckIcon /> : <CopyIcon />}
          <span>{copyState === 'copied' ? 'Copied!' : 'Copy Prompt'}</span>
        </button>

        <button
          style={styles['dropdownToggle']}
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          title="Choose platform"
        >
          <ChevronDownIcon />
        </button>
      </div>

      {/* Dropdown menu */}
      {isOpen ? (
        <div style={styles['dropdown']}>
          {/* Mode tabs */}
          <div style={styles['modeTabs']}>
            <button
              style={{
                ...styles['modeTab'],
                ...(menuMode === 'copy' ? styles['modeTabActive'] : {}),
              }}
              onClick={() => {
                setMenuMode('copy');
              }}
            >
              <CopyIcon /> Copy
            </button>
            <button
              style={{
                ...styles['modeTab'],
                ...(menuMode === 'iterate' ? styles['modeTabActive'] : {}),
              }}
              onClick={() => {
                setMenuMode('iterate');
              }}
            >
              <RefreshIcon /> Iterate
            </button>
            <button
              style={{
                ...styles['modeTab'],
                ...(menuMode === 'variations' ? styles['modeTabActive'] : {}),
              }}
              onClick={() => {
                setMenuMode('variations');
              }}
            >
              <SparklesIcon /> Variations
            </button>
          </div>

          {/* Mode-specific content */}
          {menuMode === 'iterate' && (
            <div style={styles['feedbackSection']}>
              <label style={styles['feedbackLabel']}>Feedback:</label>
              <textarea
                style={styles['feedbackInput']}
                placeholder="Describe what changes you want..."
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value);
                }}
                rows={3}
              />
            </div>
          )}

          {menuMode === 'variations' && (
            <div style={styles['variationSection']}>
              <label style={styles['feedbackLabel']}>Variation type:</label>
              <div style={styles['variationOptions']}>
                {(['style', 'layout', 'color', 'all'] as const).map((type) => (
                  <button
                    key={type}
                    style={{
                      ...styles['variationButton'],
                      ...(variationType === type ? styles['variationButtonActive'] : {}),
                    }}
                    onClick={() => {
                      setVariationType(type);
                    }}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Platform list */}
          <div style={styles['platformList']}>
            <div style={styles['platformListHeader']}>Copy for:</div>
            {platforms.map((platform) => {
              const config = PLATFORM_CONFIGS[platform];
              const isSelected = platform === selectedPlatform;

              return (
                <button
                  key={platform}
                  style={{
                    ...styles['platformItem'],
                    ...(isSelected ? styles['platformItemSelected'] : {}),
                  }}
                  onClick={() => {
                    void handleCopy(platform);
                    setIsOpen(false);
                  }}
                >
                  <span style={styles['platformIcon']}>{config.icon}</span>
                  <span style={styles['platformName']}>{config.name}</span>
                  {isSelected ? <span style={styles['selectedIndicator']}>✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  buttonGroup: {
    display: 'flex',
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  mainButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    border: 'none',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  dropdownToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 8px',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    border: 'none',
    borderLeft: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 240,
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  modeTabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
  },
  modeTab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--muted-foreground)',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  modeTabActive: {
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
  },
  feedbackSection: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
  },
  feedbackLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    marginBottom: 6,
  },
  feedbackInput: {
    width: '100%',
    padding: 8,
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--foreground)',
    fontSize: 12,
    resize: 'vertical',
  },
  variationSection: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
  },
  variationOptions: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  variationButton: {
    padding: '4px 10px',
    backgroundColor: 'var(--input)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--foreground)',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  variationButtonActive: {
    backgroundColor: 'var(--primary)',
    borderColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  platformList: {
    padding: '8px 0',
  },
  platformListHeader: {
    padding: '4px 12px 8px',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  platformItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--foreground)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    textAlign: 'left',
  },
  platformItemSelected: {
    backgroundColor: 'var(--accent)',
  },
  platformIcon: {
    width: 24,
    fontSize: 14,
  },
  platformName: {
    flex: 1,
  },
  selectedIndicator: {
    color: 'var(--success)',
    fontSize: 12,
  },
};
