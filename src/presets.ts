// Factory presets for NOISE WALL.
//
// Presets define the *sound* (source + all DSP parameters + seed). Their
// `duration` field is the length the preset was tuned at; it is informational
// only — applying a preset always keeps the length the user currently has, so
// presets work unchanged at any duration (2 s – 10 min).
//
// Adding a preset is the lowest-friction way to contribute: append an entry to
// `PRESETS` and nothing else needs to change.

import type { NoiseParams } from './utils/noiseSynth';

export interface Preset {
  name: string;
  icon: string;
  desc: string;
  params: NoiseParams;
}

export const PRESETS: Preset[] = [
  {
    name: 'Classic HNW',
    icon: '🧱',
    desc: 'Dense white noise wall, Merzbow-style',
    params: {
      duration: 30,
      noiseType: 'white',
      distortionAmount: 85,
      density: 90,
      feedback: 65,
      lfoRate: 0.2,
      lfoDepth: 15,
      filterFreq: 4000,
      filterQ: 3,
      bitcrush: 8,
      subBass: 45,
      grit: 75,
      seed: 42,
    },
  },
  {
    name: 'Static Crush',
    icon: '📺',
    desc: 'TV static through broken amp',
    params: {
      duration: 20,
      noiseType: 'digital',
      distortionAmount: 90,
      density: 80,
      feedback: 70,
      lfoRate: 0.5,
      lfoDepth: 25,
      filterFreq: 5000,
      filterQ: 5,
      bitcrush: 35,
      subBass: 30,
      grit: 85,
      seed: 137,
    },
  },
  {
    name: 'Deep Rumble',
    icon: '🕳️',
    desc: 'Low-frequency grinding wall',
    params: {
      duration: 30,
      noiseType: 'brown',
      distortionAmount: 75,
      density: 95,
      feedback: 80,
      lfoRate: 0.1,
      lfoDepth: 40,
      filterFreq: 800,
      filterQ: 8,
      bitcrush: 0,
      subBass: 90,
      grit: 50,
      seed: 999,
    },
  },
  {
    name: 'Concrete Mixer',
    icon: '🏗️',
    desc: 'Thick mid-range industrial grind',
    params: {
      duration: 20,
      noiseType: 'saturated',
      distortionAmount: 92,
      density: 100,
      feedback: 55,
      lfoRate: 0.3,
      lfoDepth: 10,
      filterFreq: 2500,
      filterQ: 4,
      bitcrush: 12,
      subBass: 60,
      grit: 90,
      seed: 666,
    },
  },
  {
    name: 'Warm Hiss',
    icon: '🔥',
    desc: 'Pink noise driven into saturation',
    params: {
      duration: 30,
      noiseType: 'pink',
      distortionAmount: 70,
      density: 85,
      feedback: 50,
      lfoRate: 0.4,
      lfoDepth: 30,
      filterFreq: 3500,
      filterQ: 2,
      bitcrush: 5,
      subBass: 55,
      grit: 60,
      seed: 777,
    },
  },
  {
    name: 'Bit Rot',
    icon: '👾',
    desc: 'Heavily crushed digital decay',
    params: {
      duration: 15,
      noiseType: 'grey',
      distortionAmount: 80,
      density: 75,
      feedback: 45,
      lfoRate: 1.5,
      lfoDepth: 50,
      filterFreq: 3000,
      filterQ: 6,
      bitcrush: 65,
      subBass: 25,
      grit: 80,
      seed: 404,
    },
  },
  {
    name: 'Crackle Storm',
    icon: '⚡',
    desc: 'Bursting crackle through distortion',
    params: {
      duration: 20,
      noiseType: 'crackling',
      distortionAmount: 88,
      density: 70,
      feedback: 75,
      lfoRate: 0.7,
      lfoDepth: 35,
      filterFreq: 4500,
      filterQ: 3,
      bitcrush: 20,
      subBass: 40,
      grit: 70,
      seed: 321,
    },
  },
  {
    name: 'Total Wall',
    icon: '☢️',
    desc: 'Maximum density, maximum everything',
    params: {
      duration: 30,
      noiseType: 'saturated',
      distortionAmount: 100,
      density: 100,
      feedback: 85,
      lfoRate: 0.15,
      lfoDepth: 8,
      filterFreq: 6000,
      filterQ: 2,
      bitcrush: 25,
      subBass: 80,
      grit: 100,
      seed: 0,
    },
  },
];
