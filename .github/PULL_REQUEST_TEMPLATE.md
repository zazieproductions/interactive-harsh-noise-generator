# Pull Request

Thank you for contributing to NOISE WALL. Replace the placeholders below and delete any
sections that don't apply.

Closes #<!-- issue number, if any -->

## Summary

<!-- One-paragraph description of what this PR changes and why. -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that changes existing behavior)
- [ ] 🎛️ Preset addition or preset tuning
- [ ] 🔊 DSP change (noise type, effect stage, coefficient tuning)
- [ ] 🎨 UI / UX / styling
- [ ] ♿ Accessibility improvement
- [ ] ⚡ Performance improvement
- [ ] 📚 Documentation
- [ ] 🔧 Tooling / build / CI
- [ ] 🧪 Test

## How It Was Tested

- [ ] `npm run build` passes with no errors or warnings
- [ ] Manual: generated a wall with each factory preset and played it back
- [ ] Manual: tested WAV export
- [ ] Manual: tested MP3 export at 192 kbps
- [ ] Manual: keyboard-tabbed through all controls
- [ ] Added/updated automated tests (if applicable — describe):

## Browser/Device Verification

<!-- Check at least one. List OS + browser + version. -->

- [ ] Chrome (desktop) — version:
- [ ] Firefox (desktop) — version:
- [ ] Safari (macOS) — version:
- [ ] Mobile Safari / Chrome — device:

## Screenshots / Audio Clips (if relevant)

<!-- UI changes benefit from before/after screenshots. DSP changes benefit from short audio
     clips or spectrograms. You can drag-and-drop images and mp3s directly into this PR. -->

## DSP Changes Only — Determinism Check

<!-- If you touched noiseSynth.ts, confirm the following: -->

- [ ] The engine still returns bit-identical results for the same seed+params across back-to-back calls
- [ ] `Math.random()` is not used anywhere inside the DSP chain (only the threaded `rng()`)
- [ ] Coefficients are clamped to stable ranges (no NaN/∞ risk)
- [ ] All 8 factory presets still sound like their described character

## Documentation

- [ ] README updated (if user-visible behavior changed)
- [ ] `docs/` updated (DSP-PIPELINE, API, PERFORMANCE, ACCESSIBILITY as applicable)
- [ ] CHANGELOG entry added under the Unreleased section

## Notes for Reviewers

<!-- Anything reviewers should know: architectural decisions, trade-offs, known follow-ups. -->
