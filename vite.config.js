import { homedir } from "node:os";
import { defineConfig } from "vite";

export default defineConfig({
  // unkernel loads unkernel.wasm from next to its entry: keep it out of the dep optimizer.
  optimizeDeps: { exclude: ["unkernel"] },
  server: { port: 5199, fs: { allow: [".", `${homedir()}/.cache/unkernel`] } },
});
