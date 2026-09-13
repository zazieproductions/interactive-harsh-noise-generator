import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Hosts the dev/preview server is allowed to answer for.
 *
 * The phone-workflow depends on this: `npm run dev` binds 0.0.0.0 so a phone on
 * the same Wi-Fi can open `http://<computer-ip>:5173`, and the same binding is
 * what makes a cloud dev container (Codespaces) or a sandbox preview URL work.
 * Vite 6+ rejects unknown `Host` headers, so each proxied domain has to be
 * listed explicitly.
 */
const allowedHosts = [
  "localhost",
  ".local",
  ".e2b.app",
  ".app.github.dev",
  ".githubpreview.dev",
  ".trycloudflare.com",
];

// Inside Codespaces, HMR has to ride the HTTPS port-forwarding proxy.
const inCodespaces = Boolean(process.env.CODESPACE_NAME);

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts,
    hmr: inCodespaces ? { protocol: "wss", clientPort: 443 } : undefined,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    allowedHosts,
  },
});
