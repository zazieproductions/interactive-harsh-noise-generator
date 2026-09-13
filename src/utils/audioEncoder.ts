import { Mp3Encoder } from '@breezystack/lamejs';
import { SAMPLE_RATE } from './noiseSynth';

// ─── Sinks ───
//
// Every encoder can either build a whole file in memory (the v1.0 API, kept
// for compatibility) or stream itself into a `ByteSink` in ~512 KB slices.
// The streaming path is what the UI uses: on mobile it keeps the peak
// allocation flat instead of materialising a second copy of the render, and
// on Chromium it can write straight to disk via the File System Access API.

/** Anything that can accept encoded bytes in order. */
export interface ByteSink {
  write(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
}

/** Collects encoded bytes into a `Blob` (no giant contiguous `ArrayBuffer`). */
export class BlobSink implements ByteSink {
  private readonly parts: BlobPart[] = [];
  private readonly mimeType: string;

  constructor(mimeType: string) {
    this.mimeType = mimeType;
  }

  async write(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    this.parts.push(bytes);
  }

  blob(): Blob {
    return new Blob(this.parts, { type: this.mimeType });
  }
}

// ─── Shared helpers ───

/** Yield to the event loop so the UI can paint between encoding slices. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function toInt16(s: number): number {
  const clamped = Math.max(-1, Math.min(1, s));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitDepth: 16 | 8 | 24 | 32;
}

const DEFAULT_FORMAT: WavFormat = { sampleRate: SAMPLE_RATE, channels: 1, bitDepth: 16 };

/** Canonical 44-byte RIFF/WAVE `fmt `/`data` header for PCM. */
export function buildWavHeader(dataLength: number, format: WavFormat = DEFAULT_FORMAT): Uint8Array<ArrayBuffer> {
  const { sampleRate, channels, bitDepth } = format;
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true); // ByteRate
  view.setUint16(32, channels * (bitDepth / 8), true); // BlockAlign
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  return bytes;
}

// ─── WAV ───

/** WAV Encoder: converts Float32Array to WAV ArrayBuffer (whole file in RAM). */
export function encodeWAV(samples: Float32Array): ArrayBuffer {
  const format = DEFAULT_FORMAT;
  const dataLength = samples.length * (format.bitDepth / 8);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(buildWavHeader(dataLength, format));

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, toInt16(samples[i]), true);
    offset += 2;
  }

  return buffer;
}

/**
 * Async WAV encoder: byte-identical output to `encodeWAV`, but writes the
 * sample data in ~512 KB slices, yielding to the event loop between them and
 * reporting progress (0–1) so long exports never freeze the UI.
 */
export async function encodeWAVAsync(
  samples: Float32Array,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  const sink = new BlobSink('audio/wav');
  await writeWAVAsync(samples, sink, onProgress);
  return sink.blob().arrayBuffer();
}

/** Streams a 16-bit PCM WAV into `sink`, slice by slice. */
export async function writeWAVAsync(
  samples: Float32Array,
  sink: ByteSink,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  await nextTick();

  const format = DEFAULT_FORMAT;
  const dataLength = samples.length * (format.bitDepth / 8);
  await sink.write(buildWavHeader(dataLength, format));

  const slice = Math.max(1 << 18, Math.ceil(samples.length / 32));
  for (let start = 0; start < samples.length; start += slice) {
    const end = Math.min(samples.length, start + slice);
    const bytes = new Uint8Array((end - start) * 2);
    const view = new DataView(bytes.buffer);
    for (let i = start; i < end; i++) {
      view.setInt16((i - start) * 2, toInt16(samples[i]), true);
    }
    await sink.write(bytes);
    onProgress?.(end / samples.length);
    await nextTick();
  }
  onProgress?.(1);
}

/** WAV as a `Blob` built from parts — avoids a second full-size allocation. */
export async function encodeWAVBlobAsync(
  samples: Float32Array,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const sink = new BlobSink('audio/wav');
  await writeWAVAsync(samples, sink, onProgress);
  return sink.blob();
}

// ─── MP3 ───

/**
 * Re-views one lamejs output block as `Uint8Array`. No copy: the block is
 * freshly allocated by `encodeBuffer`/`flush` (verified — never a view over a
 * reused internal buffer), so it is safe to hand straight to a sink.
 */
function mp3ChunkBytes(chunk: Uint8Array | Int8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(chunk.buffer as ArrayBuffer, chunk.byteOffset, chunk.length);
}

/** MP3 Encoder: converts Float32Array to MP3 ArrayBuffer using lamejs. */
export function encodeMP3(samples: Float32Array, kbps: number = 192): ArrayBuffer {
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, kbps);
  const int16Buffer = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    int16Buffer[i] = toInt16(samples[i]);
  }

  const mp3Data: Uint8Array[] = [];
  const sampleBlockSize = 1152;
  for (let i = 0; i < int16Buffer.length; i += sampleBlockSize) {
    const chunk = int16Buffer.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) mp3Data.push(mp3ChunkBytes(mp3buf));
  }
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) mp3Data.push(mp3ChunkBytes(flushBuf));

  const totalLength = mp3Data.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of mp3Data) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result.buffer;
}

/**
 * Async MP3 encoder: byte-identical output to `encodeMP3` (the same 1152-
 * sample blocks reach the same encoder instance in the same order), but
 * conversion + encoding happen in slices with event-loop yields and progress
 * callbacks (0–1) between them.
 */
export async function encodeMP3Async(
  samples: Float32Array,
  kbps: number = 192,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  const sink = new BlobSink('audio/mpeg');
  await writeMP3Async(samples, kbps, sink, onProgress);
  return sink.blob().arrayBuffer();
}

/**
 * Streams MP3 frames into `sink` as they are produced. On a device that
 * supports the File System Access API this means a 10-minute MP3 export needs
 * roughly one slice of RAM, not one file's worth.
 */
export async function writeMP3Async(
  samples: Float32Array,
  kbps: number,
  sink: ByteSink,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  await nextTick();

  const encoder = new Mp3Encoder(1, SAMPLE_RATE, kbps);
  const sampleBlockSize = 1152;
  const slice = Math.max(
    sampleBlockSize * 16,
    Math.ceil(samples.length / 32 / sampleBlockSize) * sampleBlockSize,
  );

  for (let start = 0; start < samples.length; start += slice) {
    const end = Math.min(samples.length, start + slice);
    const int16Buffer = new Int16Array(end - start);
    for (let i = start; i < end; i++) {
      int16Buffer[i - start] = toInt16(samples[i]);
    }
    for (let i = 0; i < int16Buffer.length; i += sampleBlockSize) {
      const block = int16Buffer.subarray(i, i + sampleBlockSize);
      // lamejs returns a fresh copy per call, so it is safe to hand onward.
      const mp3buf = encoder.encodeBuffer(block);
      if (mp3buf.length > 0) await sink.write(mp3ChunkBytes(mp3buf));
    }
    onProgress?.(end / samples.length);
    await nextTick();
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) await sink.write(mp3ChunkBytes(flushBuf));
  onProgress?.(1);
}

/** MP3 as a `Blob` built from the frames lamejs emits. */
export async function encodeMP3BlobAsync(
  samples: Float32Array,
  kbps: number = 192,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const sink = new BlobSink('audio/mpeg');
  await writeMP3Async(samples, kbps, sink, onProgress);
  return sink.blob();
}

// ─── Download helper ───

/** Triggers a browser download for an in-memory buffer (v1.0 API). */
export function downloadBuffer(buffer: ArrayBuffer, filename: string, mimeType: string): void {
  downloadBlob(new Blob([buffer], { type: mimeType }), filename);
}

/** Triggers a browser download for a `Blob`, revoking the URL immediately. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari needs the URL to survive the click's default action.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
