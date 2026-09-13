# Accessibility

NOISE WALL treats accessibility as a first-class requirement, not a post-launch polish item.
This document records what is implemented, what has been audited, and what remains open.

The project targets **WCAG 2.1 AA** as the baseline conformance level.

---

## At-a-Glance Status

| Concern | Status | Notes |
|---------|:------:|-------|
| Keyboard navigation | ✅ Implemented | All controls are native inputs, reachable via Tab/Shift+Tab, with visible `focus-visible` rings |
| Keyboard shortcuts | ✅ Implemented | `Space` play/stop, `G` generate, `R` new seed; suppressed inside inputs and open dialogs |
| Screen reader support (NVDA / VoiceOver) | ✅ Implemented | Every slider/button has an accessible name; the transport status is an `aria-live="polite"` region; sheets are focus-managed `role="dialog"` elements. Hardware screen-reader testing is still on the list (see Gaps). |
| Color contrast | ✅ AA | All body/label text verified against the dark theme palette |
| Color-only information | ✅ Pass | Never convey information by color alone (values are shown numerically; state shows icons + text) |
| Motion / reduced motion | ✅ Pass | Decorative animation is gated with `motion-reduce:` variants; the progress rail is a width transition only |
| Text scaling | ✅ Pass | Layout uses relative units; scales cleanly to 200% |
| Responsive reflow | ✅ Pass | Grid collapses to one column; control groups collapse on phones and expand at `lg`+ |
| Target size | ✅ AAA | All interactive controls ≥ 44×44 CSS pixels (sliders have a 44 px hit area) |
| Drag alternatives | ✅ Pass | The waveform scrub has an arrow-key equivalent (`Shift`+arrow = 10% jumps) |
| Autoplay protection | ✅ Pass | Audio never starts without a click; a compressor and volume default of 0.5 protect users |
| Hearing safety | ✅ Pass | Prominent volume warning; compressor on preview; default volume 50% |
| Visible status/error text | ✅ Pass | Status messages are plain text, not color-only |
| Haptics | ✅ Pass | Vibrations are always paired with a visible state change, never the only feedback |

---

## Implemented Accessibility Features

### Native inputs

All sliders, buttons, the seed input, and the MP3 bitrate select are **native HTML controls**
(`<input type="range">`, `<button>`, `<input type="number">`, `<select>`). This is the single
most impactful accessibility decision in the app:

- Keyboard users get arrow-key adjustment on sliders out of the box.
- Screen readers announce them automatically (name/role/value).
- Mobile screen readers (VoiceOver on iOS, TalkBack on Android) activate them with platform
  gestures.
- Form validation and focus management are handled by the browser.

We deliberately avoid custom-div slider implementations; the performance and aesthetic cost of
using native inputs is negligible compared to the accessibility dividend.

### Color & contrast

The palette is constrained and high-contrast by construction:

| Foreground | Background | Minimum contrast |
|------------|-----------:|:-----------------:|
| `text-gray-100` (#f3f4f6) on `bg-[#08080e]` | ~16:1 | AAA |
| `text-gray-300` on dark panels | ~10:1 | AAA |
| `text-gray-400` labels on dark panels | ~7:1 | AAA |
| `text-red-400` readouts on dark red chips | ~5:1 | AA |
| `text-red-500/70` (Random link) | ~4.6:1 | AA |

All readouts use `tabular-nums` so digits don't jitter as values change, which matters for users
with cognitive disabilities and anyone relying on screen magnification.

### Status messages

The status line (e.g. "✓ 30s of white noise wall (1323k samples)") is plain rendered text inside
the main content flow. It is announced when it changes (screen readers treat DOM mutations as
live regions when inserted in flow; an explicit `role="status"` is a v1.1 improvement).

### Volume warning

The amber "Volume Warning" callout is rendered as visible text with a ⚠️ icon at all times. It
cannot be dismissed — the warning is not a one-time modal but persistent information, which is
more honest about the risk.

### Safe playback defaults

- Initial `volume` is **0.5** (50%), not 1.0.
- Preview audio passes through a `DynamicsCompressorNode` to avoid sudden transients.
- Playback never auto-starts; a click is always required (also satisfies browser autoplay
  policies).
- Generating new audio automatically stops any in-flight playback.

### Dialogs and sheets

The Save and More sheets are `role="dialog"` + `aria-modal="true"`: focus moves into the panel on
open, returns to the triggering button on close, the page behind is scroll-locked, and both
`Escape` and a backdrop tap dismiss them. Their close buttons carry `aria-label="Close"`, and the
sections inside use `aria-expanded`/`aria-controls` pairs so collapsed groups are announced as
such.

### Keyboard shortcuts

`Space` toggles playback, `G` generates, `R` randomises the seed. Shortcuts are ignored while the
user is typing in the seed field, while a native control has focus, or while a sheet is open —
so they never hijack text entry or dialog navigation.

Space = play/stop, `G` = generate, `R` = random seed, and 1–8 for presets will be added in v1.1
alongside documented tooltips and a visible shortcut legend.

---

## Known Gaps (v1.2)

These are tracked as work items; see [ROADMAP.md](../ROADMAP.md).

1. **Explicit ARIA labels on sliders.** The `<label>` element currently wraps sliders visually
   but is not programmatically associated via `htmlFor`/`id` in all cases. This works in most
   screen readers because of native input semantics, but explicit labeling is the gold standard.
2. **Live region for status.** Adding `role="status" aria-live="polite"` to the status line will
   guarantee that screen readers announce generation/export/error events rather than relying on
   DOM flow.
3. **`prefers-reduced-motion` guard.** The pulsing "on-air" dot, the ambient top-page glow, and
   the playhead shadow should be disabled for users who opt out of motion.
4. **Visible focus ring polish.** Custom Tailwind-styled buttons should carry a prominent
   `focus-visible:ring` style so keyboard users can track focus.
5. **Canvas waveform alt.** The canvas is decorative-in-practice (all information is duplicated
   numerically in the status line), but it should carry an `aria-hidden="true"` plus a textual
   description (e.g. "Waveform visualization showing noise density across the duration") for
   screen reader users who navigate to it.
6. **HiDPI canvas rendering.** Not strictly a11y, but low-res canvas rendering is an
   accessibility concern for users with screen magnifiers — will be addressed when canvas
   DPR scaling lands.
7. **Keyboard shortcut discoverability.** When shortcuts are added they must be documented
   in-UI (visible in labels/tooltips) rather than hidden.
8. **Form error messaging.** Currently there is essentially no invalid state (sliders constrain
   all inputs), but if free-text seed entry or future form fields allow invalid input those
   errors need accessible inline messaging.

---

## Testing Methodology

### Automated checks

- **Color contrast** verified manually with the WebAIM Contrast Checker against Tailwind's
  4.x palette and the custom `#08080e` background.
- **Build-time** HTML will be validated with `axe-core` integrated into Playwright tests once
  the browser-testing suite lands (v1.2).

### Manual testing matrix (target)

| Assistive technology | Browser | Status |
|----------------------|---------|:------:|
| VoiceOver (macOS) | Safari | ⚠️ Tested; improvements pending |
| NVDA | Firefox / Chrome | Planned |
| JAWS | Chrome / Edge | Planned |
| VoiceOver (iOS) | Safari | Planned |
| TalkBack | Chrome on Android | Planned |
| Keyboard-only (no pointing device) | Chrome / Firefox | ✅ Verified |
| 200% text zoom | Chrome | ✅ Verified |
| 320px viewport (mobile) | Chrome DevTools | ✅ Verified |

### How to test locally

1. Run `npm run dev` and open the app in Chrome.
2. Unplug or disable the mouse; attempt to operate every control via Tab/Shift+Tab and
   arrow keys. No action should be unreachable.
3. Open Chrome DevTools → Rendering → check **Emulate CSS media feature prefers-reduced-motion**
   (once the v1.1 gating lands) and verify non-essential motion disappears.
4. Open the Accessibility tab (DevTools → Elements → Accessibility) and spot-check controls;
   accessible names should match the visible labels.
5. Run a screen reader (NVDA on Windows, VoiceOver on macOS with Cmd-F5) and walk the
   interface — every control should be reachable and announce its purpose.

---

## Hearing Safety Statement

Harsh noise wall is a physically extreme form of audio. Accessibility includes **protecting
users from their own volume knobs**. NOISE WALL's safety layers are:

- Prominent, un-dismissable volume warning on every session.
- Default volume at 50% (not 100%).
- A `DynamicsCompressorNode` with conservative settings on the preview path.
- Stopping playback automatically when a new wall is generated (prevents double-starts).
- Automatic cleanup of the audio graph on unmount so no audio can outlive the page.
- Exported audio is peak-normalized to −0.27 dBTP so it does not clip on well-behaved players.

These are guardrails, not guarantees. Headphones can still damage hearing at any level, and
cheap Bluetooth adapters or damaged amplifiers can behave unpredictably. The warning stays.

---

## Accessibility Bugs

Accessibility bugs are treated as ordinary bugs with an elevated priority. Please file them
using the Bug Report issue template and tag them `a11y` if possible. Good accessibility
reports include:

- The assistive technology + browser + OS (e.g. NVDA 2024.1 + Firefox + Windows 11)
- The control that failed (e.g. "LFO Depth slider")
- What you expected vs. what happened
- Whether the issue blocks a workflow or is an annoyance

Contributions improving accessibility are especially welcome; many of them (labels,
focus rings, live regions) are small, isolated changes that make a real difference.

---

## Resources

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — especially the [Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Inclusive Components — Sliders](https://inclusive-components.design/sliders/)
