/**
 * Deterministic headless verification for the NOISE WALL engine and encoders.
 *
 * Runs in plain Node (`npm run verify`) — no browser, no test framework. It
 * asserts the invariants the README promises:
 *
 *   1. Same seed + params ⇒ bit-identical render, on both driver paths
 *      (sync `generateNoiseWall` and cooperative `generateNoiseWallAsync`).
 *   2. Output is always finite and within [−1, 1] after normalization.
 *   3. Parameter changes actually change the render (the slider isn't lying).
 *   4. WAV and MP3 exports are byte-identical whether they are produced in one
 *      shot or streamed slice-by-slice through a `ByteSink` — that is what
 *      makes the streaming/mobile export path safe.
 *   5. WAV headers are structurally valid (RIFF/WAVE/fmt/data sizes).
 *   6. The waveform preview matches the render's envelope.
 */

import {
  DEFAULT_PARAMS,
  buildWaveformPreview,
  generateNoiseWall,
  generateNoiseWallAsync,
  type NoiseParams,
} from '../src/utils/noiseSynth';
import {
  BlobSink,
  buildWavHeader,
  encodeMP3,
  encodeMP3Async,
  encodeWAV,
  encodeWAVAsync,
  writeMP3Async,
  writeWAVAsync,
} from '../src/utils/audioEncoder';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function equalSamples(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main(): Promise<void> {
  const params: NoiseParams = { ...DEFAULT_PARAMS, duration: 3, seed: 123456 };

  console.log('\nDeterminism');
  const first = generateNoiseWall(params);
  const second = generateNoiseWall(params);
  check('sync render is reproducible', equalSamples(first, second), `${first.length} samples`);

  const asyncRender = await generateNoiseWallAsync(params);
  check('async render matches sync render bit-for-bit', equalSamples(first, asyncRender));

  const otherSeed = generateNoiseWall({ ...params, seed: params.seed + 1 });
  check('a different seed produces a different wall', !equalSamples(first, otherSeed));

  console.log('\nSignal hygiene');
  let peak = 0;
  let finite = true;
  for (let i = 0; i < first.length; i++) {
    const value = first[i];
    if (!Number.isFinite(value)) finite = false;
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
  }
  check('no NaN/Infinity samples', finite);
  check('peak within [−1, 1]', peak <= 1, `peak ${peak.toFixed(4)}`);
  check('wall is actually loud (peak > 0.5)', peak > 0.5);

  console.log('\nWAV export');
  const wavSync = new Uint8Array(encodeWAV(first));
  const wavAsync = new Uint8Array(await encodeWAVAsync(first));
  check('sync and async WAV are byte-identical', equalBytes(wavSync, wavAsync), `${wavSync.length} bytes`);

  const wavSink = new BlobSink('audio/wav');
  await writeWAVAsync(first, wavSink);
  const wavStreamed = new Uint8Array(await wavSink.blob().arrayBuffer());
  check('streamed WAV matches the in-memory encoder', equalBytes(wavSync, wavStreamed));

  const header = buildWavHeader(first.length * 2);
  const view = new DataView(header.buffer);
  const fourcc = (offset: number) =>
    String.fromCharCode(header[offset], header[offset + 1], header[offset + 2], header[offset + 3]);
  check('header is RIFF/WAVE/fmt/data', fourcc(0) === 'RIFF' && fourcc(8) === 'WAVE' && fourcc(12) === 'fmt ' && fourcc(36) === 'data');
  check('header sizes are consistent', view.getUint32(4, true) === 36 + first.length * 2 && view.getUint32(40, true) === first.length * 2);
  check('header is 44 bytes, mono, 44.1 kHz, 16-bit', header.length === 44 && view.getUint16(22, true) === 1 && view.getUint32(24, true) === 44100 && view.getUint16(34, true) === 16);

  console.log('\nMP3 export');
  const mp3Sync = new Uint8Array(encodeMP3(first, 192));
  const mp3Async = new Uint8Array(await encodeMP3Async(first, 192));
  check('sync and async MP3 are byte-identical', equalBytes(mp3Sync, mp3Async), `${mp3Sync.length} bytes`);

  const mp3Sink = new BlobSink('audio/mpeg');
  await writeMP3Async(first, 192, mp3Sink);
  const mp3Streamed = new Uint8Array(await mp3Sink.blob().arrayBuffer());
  check('streamed MP3 matches the in-memory encoder', equalBytes(mp3Sync, mp3Streamed));

  // Parse the first frame header: MPEG-1, Layer III, 192 kbps, mono.
  const bitrateBit = (mp3Sync[2] >> 4) & 0x0f;
  const channelMode = (mp3Sync[3] >> 6) & 0x03;
  const sampleRateBits = (mp3Sync[2] >> 2) & 0x03;
  const expectedBytes = (192 * 1000 * params.duration) / 8;
  const actualKbps = Math.round((mp3Sync.length * 8) / params.duration / 1000);
  check('MP3 frame header is a valid sync word', mp3Sync[0] === 0xff && (mp3Sync[1] & 0xe0) === 0xe0);
  check(
    'MPEG-1 Layer III, 44.1 kHz, mono',
    ((mp3Sync[1] >> 3) & 0x03) === 3 && ((mp3Sync[1] >> 1) & 0x03) === 1 && sampleRateBits === 0 && channelMode === 3,
  );
  check('192 kbps bitrate index', bitrateBit === 11, `index ${bitrateBit}`);
  check(
    'stream size matches 192 kbps',
    Math.abs(mp3Sync.length - expectedBytes) < expectedBytes * 0.25,
    `${mp3Sync.length} bytes ≈ ${actualKbps} kbps`,
  );

  console.log('\nWaveform preview');
  const preview = await buildWaveformPreview(first, 200);
  check('preview has one column per requested pixel', preview.min.length === 200 && preview.max.length === 200);
  let previewPeak = 0;
  for (let i = 0; i < preview.max.length; i++) previewPeak = Math.max(previewPeak, Math.abs(preview.max[i]), Math.abs(preview.min[i]));
  check('preview envelope tracks the render', Math.abs(previewPeak - peak) < 1e-6, `preview peak ${previewPeak.toFixed(4)}`);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main();
