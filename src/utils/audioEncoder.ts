import { Mp3Encoder } from 'lamejs';
import { SAMPLE_RATE } from './noiseSynth';

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
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// MP3 Encoder: converts Float32Array to MP3 ArrayBuffer using lamejs
export function encodeMP3(samples: Float32Array, kbps: number = 192): ArrayBuffer {
  const channels = 1;
  const sampleRate = SAMPLE_RATE;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  // Convert Float32 to Int16
  const int16Buffer = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
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
