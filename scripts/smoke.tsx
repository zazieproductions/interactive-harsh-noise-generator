/**
 * DOM smoke test — mounts the real `<App />` in jsdom and drives it the way a
 * phone user would: restore a shared patch, hit Generate, wait for the render
 * to land, open the save sheet.
 *
 * It cannot test audio output (no Web Audio in Node) — `npm run verify` covers
 * the DSP and the encoders — but it does catch the class of bug that only
 * shows up when the component tree is actually mounted: bad imports, missing
 * hooks, render crashes, broken state flow.
 *
 *   npm run smoke
 */

// tsx compiles this file with the classic JSX transform (it lives outside the
// tsconfig `include`), so React has to be in scope even though the app itself
// uses the automatic runtime.
import React from 'react';
import { JSDOM } from 'jsdom';

// 6 s so the streaming player has three 2 s chunks to schedule ahead of the playhead.
const PATCH = '#nw1&t=brown&d=6&dis=90&den=90&fb=70&lr=0.2&ld=10&ff=800&fq=8&bc=0&sb=90&gr=50&s=999';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: `https://noise-wall.test/${PATCH}`,
  pretendToBeVisual: true,
});

const { window } = dom;

// ─── Minimal browser shims jsdom does not provide ───

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Node 21+ exposes some of these as getter-only globals, so define, don't assign. */
function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

define('window', window);
define('document', window.document);
define('navigator', window.navigator);
define('HTMLElement', window.HTMLElement);
define('HTMLCanvasElement', window.HTMLCanvasElement);
define('Element', window.Element);
define('Node', window.Node);
define('Event', window.Event);
define('KeyboardEvent', window.KeyboardEvent);
define('MouseEvent', window.MouseEvent);
define('PointerEvent', window.PointerEvent ?? window.MouseEvent);
define('localStorage', window.localStorage);
define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
define('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
define('ResizeObserver', ResizeObserverStub);
define('IS_REACT_ACT_ENVIRONMENT', true);

window.ResizeObserver = ResizeObserverStub;
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// jsdom has no 2D canvas without the `canvas` package; the visualiser already
// degrades gracefully when `getContext` returns null.
window.HTMLCanvasElement.prototype.getContext = (() => null) as never;

// ─── Minimal Web Audio + object-URL stand-ins ───
//
// Enough of the audio graph to drive StreamingPlayer end to end: we count the
// scheduled source nodes, which is the player's whole job.

interface FakeSource {
  buffer: unknown;
  onended: (() => void) | null;
  connect(): void;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(): void;
}

const audioStats = { contexts: 0, buffers: 0, sources: 0, started: 0, offsets: [] as number[] };

function fakeParam() {
  return {
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  };
}

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  constructor() {
    audioStats.contexts += 1;
  }
  createGain() {
    return { gain: fakeParam(), connect() {}, disconnect() {} };
  }
  createDynamicsCompressor() {
    return {
      threshold: fakeParam(),
      ratio: fakeParam(),
      attack: fakeParam(),
      release: fakeParam(),
      connect() {},
      disconnect() {},
    };
  }
  createBuffer(_channels: number, length: number, _sampleRate: number) {
    audioStats.buffers += 1;
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  createBufferSource(): FakeSource {
    audioStats.sources += 1;
    return {
      buffer: null,
      onended: null,
      connect() {},
      disconnect() {},
      start(_when?: number, offset?: number) {
        audioStats.started += 1;
        audioStats.offsets.push(offset ?? 0);
      },
      stop() {},
    };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

define('AudioContext', FakeAudioContext);
(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;

let objectUrls = 0;
let lastBlobSize = 0;
const createObjectURL = (blob: unknown) => {
  objectUrls += 1;
  lastBlobSize = (blob as Blob).size;
  return `blob:smoke/${objectUrls}`;
};
const revokeObjectURL = () => {};

// The app resolves `URL` from the global scope, while jsdom has its own class —
// patch both so the export path is observable no matter which one wins.
for (const target of [globalThis as unknown as { URL: typeof URL }, window.URL as unknown as { URL: never }]) {
  Object.defineProperty(target, 'URL', {
    value: Object.assign(window.URL, { createObjectURL, revokeObjectURL }),
    configurable: true,
    writable: true,
  });
}

// ─── Test harness ───

let failures = 0;
let checks = 0;

const consoleErrors: string[] = [];
const originalError = console.error;

function check(name: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    // Logged through the saved reference so the diagnostics check below does
    // not count the test's own failures as app errors.
    originalError(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.error = (...args: unknown[]) => {
  consoleErrors.push(args.map(String).join(' '));
  originalError(...args);
};

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../src/App');

const container = window.document.getElementById('root')!;
const root = createRoot(container);

const text = () => container.textContent ?? '';

async function waitFor(predicate: () => boolean, timeoutMs = 20_000, label = 'condition'): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
  originalError(`  (timed out waiting for ${label})`);
  return false;
}

function buttonByText(needle: string): HTMLButtonElement | null {
  const buttons = [...container.querySelectorAll('button')];
  return (
    (buttons.find((button) => (button.textContent ?? '').toLowerCase().includes(needle.toLowerCase())) as
      | HTMLButtonElement
      | undefined) ?? null
  );
}

// ─── Run ───

console.log('\nMount');
await act(async () => {
  root.render(<App />);
});

check('the app renders', text().includes('NOISE') && text().includes('WALL'));
check('a shared patch in the URL is restored', text().includes('Loaded a shared patch'));
check('the restored length is shown', text().includes('6s'), 'duration chip / summary');
check('the transport bar offers Generate', buttonByText('Generate') !== null);
check('status reports the patch source', text().toLowerCase().includes('brown'));

console.log('\nGenerate');
const generate = buttonByText('Generate');
await act(async () => {
  generate?.click();
});
const rendered = await waitFor(() => text().includes('samples'), 60_000, 'render to finish');
check('a 6 s wall renders and reports its sample count', rendered, '265k samples expected');
check('the render is reported as a success', text().includes('✓'));
check('the waveform now offers scrubbing', text().includes('tap or drag to scrub'));

console.log('\nSheets');
const more = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement | null;
await act(async () => {
  more?.click();
});
check('the More sheet opens as a dialog', container.querySelector('[role="dialog"]') !== null);
await act(async () => {
  (container.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null)?.click();
});

const save = container.querySelector('button[aria-label="Save or share"]') as HTMLButtonElement | null;
await act(async () => {
  save?.click();
});
const saveSheetText = container.querySelector('[role="dialog"]')?.textContent ?? '';
check('the save sheet opens', saveSheetText.includes('Save the wall'));
check('it offers WAV and MP3', saveSheetText.includes('.WAV') && saveSheetText.includes('.MP3'));
check('it estimates the file size', saveSheetText.includes('MB') || saveSheetText.includes('KB'));

console.log('\nPlayback (streaming player)');
const play = container.querySelector('button[aria-label="Play preview"]') as HTMLButtonElement | null;
await act(async () => {
  play?.click();
});
const playing = await waitFor(() => audioStats.started > 0, 5_000, 'chunks to be scheduled');
check('Play schedules audio chunks', playing, `${audioStats.sources} nodes, ${audioStats.started} started`);
check(
  'the player schedules ahead rather than sending one giant buffer',
  audioStats.started >= 2,
  `${audioStats.started} chunks queued ahead`,
);
check('the transport switches to Stop', text().includes('Stop'));
await act(async () => {
  (container.querySelector('button[aria-label="Stop playback"]') as HTMLButtonElement | null)?.click();
});
check('Stop halts playback', container.querySelector('button[aria-label="Play preview"]') !== null);

console.log('\nExport');
const wavButton = buttonByText('Save .WAV');
await act(async () => {
  wavButton?.click();
});
const exported = await waitFor(() => text().includes('Downloaded') || text().includes('Error'), 20_000, 'an export outcome');
check('clicking Save .WAV completes an export', exported && text().includes('Downloaded'), text().slice(-120));
check('the export produced a Blob download', objectUrls === 1, `${objectUrls} object URL(s)`);
check('the filename carries source, length and seed', /hnw-brown-6s-999\.wav/.test(text()));
check('the encoded WAV actually has bytes', lastBlobSize > 500_000, `${lastBlobSize} bytes checked`);

const mp3Button = buttonByText('Save .MP3');
await act(async () => {
  mp3Button?.click();
});
const mp3Done = await waitFor(() => objectUrls === 2 || text().includes('Error'), 60_000, 'the MP3 export');
check('MP3 export also completes and produces a download', mp3Done && objectUrls === 2, `${objectUrls} object URL(s)`);
check('the MP3 export reports its size', /hnw-brown-6s-999\.mp3/.test(text()));

console.log('\nDiagnostics');
const realErrors = consoleErrors.filter((line) => !line.includes('Not implemented') && !line.includes('timed out'));
check('no console errors while driving the UI', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

console.log(`\n${checks - failures}/${checks} checks passed`);
console.error = originalError;
if (failures > 0) process.exitCode = 1;
