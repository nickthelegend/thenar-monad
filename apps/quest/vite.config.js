import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS so the Quest browser will open an XR session over Wi-Fi (WebXR needs a
// secure context off localhost). HTTP=1 serves plain http for localhost-only
// work (`adb reverse` or a desktop browser). The relay rides the same origin at /relay.
export default defineConfig({
  plugins: process.env.HTTP ? [] : [basicSsl({ name: "thenar-quest" })],
  server: {
    host: true,
    port: 5174,
    proxy: { "/relay": { target: `ws://127.0.0.1:${process.env.RELAY_PORT ?? 8787}`, ws: true } },
  },
  preview: { host: true, port: 4174 },
  build: { target: "esnext" },
});
