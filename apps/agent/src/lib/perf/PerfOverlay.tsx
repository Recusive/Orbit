/**
 * PerfOverlay — floating FPS badge + frame-drop attribution log.
 *
 * Renders in a SEPARATE React root so its own renders don't pollute
 * the app's profiling data. Uses inline styles only — no dependency
 * on the app's Tailwind or theme CSS.
 *
 * Toggle with Ctrl+Shift+M (⌃⇧M).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  clearDrops,
  getFrameMonitorState,
  startFrameMonitor,
  subscribeFrameMonitor,
} from './frame-monitor';

import type { FrameDrop, FrameMonitorState } from './frame-monitor';
import type { FC } from 'react';

// ── Styles (inline, no Tailwind) ─────────────────────────────────────

const FONT = 'ui-monospace, "SF Mono", Menlo, monospace';

const badgeStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: 12,
  zIndex: 2147483647,
  fontFamily: FONT,
  fontSize: 11,
  lineHeight: 1,
  padding: '6px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  userSelect: 'none',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  transition: 'background 120ms ease',
};

const expandedStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: 12,
  zIndex: 2147483647,
  fontFamily: FONT,
  fontSize: 11,
  lineHeight: 1.5,
  width: 380,
  maxHeight: 420,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  background: 'rgba(18,18,22,0.92)',
  color: '#d4d4d8',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  cursor: 'pointer',
  userSelect: 'none',
};

const logStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0, // required for overflow in flex child
  overflowY: 'auto',
  padding: '6px 0',
};

const dropRowStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
};

const attrStyle: React.CSSProperties = {
  paddingLeft: 16,
  color: '#a1a1aa',
};

const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#71717a',
  cursor: 'pointer',
  fontSize: 10,
  padding: '2px 6px',
};

// ── Helpers ──────────────────────────────────────────────────────────

function fpsColor(fps: number): string {
  if (fps >= 100) return '#4ade80';
  if (fps >= 60) return '#facc15';
  return '#f87171';
}

function multiplier(drop: FrameDrop): string {
  const m = drop.durationMs / drop.budgetMs;
  return m >= 2 ? `${String(Math.round(m))}x` : `${String(Math.round(m * 10) / 10)}x`;
}

function timeLabel(ts: number): string {
  const d = new Date(performance.timeOrigin + ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ── Components ───────────────────────────────────────────────────────

const DropEntry: FC<{ readonly drop: FrameDrop }> = memo(function DropEntry({ drop }) {
  return (
    <div style={dropRowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <span style={{ color: '#f87171', fontWeight: 600 }}>{String(drop.durationMs)}ms</span>
          <span style={{ color: '#71717a', marginLeft: 6 }}>({multiplier(drop)} budget)</span>
          <span style={{ color: '#52525b', marginLeft: 6, fontSize: 10 }}>
            js:{String(drop.jsMs)} brw:{String(drop.browserMs)}
          </span>
        </span>
        <span style={{ color: '#52525b', fontSize: 10 }}>{timeLabel(drop.timestamp)}</span>
      </div>
      {drop.attribution.length > 0 ? (
        <div style={{ marginTop: 2 }}>
          {drop.attribution.map((a) => (
            <div key={a.name} style={attrStyle}>
              <span style={{ color: a.name.startsWith('react:') ? '#818cf8' : '#a78bfa' }}>
                {a.name}
              </span>
              <span style={{ color: '#71717a', marginLeft: 8 }}>{String(a.totalMs)}ms</span>
              {a.count > 1 ? (
                <span style={{ color: '#52525b', marginLeft: 4 }}>x{String(a.count)}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...attrStyle, color: '#52525b', fontStyle: 'italic' }}>
          no instrumented operations in this frame
        </div>
      )}
    </div>
  );
});

const UPDATE_INTERVAL_MS = 500;

const PerfOverlayInner: FC = function PerfOverlayInner() {
  const [expanded, setExpanded] = useState(false);
  const [monitorState, setMonitorState] = useState<FrameMonitorState>(getFrameMonitorState);
  const logRef = useRef<HTMLDivElement>(null);
  const lastDropTimestampRef = useRef(0);
  const userScrolledAwayRef = useRef(false);

  useEffect(() => {
    const stopMonitor = startFrameMonitor();

    // Throttle UI updates — the monitor fires every frame (120Hz) but the
    // overlay only needs to repaint twice per second for readability.
    let timer = 0;
    const unsubscribe = subscribeFrameMonitor((s) => {
      if (timer !== 0) return;
      timer = window.setTimeout(() => {
        timer = 0;
        setMonitorState({ ...s, recentDrops: [...s.recentDrops] });
      }, UPDATE_INTERVAL_MS);
    });

    return (): void => {
      window.clearTimeout(timer);
      stopMonitor();
      unsubscribe();
    };
  }, []);

  // Auto-scroll when new drops arrive AND user hasn't scrolled away.
  // Uses last drop timestamp instead of count — count stays stable when
  // the ring buffer is at capacity (shift + push = same length).
  useEffect(() => {
    const el = logRef.current;
    if (el === null) return;

    const drops = monitorState.recentDrops;
    const lastDrop = drops.length > 0 ? drops[drops.length - 1] : undefined;
    const lastTs = lastDrop?.timestamp ?? 0;
    const hasNewDrops = lastTs > lastDropTimestampRef.current;
    lastDropTimestampRef.current = lastTs;

    if (hasNewDrops && !userScrolledAwayRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [monitorState.recentDrops]);

  // Keyboard toggle: Ctrl+Shift+M
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return (): void => {
      window.removeEventListener('keydown', handler);
    };
  }, []);

  const handleClear = useCallback((): void => {
    clearDrops();
    userScrolledAwayRef.current = false;
    lastDropTimestampRef.current = 0;
    setMonitorState((prev) => ({ ...prev, recentDrops: [] }));
  }, []);

  const handleLogScroll = useCallback((): void => {
    const el = logRef.current;
    if (el === null) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
    userScrolledAwayRef.current = !atBottom;
  }, []);

  const { fps, recentDrops } = monitorState;
  const color = fpsColor(fps);

  if (!expanded) {
    return (
      <div
        style={{
          ...badgeStyle,
          background: 'rgba(18,18,22,0.85)',
          color,
        }}
        onClick={() => {
          setExpanded(true);
        }}
        title="Frame Monitor — Ctrl+Shift+M to toggle"
      >
        <span style={{ fontSize: 16, fontWeight: 700 }}>{String(fps)}</span>
        <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>FPS</span>
      </div>
    );
  }

  return (
    // stopPropagation prevents the velocity-scroll hook on the chat scroller
    // from calling preventDefault on wheel events meant for this panel.
    <div
      style={expandedStyle}
      onWheelCapture={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        style={headerStyle}
        onClick={() => {
          setExpanded(false);
        }}
      >
        <span>
          <span style={{ fontSize: 16, fontWeight: 700, color }}>{String(fps)}</span>
          <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>FPS</span>
          <span style={{ marginLeft: 12, color: '#71717a', fontSize: 10 }}>
            {String(recentDrops.length)} drops
          </span>
        </span>
        <button type="button" style={clearBtnStyle} onClick={handleClear}>
          clear
        </button>
      </div>

      <div ref={logRef} style={logStyle} onScroll={handleLogScroll}>
        {recentDrops.length === 0 ? (
          <div style={{ padding: '12px', color: '#52525b', textAlign: 'center' }}>
            no frame drops recorded
          </div>
        ) : (
          recentDrops.map((drop) => <DropEntry key={drop.timestamp} drop={drop} />)
        )}
      </div>
    </div>
  );
};

// ── Mount ────────────────────────────────────────────────────────────

/** Mount the perf overlay in a separate React root. */
export function mountPerfOverlay(): () => void {
  const container = document.createElement('div');
  container.id = 'perf-overlay-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<PerfOverlayInner />);

  return (): void => {
    root.unmount();
    container.remove();
  };
}
