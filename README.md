# NOISE WALL

An interactive, browser-based harsh noise wall generator built with React, TypeScript, Vite, and the Web Audio API.

NOISE WALL generates dense, reproducible noise textures entirely in the browser. Choose a noise source, shape it with distortion, feedback, filtering, modulation, bit reduction, sub-bass, and grit controls, then preview the result or export it as WAV or MP3.

> **Volume warning:** Harsh noise contains extreme and sustained frequency content. Lower your system volume before playback, especially when using headphones.

## Features

- Seven noise sources: white, pink, brown, grey, crackling, digital, and saturated
- Adjustable duration from 2 seconds to 10 minutes
- Distortion, density, feedback, grit, filtering, resonance, LFO, bitcrush, and sub-bass controls
- Seeded random generation for repeatable results
- Eight built-in presets, including Classic HNW, Deep Rumble, Bit Rot, and Total Wall
- Waveform visualization with playback progress
- In-browser audio preview with volume control
- Mono 44.1 kHz audio generation
- 16-bit WAV export
- MP3 export at 128, 192, 256, or 320 kbps
- Single-file production build for easy hosting or offline use
- No server-side audio processing or uploads

## Getting Started

### Requirements

- Node.js 20 or newer recommended
- npm
- A modern browser with Web Audio API support

### Install

```bash
git clone <your-repository-url>
cd interactive-harsh-noise-generator
npm install
```

### Run locally

```bash
npm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

## Usage

1. Select a noise source.
2. Set the duration.
3. Adjust the synthesis and texture controls, or load a preset.
4. Enter a seed or click **Random**.
5. Click **Generate Noise Wall**.
6. Preview the waveform at a low volume.
7. Export the result as WAV or MP3.

Using the same parameters and seed will reproduce the same generated wall.

## Controls

| Control | Effect |
| --- | --- |
| Noise Source | Selects the underlying noise-generation algorithm. |
| Distortion | Adds multi-stage saturation, clipping, and fold-back distortion. |
| Density | Controls the thickness of layered noise. |
| Feedback | Adds self-reinforcing saturation and density. |
| Grit | Introduces additional rough static texture. |
| Filter Cutoff | Sets the tonal cutoff frequency. |
| Resonance | Emphasizes frequencies near the filter cutoff. |
| LFO Rate | Sets the speed of slow amplitude modulation. |
| LFO Depth | Sets the intensity of modulation. |
| Bitcrush | Reduces bit depth and effective sample rate. |
| Sub Bass | Adds low-frequency rumble. |
| Seed | Makes random generation deterministic and repeatable. |

## Available Scripts

```bash
npm run dev      # Start the development server
npm run build    # Create a production build in dist/
npm run preview  # Preview the production build locally
```

The production build is bundled into a single `dist/index.html` file by `vite-plugin-singlefile`.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Web Audio API
- lamejs for MP3 encoding
- Canvas API for waveform rendering

## Project Structure

```text
.
├── index.html
├── package.json
├── src
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── types
│   │   └── lamejs.d.ts
│   └── utils
│       ├── audioEncoder.ts
│       ├── cn.ts
│       └── noiseSynth.ts
├── tsconfig.json
└── vite.config.ts
```

## Audio Architecture

The synthesis engine generates a mono `Float32Array` at 44.1 kHz. It combines seeded procedural noise with a custom DSP chain that includes filtering, layered density, feedback saturation, waveshaping, modulation, bit reduction, low-frequency reinforcement, normalization, and dynamics control.

Audio is created locally in the browser. WAV files are encoded directly as 16-bit PCM, while MP3 files are encoded with `lamejs`.

## Deployment

Run:

```bash
npm run build
```

Then deploy `dist/index.html` to any static host, including GitHub Pages, Netlify, Vercel, Cloudflare Pages, or an ordinary web server.

Because the build is self-contained, the generated HTML file can also be opened locally in many modern browsers.

## Contributing

Contributions, bug reports, preset ideas, and DSP experiments are welcome. Open an issue or submit a pull request with a clear description of the proposed change.

## License

No license has been specified yet. Add a `LICENSE` file before allowing reuse or redistribution of the source code.
