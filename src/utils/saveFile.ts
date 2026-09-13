// Cross-platform "get this audio onto the device" plumbing.
//
// Three tiers, best first:
//   1. **File System Access API** (Chrome/Edge desktop + Android Chrome):
//      the user picks a destination and we stream encoded slices straight to
//      disk. Peak memory stays ~one slice.
//   2. **Web Share level 2** (iOS 16.4+, Android): hand the finished file to
//      the OS share sheet — "Save to Files", AirDrop, send to a DAW…
//   3. **`<a download>` with a Blob URL**: every remaining browser, including
//      iOS Safari, which drops the file into Files ▸ Downloads.

import {
  BlobSink,
  downloadBlob,
  writeMP3Async,
  writeWAVAsync,
  type ByteSink,
} from './audioEncoder';

export type SaveOutcome = 'saved' | 'shared' | 'downloaded' | 'cancelled';

export interface SaveOptions {
  /** Encoding progress, 0–1. */
  onProgress?: (fraction: number) => void;
  /** Prefer the OS share sheet over a direct download (blob path only). */
  preferShare?: boolean;
  title?: string;
}

interface FilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}

interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileHandleLike>;
}

function isUserCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** True when this browser can stream an export straight to disk. */
export function canStreamToDisk(): boolean {
  return typeof window !== 'undefined' && typeof (window as SaveFilePickerWindow).showSaveFilePicker === 'function';
}

/** True when this browser can share a real file through the OS share sheet. */
export function canShareFiles(filename: string, mimeType: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array([0])], filename, { type: mimeType })] });
  } catch {
    return false;
  }
}

interface SaveSpec {
  filename: string;
  mimeType: string;
  /** Human description used by the file picker. */
  description: string;
  producer: (sink: ByteSink) => Promise<void>;
  options?: SaveOptions;
}

async function save(spec: SaveSpec): Promise<SaveOutcome> {
  const { filename, mimeType, description, producer, options } = spec;
  const extension = filename.slice(filename.lastIndexOf('.'));

  // 1. Stream to disk when the browser supports it.
  const picker = typeof window !== 'undefined' ? (window as SaveFilePickerWindow).showSaveFilePicker : undefined;
  if (picker && !options?.preferShare) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description, accept: { [mimeType]: [extension] } }],
      });
      const writable = await handle.createWritable();
      try {
        await producer({
          write: async (bytes) => {
            await writable.write(bytes);
          },
        });
        await writable.close();
        return 'saved';
      } catch (error) {
        await writable.abort?.().catch(() => {});
        throw error;
      }
    } catch (error) {
      if (isUserCancel(error)) return 'cancelled';
      // Otherwise: fall through to the in-memory path.
    }
  }

  // 2./3. Encode into a Blob, then share or download it.
  const sink = new BlobSink(mimeType);
  await producer(sink);
  const blob = sink.blob();

  if (options?.preferShare && canShareFiles(filename, mimeType)) {
    try {
      await navigator.share({
        files: [new File([blob], filename, { type: mimeType })],
        title: options.title ?? filename,
      });
      return 'shared';
    } catch (error) {
      if (isUserCancel(error)) return 'cancelled';
      // Not shareable after all (permissions, size) — download instead.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

/** Saves a 16-bit PCM WAV of `samples`. */
export function saveWAV(samples: Float32Array, filename: string, options?: SaveOptions): Promise<SaveOutcome> {
  return save({
    filename,
    mimeType: 'audio/wav',
    description: 'WAV audio',
    producer: (sink) => writeWAVAsync(samples, sink, options?.onProgress),
    options,
  });
}

/** Saves an MP3 of `samples` at `kbps`. */
export function saveMP3(
  samples: Float32Array,
  kbps: number,
  filename: string,
  options?: SaveOptions,
): Promise<SaveOutcome> {
  return save({
    filename,
    mimeType: 'audio/mpeg',
    description: 'MP3 audio',
    producer: (sink) => writeMP3Async(samples, kbps, sink, options?.onProgress),
    options,
  });
}

/**
 * Copies text to the clipboard. Falls back to a hidden textarea + `execCommand`
 * because `navigator.clipboard` is unavailable on insecure origins and in some
 * older mobile Safari versions.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Shares (or copies) a patch link — the "open this on my phone" button. */
export async function shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: 'NOISE WALL patch', url });
      return 'shared';
    } catch (error) {
      if (isUserCancel(error)) return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
