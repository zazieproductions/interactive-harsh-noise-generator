# Security Policy

**NOISE WALL** is a client-side-only creative audio tool with no server component, no
authentication surface, and no outbound network traffic at runtime. This limits the attack
surface considerably — but it doesn't eliminate it. We take security, privacy, and user safety
seriously.

---

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `main` (development) | ✅ |
| 1.0.x (current release) | ✅ |
| < 1.0.0 (pre-release) | ❌ |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.** Public issue
disclosures put users at risk before a fix is available.

Instead, report vulnerabilities privately via one of these channels:

1. **GitHub's private vulnerability reporting** (preferred):
   Use the *Report a vulnerability* button on the
   [Security tab](https://github.com/zazieproductions/interactive-harsh-noise-generator/security)
   of the repository. This is a private channel visible only to maintainers.
2. **Email**: send a detailed report to `security@zazieproductions.com` (or the maintainer
   address listed in the repository's GitHub profile) with subject line starting
   `[NOISE WALL SECURITY]`.

### What to include

The more information you provide, the faster we can triage and fix:

- Type of issue (e.g., XSS, arbitrary code execution, information leak, memory exhaustion,
  supply chain)
- Full paths of any source files related to the issue, if known
- Step-by-step instructions to reproduce (minimum reproduction case is ideal — a seed + params
  for DSP-level issues, a crafted URL or HTML snippet for UI-level issues)
- Proof-of-concept or exploit code (as an attachment or inline; please do not weaponize it)
- Impact assessment: what you believe an attacker could achieve
- Your assessment of how exploitable the issue is in practice

### Response timeline

We aim to:

- **Acknowledge** reports within 48 hours.
- **Triage** (confirm severity, affected versions) within 7 days.
- **Publish a fix** for critical/high issues within 30 days of confirmation, coordinated with
  the reporter. Lower-severity issues ship with the next regular release.

We will keep you informed throughout the process and will credit you in the fix's changelog
entry unless you request anonymity.

---

## Threat Model

Because NOISE WALL is a single-file, offline-capable web app with no server, the relevant
threats are:

| Threat | Likelihood | Mitigation |
|--------|-----------|------------|
| XSS via user-controlled input | Low | React JSX auto-escapes all interpolated values; no `innerHTML` with user data; no `eval`; downloads use `Blob`/`URL.createObjectURL`, not inline data URLs constructed from user input |
| DOM-based open redirect / tab nabbing | Low | No external links in the shipped app; anchor tags for downloads are ephemeral and removed immediately after click |
| Memory exhaustion (DoS) via pathological parameters | Medium | Duration is capped at 600 s; all DSP stages are bounded; a 10-minute wall allocates ~100 MB of `Float32Array` plus encoder scratch |
| Supply-chain compromise in npm dependencies | Medium | Pinned `package-lock.json`; Vite + singlefile output is auditable by inspecting `dist/index.html`; CI runs a clean build on every PR |
| Audio-induced hardware damage | Low | Playback is routed through a `DynamicsCompressorNode` with conservative settings; a prominent volume warning is displayed; initial gain defaults to 0.5 |
| Exfiltration of generated audio | Not applicable | No network code runs post-load; no fetch, no XHR, no websockets, no beacons |

If you find something that isn't covered by this table, we want to hear about it.

---

## Security Hygiene for Users

- Run the app from a trusted host, or open the local `dist/index.html` directly for maximum
  assurance.
- Keep your browser up to date — Web Audio security fixes ship with browser updates.
- Always start with the volume slider low; the compressor helps but is not a hearing-protection
  device.

---

## Dependency Security

Dependencies are kept minimal by design. As of v1.0.0 the runtime dependency set is:

- `react`, `react-dom` — UI
- `clsx`, `tailwind-merge` — className composition
- `lamejs` — MP3 encoding (pure JS, no native code, no network)

If a vulnerability is disclosed in one of these, we will:

1. Verify impact on NOISE WALL (many CVEs in JS tooling do not apply to single-file client builds).
2. Upgrade or patch the dependency.
3. Cut a patch release.

---

## There Is No Bug Bounty Program

NOISE WALL is an open-source, MIT-licensed personal/portfolio project. We cannot pay bounties.
We will, however, give you public credit in the CHANGELOG and README if you are the first to
report a qualifying issue and you wish to be named.
