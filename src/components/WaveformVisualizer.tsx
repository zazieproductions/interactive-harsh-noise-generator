import { useCallback, useEffect, useRef, useState } from 'react';
import type { WaveformPreview } from '../utils/noiseSynth';
import { formatClock } from '../utils/format';

export interface WaveformVisualizerProps {
  preview: WaveformPreview | null;
  /** Playhead position, 0–1. */
  progress: number;
  durationSeconds: number;
  /** Commit a scrub/tap: fraction of the wall (0–1). */
  onSeek?: (fraction: number) => void;
  /** Shown while the engine renders. */
  busy?: boolean;
}

/**
 * Min/max waveform with a playhead, drawn at device-pixel resolution.
 *
 * Two things changed from v1.0 for phones:
 *   - the canvas is backed by `cssWidth × devicePixelRatio` pixels, so the
 *     waveform is crisp instead of blurry on 2×/3× screens;
 *   - the whole surface is a scrub control (`role="slider"`, drag or tap,
 *     arrow keys), because a phone has no other way to find a spot in a
 *     10-minute wall.
 */
export function WaveformVisualizer({
  preview,
  progress,
  durationSeconds,
  onSeek,
  busy = false,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrub, setScrub] = useState<number | null>(null);
  const draggingRef = useRef(false);

  // Track the CSS box so the backing store can follow the device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(canvas);
    const rect = canvas.getBoundingClientRect();
    setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = size.width;
    const h = size.height;
    const backingWidth = Math.round(w * dpr);
    const backingHeight = Math.round(h * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#111122';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = (h / 6) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#1a1a3a';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const position = scrub ?? progress;

    if (!preview) {
      ctx.fillStyle = '#2a2a35';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        busy ? 'Rendering the wall…' : 'Generate a wall to see its waveform',
        w / 2,
        h / 2,
      );
    } else {
      const columns = preview.min.length;
      const columnsPerPixel = columns / w;

      for (let x = 0; x < w; x++) {
        const startColumn = Math.floor(x * columnsPerPixel);
        const endColumn = Math.max(startColumn + 1, Math.floor((x + 1) * columnsPerPixel));
        let mn = 1;
        let mx = -1;
        for (let c = startColumn; c < endColumn && c < columns; c++) {
          if (preview.min[c] < mn) mn = preview.min[c];
          if (preview.max[c] > mx) mx = preview.max[c];
        }
        if (mx < mn) {
          mn = 0;
          mx = 0;
        }
        const yTop = h - ((mx + 1) / 2) * h;
        const yBottom = h - ((mn + 1) / 2) * h;
        const played = x / w < position;
        ctx.fillStyle = played ? 'rgba(239, 68, 68, 0.85)' : 'rgba(239, 68, 68, 0.24)';
        ctx.fillRect(x, yTop, 1, Math.max(1, yBottom - yTop));
      }
    }

    // Playhead / scrub head
    if (position > 0 || scrub !== null) {
      const px = Math.max(1, Math.min(w - 1, position * w));
      ctx.strokeStyle = scrub !== null ? '#fbbf24' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = scrub !== null ? 'rgba(251,191,36,0.8)' : 'rgba(239,68,68,0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = 0; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }
  }, [preview, progress, scrub, size, busy]);

  const fractionFromEvent = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const seekable = Boolean(onSeek) && durationSeconds > 0;

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!seekable) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrub(fractionFromEvent(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !seekable) return;
    setScrub(fractionFromEvent(event.clientX));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const fraction = fractionFromEvent(event.clientX);
    setScrub(null);
    onSeek?.(fraction);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!seekable) return;
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onSeek?.(Math.max(0, progress - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onSeek?.(Math.min(1, progress + step));
    }
  };

  const shownSeconds = (scrub ?? progress) * durationSeconds;

  return (
    <div>
      <canvas
        ref={canvasRef}
        role={seekable ? 'slider' : 'img'}
        aria-label={seekable ? 'Waveform — drag to scrub' : 'Waveform'}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationSeconds)}
        aria-valuenow={Math.round(shownSeconds)}
        tabIndex={seekable ? 0 : -1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={`w-full h-40 lg:h-56 rounded-lg border border-gray-800/60 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-red-700 ${
          seekable ? 'cursor-pointer' : ''
        }`}
      />
      <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono text-gray-500 tabular-nums">
        <span className="text-red-300">{formatClock(shownSeconds)}</span>
        <span className="text-gray-600">{seekable ? 'tap or drag to scrub' : '\u00a0'}</span>
        <span>{formatClock(durationSeconds)}</span>
      </div>
    </div>
  );
}
