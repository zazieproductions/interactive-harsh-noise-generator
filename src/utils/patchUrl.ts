// Patch encoding: `{ seed, params }` ⇄ URL hash.
//
// Two jobs:
//   1. **Shareable links.** A link like
//      `…#nw1&d=600&t=white&dis=85&…` reopens the exact same wall on any
//      device — the natural way to move a patch from a laptop to a phone.
//   2. **Refresh-safe state.** The hash is kept in sync (via `replaceState`,
//      so no history spam) and restored on load.

import { DEFAULT_PARAMS, type NoiseParams, type NoiseType } from './noiseSynth';

const VERSION = 'nw1';

/** Numeric fields, each with its compact key and valid range. */
const NUMERIC_FIELDS: {
  key: Exclude<keyof NoiseParams, 'noiseType'>;
  short: string;
  min: number;
  max: number;
}[] = [
  { key: 'duration', short: 'd', min: 2, max: 600 },
  { key: 'distortionAmount', short: 'dis', min: 0, max: 100 },
  { key: 'density', short: 'den', min: 0, max: 100 },
  { key: 'feedback', short: 'fb', min: 0, max: 100 },
  { key: 'lfoRate', short: 'lr', min: 0, max: 10 },
  { key: 'lfoDepth', short: 'ld', min: 0, max: 100 },
  { key: 'filterFreq', short: 'ff', min: 100, max: 16000 },
  { key: 'filterQ', short: 'fq', min: 0, max: 30 },
  { key: 'bitcrush', short: 'bc', min: 0, max: 100 },
  { key: 'subBass', short: 'sb', min: 0, max: 100 },
  { key: 'grit', short: 'gr', min: 0, max: 100 },
  { key: 'seed', short: 's', min: -2147483648, max: 2147483647 },
];

const TYPE_KEY = 't';

const NOISE_TYPES: NoiseType[] = ['white', 'pink', 'brown', 'grey', 'crackling', 'digital', 'saturated'];

const BY_SHORT = new Map(NUMERIC_FIELDS.map((field) => [field.short, field]));

/** Serialises the full patch (never a partial one — links must be exact). */
export function encodePatch(params: NoiseParams): string {
  const search = new URLSearchParams();
  search.set(TYPE_KEY, params.noiseType);
  for (const field of NUMERIC_FIELDS) {
    const value = params[field.key];
    const rounded = Math.round(value * 100) / 100;
    search.set(field.short, String(rounded));
  }
  return `${VERSION}&${search.toString()}`;
}

/**
 * Parses a hash produced by `encodePatch`. Every value is validated and
 * clamped, so a hand-edited or truncated link can never feed the DSP engine an
 * out-of-range parameter.
 */
export function decodePatch(hash: string): Partial<NoiseParams> | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(`${VERSION}&`)) return null;

  const search = new URLSearchParams(raw.slice(VERSION.length + 1));
  const patch: Partial<NoiseParams> = {};

  const type = search.get(TYPE_KEY);
  if (type && (NOISE_TYPES as string[]).includes(type)) {
    patch.noiseType = type as NoiseType;
  }

  for (const [short, value] of search.entries()) {
    const field = BY_SHORT.get(short);
    if (!field) continue;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) continue;
    const clamped = Math.min(field.max, Math.max(field.min, parsed));
    patch[field.key] = field.key === 'seed' ? Math.round(clamped) : clamped;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** Merges a decoded patch over the defaults. */
export function paramsFromPatch(patch: Partial<NoiseParams> | null): NoiseParams {
  if (!patch) return { ...DEFAULT_PARAMS };
  return { ...DEFAULT_PARAMS, ...patch };
}

export function patchFromLocation(): Partial<NoiseParams> | null {
  if (typeof window === 'undefined') return null;
  try {
    return decodePatch(window.location.hash);
  } catch {
    return null;
  }
}

/** Mirrors the current patch into the address bar without adding history. */
export function syncLocationHash(params: NoiseParams): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = `${window.location.pathname}${window.location.search}#${encodePatch(params)}`;
    window.history.replaceState(null, '', url);
  } catch {
    /* replaceState can throw in exotic sandboxes — the app still works */
  }
}

/** Absolute, shareable URL for the current patch. */
export function buildShareUrl(params: NoiseParams): string {
  if (typeof window === 'undefined') return `#${encodePatch(params)}`;
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${encodePatch(params)}`;
}
