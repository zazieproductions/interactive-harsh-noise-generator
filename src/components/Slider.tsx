import type { CSSProperties } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Overrides the default numeric readout. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
  /** Short helper line under the control. */
  hint?: string;
}

/**
 * Touch-first range control.
 *
 * The v1.0 slider was an 8 px track with a transparent native input layered on
 * top — fine with a mouse, fiddly with a thumb. This one styles the native
 * input itself: a 44 px hit area (Apple/Material minimum), a 26 px thumb, and
 * a filled track drawn from a CSS custom property.
 */
export function Slider({ label, value, min, max, step = 1, unit = '', format, onChange, hint }: SliderProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const display = format ? format(value) : `${value.toFixed(step < 1 ? 1 : 0)}${unit}`;
  const inputId = `slider-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'value'}`;

  return (
    <div className="select-none">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-[11px] font-mono text-gray-400 uppercase tracking-wider"
        >
          {label}
        </label>
        <span className="text-xs font-mono text-red-300 tabular-nums bg-red-950/40 px-2 py-0.5 rounded">
          {display}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(parseFloat(event.target.value))}
        className="nw-range mt-1"
        style={{ '--nw-fill': `${percent}%` } as CSSProperties}
      />
      {hint ? <p className="text-[10px] text-gray-600 leading-snug -mt-1">{hint}</p> : null}
    </div>
  );
}
