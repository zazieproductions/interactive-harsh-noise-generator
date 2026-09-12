import { Mp3Encoder } from 'lamejs';
import { SAMPLE_RATE } from './noiseSynth';

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

// WAV Encoder: converts Float32Array to WAV ArrayBuffer
export function encodeWAV(samples: Float32Array): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = SAMPLE_RATE;
  const bitDepth = 16;
  const dataLength = samples.length * (bitDepth / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);            // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);  // NumChannels
  view.setUint32(24, sampleRate, true);   // SampleRate
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitDepth / 8), true); // BlockAlign
  view.setUint16(34, bitDepth, true);     // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, toInt16(samples[i]), true);
    offset += 2;
  }

  return buffer;
}

/**
 * Async WAV encoder: byte-identical output to `encodeWAV`, but writes the
 * sample data in ~32 slices, yielding to the event loop between them and
 * reporting progress (0–1) so long exports don't freeze the UI.
 */
export async function encodeWAVAsync(
  samples: Float32Array,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  await nextTick();

  const numChannels = 1;
  const sampleRate = SAMPLE_RATE;
  const bitDepth = 16;
  const dataLength = samples.length * (bitDepth / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // WAV header (identical to the sync encoder)
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write samples in slices
  const slice = Math.max(1 << 18, Math.ceil(samples.length / 32));
  for (let start = 0; start < samples.length; start += slice) {
    const end = Math.min(samples.length, start + slice);
    for (let i = start; i < end; i++) {
      view.setInt16(44 + i * 2, toInt16(samples[i]), true);
    }
    onProgress?.(end / samples.length);
    await nextTick();
  }

  return buffer;
}

// MP3 Encoder: converts Float32Array to MP3 ArrayBuffer using lamejs
export function encodeMP3(samples: Float32Array, kbps: number = 192): ArrayBuffer {
  const channels = 1;
  const sampleRate = SAMPLE_RATE;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  // Convert Float32 to Int16
  const int16Buffer = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    int16Buffer[i] = toInt16(samples[i]);
  }

  const mp3Data: Uint8Array[] = [];
  const sampleBlockSize = 1152;

  for (let i = 0; i < int16Buffer.length; i += sampleBlockSize) {
    const chunk = int16Buffer.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  // Flush
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Data.push(flushBuf);
  }

  // Combine all chunks
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
 * sample blocks are fed to the same encoder instance in the same order), but
 * conversion + encoding happen in ~32 slices with event-loop yields and
 * progress callbacks (0–1) between them.
 */
export async function encodeMP3Async(
  samples: Float32Array,
  kbps: number = 192,
  onProgress?: (fraction: number) => void,
): Promise<ArrayBuffer> {
  await nextTick();

  const channels = 1;
  const sampleRate = SAMPLE_RATE;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const mp3Data: Uint8Array[] = [];
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
      const chunk = int16Buffer.subarray(i, i + sampleBlockSize);
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    onProgress?.(end / samples.length);
    await nextTick();
  }

  // Flush
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Data.push(flushBuf);
  }

  // Combine all chunks
  const totalLength = mp3Data.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of mp3Data) {
    result.set(buf, offset);
    offset += buf.length;
  }

  return result.buffer;
}

// Download helper
export function downloadBuffer(buffer: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
