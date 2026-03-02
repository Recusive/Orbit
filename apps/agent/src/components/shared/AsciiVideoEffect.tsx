/**
 * AsciiVideoEffect — Renders a video (or image) as an animated ASCII art canvas.
 *
 * Inspired by the Inception Labs hero effect (inceptionlabs.ai).
 *
 * How it works:
 *  1. A hidden <video> loads the media source and plays in a loop
 *  2. Each animation frame, the video is drawn to an off-screen canvas at reduced
 *     resolution (one pixel per character cell)
 *  3. For each grid cell, the pixel's luminance determines the opacity of the
 *     ASCII character rendered at that position
 *  4. The text content is procedurally generated to look like real code —
 *     programming keywords, hex literals, operators, and bracketed expressions
 *  5. A periodic scramble pass randomly swaps characters using sine wave offsets,
 *     creating a "living, breathing" animation
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsciiVideoEffectProps {
  /** URL to a video (.mp4, .webm) or image (.png, .jpg) source */
  readonly mediaSource: string;
  /** Font size in pixels — smaller = denser grid (default 8) */
  readonly fontSize?: number;
  /** 'dark' = white chars on dark bg, 'light' = dark on light, 'color' = preserve source colors */
  readonly colorMode?: 'dark' | 'light' | 'color';
  /** Horizontal alignment of the video within the canvas */
  readonly alignment?: 'left' | 'center' | 'right';
  /** Show faint code pattern in areas outside the video region */
  readonly showPattern?: boolean;
  /** Characters used in 'color' mode overlay (default '@') */
  readonly asciiChars?: string;
  /** Whether the animation is running */
  readonly isPlaying?: boolean;
  /** Invert brightness mapping */
  readonly invert?: boolean;
  /** Additional CSS class for the outer container */
  readonly className?: string;
}

interface CharCell {
  original: string;
  current: string;
  isSpace: boolean;
  phaseOffset: number;
}

interface LineData {
  y: number;
  lineIndex: number;
  chars: CharCell[];
  phaseOffset: number;
  maxCharsPerLine: number;
}

interface LayoutMetrics {
  width: number;
  height: number;
  charsWidth: number;
  charsHeight: number;
  pixelOffsetX: number;
  pixelOffsetY: number;
  pixelWidth: number;
  pixelHeight: number;
  baseCharWidth: number;
  baseCharHeight: number;
}

interface TextConfig {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontFamily: string;
  scrambleSpeed: number;
  alignment: string;
  maxWidth: number;
}

// ---------------------------------------------------------------------------
// Character sets — curated to look like real source code
// ---------------------------------------------------------------------------

const FULL_CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

const KEYWORDS =
  'function.const.let.var.return.async.await.import.export.class.extends.interface.type.enum.struct.void.int.char.if.else.for.while.switch.case.break.continue.default.try.catch.throw.finally.new.delete.typeof.instanceof.public.private.protected.static.readonly.abstract.virtual.null.undefined.true.false.NaN.Infinity.void.never.Array.Object.String.Number.Boolean.Symbol.Map.Set.Promise.Observable.Stream.Buffer.Event.Error.Exception.document.window.console.process.module.require.exports.TCP.HTTP.HTTPS.SSH.FTP.DNS.API.REST.JSON.XML.kernel.socket.buffer.stream.pipe.fork.exec.spawn.kill.malloc.free.sizeof.typedef.volatile.extern.inline.register.SELECT.FROM.WHERE.JOIN.INSERT.UPDATE.DELETE.CREATE.DROP.the.and.for.are.but.not.you.all.can.had.her.was.with.this.that.have.from.they.been.would.there.their.which.when.make.like.time.just.know.take.into.year.your.some.them.than.then.only.come.over.such.also.back.after.most.made.being.where.through.before.between'.split(
    '.'
  );

const OPERATORS = [
  '=>',
  '->',
  '::',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '<<',
  '>>',
  '**',
  '?.',
  '??',
  '...',
  '|>',
  '<|',
];

const HEX_CHARS = '0123456789ABCDEFabcdef';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~';
const PUNCTUATION = '.,;:!?';

// ---------------------------------------------------------------------------
// Pre-computed opacity lookup tables (avoids string allocation per frame)
// ---------------------------------------------------------------------------

// Orbit accent colors: dark = #e9ad97 (accent-11), light = #6b4030 (accent-9)
const DARK_OPACITY_TABLE: string[] = [];
const LIGHT_OPACITY_TABLE: string[] = [];
for (let i = 0; i <= 100; i++) {
  const t = i / 100;
  DARK_OPACITY_TABLE[i] = `rgba(233, 173, 151, ${t.toFixed(2)})`;
  LIGHT_OPACITY_TABLE[i] = `rgba(107, 64, 48, ${t.toFixed(2)})`;
}

const PATTERN_COLOR_DARK = 'rgba(233, 173, 151, 0.08)';
const PATTERN_COLOR_LIGHT = 'rgba(107, 64, 48, 0.1)';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];

function isVideoSource(src: string): boolean {
  return VIDEO_EXTENSIONS.some((ext) => src.toLowerCase().endsWith(ext));
}

/** HSL helper — convert hue sector to RGB component */
function hueToRgb(p: number, q: number, t: number): number {
  let h = t;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 1 / 2) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}

/** Fast color string with quantized caching */
const colorCache = new Map<number, string>();
function rgbString(r: number, g: number, b: number): string {
  const key = (((r >> 3) & 31) << 10) | (((g >> 3) & 31) << 5) | ((b >> 3) & 31);
  const cached = colorCache.get(key);
  if (cached) return cached;
  const s = `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
  colorCache.set(key, s);
  if (colorCache.size > 1000) colorCache.clear();
  return s;
}

/** Safe random pick from a readonly string array */
function pick(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? '';
}

/** Safe random char from a string */
function pickChar(str: string): string {
  return str[Math.floor(Math.random() * str.length)] ?? '';
}

function opacityString(mode: 'dark' | 'light', opacity: number): string {
  const idx = Math.max(0, Math.min(100, Math.round(opacity * 100)));
  const table = mode === 'dark' ? DARK_OPACITY_TABLE : LIGHT_OPACITY_TABLE;
  return table[idx] ?? 'rgba(255, 255, 255, 0)';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AsciiVideoEffect: React.FC<AsciiVideoEffectProps> = ({
  mediaSource,
  fontSize = 8,
  colorMode = 'dark',
  alignment = 'right',
  showPattern = true,
  asciiChars = '@',
  isPlaying = true,
  invert = false,
  className,
}) => {
  // Tunables (matching Inception's values)
  const CONTRAST_BOOST = 1.5;
  const LUMINANCE_THRESHOLD = 0.05;
  const SATURATION_MULT = 1.5;
  const LIGHTNESS_GAMMA = 0.55;
  const LIGHTNESS_BOOST = 0.25;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const isVideoRef = useRef(isVideoSource(mediaSource));
  const mediaElementRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const layoutRef = useRef<LayoutMetrics>({
    width: 0,
    height: 0,
    charsWidth: 0,
    charsHeight: 0,
    pixelOffsetX: 0,
    pixelOffsetY: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    baseCharWidth: 0,
    baseCharHeight: 0,
  });
  const linesRef = useRef<LineData[]>([]);
  const lastImageDataRef = useRef<ImageData | null>(null);
  const staticImageDataRef = useRef<ImageData | null>(null);
  const charWidthRef = useRef(0);
  const lastScrambleRef = useRef(0);
  const configRef = useRef<TextConfig>({
    fontSize,
    lineHeight: 1,
    letterSpacing: 1.3,
    fontFamily: '"IBM Plex Mono", monospace',
    scrambleSpeed: 40,
    alignment,
    maxWidth: 1320,
  });

  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const effectiveChars = asciiChars.length > 0 ? asciiChars : '@';
  const shouldAnimate = isPlaying && isVisible;

  // --- IntersectionObserver (only animate when on-screen) ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // --- Keep config in sync ---
  useEffect(() => {
    configRef.current = { ...configRef.current, fontSize, alignment, maxWidth: 1320 };
  }, [fontSize, alignment]);

  // --- Load media (video or image) ---
  useEffect(() => {
    if (!mediaSource) {
      setMediaLoaded(false);
      return;
    }

    isVideoRef.current = isVideoSource(mediaSource);

    if (isVideoRef.current) {
      const video = document.createElement('video');
      video.src = mediaSource;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';

      video.onloadeddata = (): void => {
        mediaElementRef.current = video;

        const oc = document.createElement('canvas');
        offscreenCanvasRef.current = oc;
        offscreenCtxRef.current = oc.getContext('2d');

        // Capture a static frame for paused state
        const tmp = document.createElement('canvas');
        tmp.width = video.videoWidth;
        tmp.height = video.videoHeight;
        const tmpCtx = tmp.getContext('2d');
        if (tmpCtx) {
          tmpCtx.drawImage(video, 0, 0);
          try {
            staticImageDataRef.current = tmpCtx.getImageData(
              0,
              0,
              video.videoWidth,
              video.videoHeight
            );
          } catch {
            /* CORS */
          }
        }

        setMediaLoaded(true);
      };

      video.load();
      return () => {
        video.pause();
        video.src = '';
        mediaElementRef.current = null;
        offscreenCanvasRef.current = null;
        offscreenCtxRef.current = null;
        lastImageDataRef.current = null;
        staticImageDataRef.current = null;
      };
    }

    // Image path
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = (): void => {
      mediaElementRef.current = img;
      const oc = document.createElement('canvas');
      offscreenCanvasRef.current = oc;
      offscreenCtxRef.current = oc.getContext('2d');
      setMediaLoaded(true);
    };
    img.src = mediaSource;
    return () => {
      img.src = '';
      mediaElementRef.current = null;
      offscreenCanvasRef.current = null;
      offscreenCtxRef.current = null;
      lastImageDataRef.current = null;
    };
  }, [mediaSource]);

  // --- Play/pause video based on visibility ---
  useEffect(() => {
    if (!isVideoRef.current || !mediaLoaded) return;
    const video = mediaElementRef.current as HTMLVideoElement | null;
    if (!video) return;

    if (shouldAnimate) {
      lastImageDataRef.current = null;
      video.play().catch(() => {
        /* autoplay blocked */
      });
    } else {
      video.pause();
      // Capture paused frame
      const ctx = offscreenCtxRef.current;
      const layout = layoutRef.current;
      if (ctx && layout.charsWidth > 0) {
        ctx.clearRect(0, 0, layout.charsWidth, layout.charsHeight);
        ctx.drawImage(video, 0, 0, layout.charsWidth, layout.charsHeight);
        try {
          lastImageDataRef.current = ctx.getImageData(0, 0, layout.charsWidth, layout.charsHeight);
        } catch {
          /* CORS */
        }
      }
    }
  }, [shouldAnimate, mediaLoaded]);

  // --- Generate a line of code-like text ---
  const generateLine = useCallback((length: number): CharCell[] => {
    let text = '';

    // Occasional leading whitespace
    if (Math.random() < 0.12) {
      text = ' '.repeat(2 + Math.floor(Math.random() * 4));
    }

    while (text.length < length - 15) {
      const roll = Math.random();

      if (roll < 0.3) {
        text += pick(KEYWORDS);
      } else if (roll < 0.45) {
        const runLen = 2 + Math.floor(Math.random() * 10);
        for (let j = 0; j < runLen; j++) text += pickChar(FULL_CHARSET);
      } else if (roll < 0.55) {
        text += '0x';
        const hexLen = 2 + Math.floor(Math.random() * 6);
        for (let j = 0; j < hexLen; j++) text += pickChar(HEX_CHARS);
      } else if (roll < 0.65) {
        text += pick(OPERATORS);
      } else if (roll < 0.75) {
        const pair =
          Math.random() < 0.33 ? ['(', ')'] : Math.random() < 0.5 ? ['[', ']'] : ['{', '}'];
        text += pair[0] ?? '(';
        const innerLen = 1 + Math.floor(Math.random() * 8);
        for (let j = 0; j < innerLen; j++) {
          text += Math.random() < 0.3 ? pick(KEYWORDS) : pickChar(FULL_CHARSET);
        }
        text += pair[1] ?? ')';
      } else if (roll < 0.85) {
        text += pick(KEYWORDS);
        if (Math.random() < 0.4) text += '_' + pick(KEYWORDS);
        if (Math.random() < 0.3) text += String(Math.floor(Math.random() * 1000));
      } else {
        const symLen = 1 + Math.floor(Math.random() * 4);
        for (let j = 0; j < symLen; j++) text += pickChar(SYMBOLS);
      }

      // Separators
      if (text.length < length - 10) {
        const sep = Math.random();
        if (sep < 0.45) text += ' ';
        else if (sep < 0.6) text += pickChar(PUNCTUATION) + ' ';
        else if (sep < 0.75) text += '  ';
        else if (sep < 0.85) text += ' | ';
        else text += ' - ';
      }
    }

    // Pad to exact length
    while (text.length < length) text += pickChar(FULL_CHARSET);
    text = text.substring(0, length);

    return text.split('').map((ch, idx) => ({
      original: ch,
      current: ch,
      isSpace: ch === ' ',
      phaseOffset: (idx / text.length) * Math.PI + Math.random() * 0.5,
    }));
  }, []);

  // --- Layout calculation + line generation ---
  const computeLayout = useCallback(
    (
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      mode: string,
      chars: string
    ): number => {
      const cfg = configRef.current;
      ctx.font = `${String(cfg.fontSize)}px ${cfg.fontFamily}`;
      const charW = ctx.measureText('M').width;
      charWidthRef.current = charW;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      const cellW = charW * cfg.letterSpacing;
      const cols = Math.floor(cssW / cellW);
      const rows = Math.floor(cssH / (cfg.fontSize * cfg.lineHeight));

      const media = mediaElementRef.current;
      if (media) {
        const mw = isVideoRef.current
          ? (media as HTMLVideoElement).videoWidth
          : (media as HTMLImageElement).width;
        const mh = isVideoRef.current
          ? (media as HTMLVideoElement).videoHeight
          : (media as HTMLImageElement).height;
        const aspect = mw / mh;

        const charH = cfg.fontSize;
        let fitH = cssH * 0.95;
        let fitW = fitH * aspect;
        if (fitW > cssW * 0.95) {
          fitW = cssW * 0.95;
          fitH = fitW / aspect;
        }

        const maxW = cfg.maxWidth;
        const clampedW = Math.min(cssW, maxW);
        const marginX = (cssW - clampedW) / 2;

        let offsetX: number;
        if (cfg.alignment === 'left') offsetX = marginX;
        else if (cfg.alignment === 'right') offsetX = marginX + clampedW - fitW;
        else offsetX = marginX + (clampedW - fitW) / 2;

        const offsetY = (cssH - fitH) / 2;
        const gridCols = Math.ceil(fitW / charW);
        const gridRows = Math.ceil(fitH / charH);

        if (offscreenCanvasRef.current) {
          offscreenCanvasRef.current.width = gridCols;
          offscreenCanvasRef.current.height = gridRows;

          const oc = offscreenCtxRef.current;
          if (oc) {
            oc.clearRect(0, 0, gridCols, gridRows);
            if (isVideoRef.current) {
              try {
                oc.drawImage(media, 0, 0, gridCols, gridRows);
                lastImageDataRef.current = oc.getImageData(0, 0, gridCols, gridRows);
              } catch {
                if (staticImageDataRef.current) {
                  const tmp = document.createElement('canvas');
                  tmp.width = staticImageDataRef.current.width;
                  tmp.height = staticImageDataRef.current.height;
                  const tc = tmp.getContext('2d');
                  if (tc) {
                    tc.putImageData(staticImageDataRef.current, 0, 0);
                    oc.drawImage(tmp, 0, 0, gridCols, gridRows);
                    try {
                      lastImageDataRef.current = oc.getImageData(0, 0, gridCols, gridRows);
                    } catch {
                      /* */
                    }
                  }
                }
              }
            } else {
              oc.drawImage(media, 0, 0, gridCols, gridRows);
              try {
                lastImageDataRef.current = oc.getImageData(0, 0, gridCols, gridRows);
              } catch {
                /* */
              }
            }
          }
        }

        layoutRef.current = {
          width: mw,
          height: mh,
          charsWidth: gridCols,
          charsHeight: gridRows,
          pixelOffsetX: offsetX,
          pixelOffsetY: offsetY,
          pixelWidth: fitW,
          pixelHeight: fitH,
          baseCharWidth: charW,
          baseCharHeight: charH,
        };
      }

      // Generate text lines
      const lines: LineData[] = [];
      for (let row = 0; row < rows; row++) {
        const y = row * cfg.fontSize * cfg.lineHeight;
        const lineChars = generateLine(cols);

        // In color mode, replace characters with the asciiChars set
        if (mode === 'color' && chars.length > 0) {
          for (const cell of lineChars) {
            if (!cell.isSpace)
              cell.current = chars[Math.floor(Math.random() * chars.length)] ?? '@';
          }
        }

        lines.push({
          y,
          lineIndex: row,
          chars: lineChars,
          phaseOffset: Math.random() * Math.PI * 2,
          maxCharsPerLine: cols,
        });
      }

      linesRef.current = lines;
      return charW;
    },
    [generateLine]
  );

  // --- Character scramble pass ---
  const scrambleChars = useCallback((time: number, mode: string, chars: string): void => {
    const charset = mode === 'color' ? chars : FULL_CHARSET;
    const len = charset.length;
    for (const line of linesRef.current) {
      const offset = line.phaseOffset;
      for (const cell of line.chars) {
        if (cell.isSpace) continue;
        const chance = ((Math.sin(time * 0.002 + offset + cell.phaseOffset) + 1) / 2) * 0.2;
        if (Math.random() < chance && len > 0) {
          cell.current = charset[Math.floor(Math.random() * len)] ?? cell.current;
        }
      }
    }
  }, []);

  // --- Core draw function ---
  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      charW: number,
      animating: boolean,
      mode: string,
      pattern: boolean,
      chars: string
    ): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const cfg = configRef.current;
      const cellW = charW * cfg.letterSpacing;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${String(cfg.fontSize)}px ${cfg.fontFamily}`;
      ctx.textBaseline = 'top';

      const layout = layoutRef.current;

      // Get current video frame data
      let imageData: ImageData | null = null;
      if (isVideoRef.current) {
        if (animating && mediaElementRef.current && layout.charsWidth > 0) {
          const video = mediaElementRef.current as HTMLVideoElement;
          if (!video.paused && !video.ended) {
            const oc = offscreenCtxRef.current;
            if (oc) {
              oc.clearRect(0, 0, layout.charsWidth, layout.charsHeight);
              oc.drawImage(video, 0, 0, layout.charsWidth, layout.charsHeight);
              try {
                imageData = oc.getImageData(0, 0, layout.charsWidth, layout.charsHeight);
              } catch {
                /* */
              }
            }
          }
        }
        if (!imageData && lastImageDataRef.current) imageData = lastImageDataRef.current;
      } else {
        imageData = lastImageDataRef.current;
      }

      const halfCellW = cellW / 2;
      const halfCellH = (cfg.fontSize * cfg.lineHeight) / 2;
      const ox = layout.pixelOffsetX;
      const oy = layout.pixelOffsetY;
      const pw = layout.pixelWidth;
      const ph = layout.pixelHeight;
      const gw = layout.charsWidth;
      const gh = layout.charsHeight;
      const hasImage = imageData !== null;
      const pixels = imageData?.data;
      const patternColor = mode === 'dark' ? PATTERN_COLOR_DARK : PATTERN_COLOR_LIGHT;

      for (const line of linesRef.current) {
        const lineY = line.y;
        for (let col = 0; col < line.chars.length; col++) {
          const cell = line.chars[col];
          if (!cell) continue;
          const charStr = cell.current;
          const x = col * cellW;

          // Center of this character cell
          const cx = x + halfCellW;
          const cy = lineY + halfCellH;

          // Map to video pixel coordinates
          const relX = cx - ox;
          const relY = cy - oy;
          const inVideoRegion = hasImage && relX >= 0 && relX < pw && relY >= 0 && relY < ph;
          let drewFromVideo = false;

          if (inVideoRegion && pixels) {
            const gx = Math.floor((relX / pw) * gw);
            const gy = Math.floor((relY / ph) * gh);

            if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) {
              const idx = (gy * gw + gx) * 4;
              const r = pixels[idx] ?? 0;
              const g = pixels[idx + 1] ?? 0;
              const b = pixels[idx + 2] ?? 0;
              const a = pixels[idx + 3] ?? 0;
              const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

              if ((invert || luminance > LUMINANCE_THRESHOLD) && a > 20) {
                drewFromVideo = true;

                if (mode === 'color') {
                  // Full color rendering
                  const displayChar = chars.length > 0 ? charStr : '@';
                  const rn = r / 255,
                    gn = g / 255,
                    bn = b / 255;
                  const cmax = Math.max(rn, gn, bn);
                  const cmin = Math.min(rn, gn, bn);
                  let hue = 0,
                    sat = 0;
                  const light = (cmax + cmin) / 2;

                  if (cmax !== cmin) {
                    const delta = cmax - cmin;
                    sat = light > 0.5 ? delta / (2 - cmax - cmin) : delta / (cmax + cmin);
                    if (cmax === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
                    else if (cmax === gn) hue = ((bn - rn) / delta + 2) / 6;
                    else hue = ((rn - gn) / delta + 4) / 6;
                  }

                  const adjSat = Math.min(1, sat * SATURATION_MULT);
                  let adjLight = light ** (1 / LIGHTNESS_GAMMA);
                  adjLight += LIGHTNESS_BOOST * adjLight;

                  let finalR: number, finalG: number, finalB: number;
                  if (adjSat === 0) {
                    finalR = finalG = finalB = adjLight * 255;
                  } else {
                    const q2 =
                      adjLight < 0.5
                        ? adjLight * (1 + adjSat)
                        : adjLight + adjSat - adjLight * adjSat;
                    const p2 = 2 * adjLight - q2;
                    finalR = hueToRgb(p2, q2, hue + 1 / 3) * 255;
                    finalG = hueToRgb(p2, q2, hue) * 255;
                    finalB = hueToRgb(p2, q2, hue - 1 / 3) * 255;
                  }

                  // Contrast boost
                  finalR = Math.max(
                    0,
                    Math.min(255, Math.round(128 + (finalR - 128) * CONTRAST_BOOST))
                  );
                  finalG = Math.max(
                    0,
                    Math.min(255, Math.round(128 + (finalG - 128) * CONTRAST_BOOST))
                  );
                  finalB = Math.max(
                    0,
                    Math.min(255, Math.round(128 + (finalB - 128) * CONTRAST_BOOST))
                  );

                  ctx.fillStyle = rgbString(finalR, finalG, finalB);
                  ctx.fillText(displayChar, x, lineY);
                } else {
                  // Dark / light mode — luminance-based opacity
                  const opacity = invert
                    ? (a / 255) * Math.max(0.4, 0.15 + luminance * 0.85)
                    : (a / 255) * (0.15 + luminance * 0.85);
                  ctx.fillStyle = opacityString(mode as 'dark' | 'light', opacity);
                  ctx.fillText(charStr, x, lineY);
                }
              }
            }
          }

          // Background pattern for areas outside the video
          if (pattern && !drewFromVideo) {
            ctx.fillStyle = patternColor;
            ctx.fillText(charStr, x, lineY);
          }
        }
      }
    },
    [invert, CONTRAST_BOOST, LUMINANCE_THRESHOLD, SATURATION_MULT, LIGHTNESS_GAMMA, LIGHTNESS_BOOST]
  );

  // --- Main animation loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mediaLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let charW = 0;

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
      charW = computeLayout(canvas, ctx, colorMode, effectiveChars);
    };

    const frame = (time: number): void => {
      const cfg = configRef.current;
      if (shouldAnimate && time - lastScrambleRef.current > cfg.scrambleSpeed) {
        lastScrambleRef.current = time;
        scrambleChars(time, colorMode, effectiveChars);
      }
      draw(ctx, charW, shouldAnimate, colorMode, showPattern, effectiveChars);
      if (shouldAnimate) {
        rafRef.current = requestAnimationFrame(frame);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    if (shouldAnimate) {
      rafRef.current = requestAnimationFrame(frame);
    } else {
      // Draw a single static frame
      draw(ctx, charW, false, colorMode, showPattern, effectiveChars);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    computeLayout,
    scrambleChars,
    draw,
    mediaLoaded,
    shouldAnimate,
    colorMode,
    showPattern,
    effectiveChars,
  ]);

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      linesRef.current = [];
      lastImageDataRef.current = null;
      staticImageDataRef.current = null;
      mediaElementRef.current = null;
      offscreenCanvasRef.current = null;
      offscreenCtxRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
      />
    </div>
  );
};
