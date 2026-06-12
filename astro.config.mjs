// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    // The plugin's published types resolve against the hoisted vite 8
    // (vitest's), while Astro 5 bundles vite 6 — structurally compatible
    // at runtime, so bridge the nominal type clash explicitly.
    plugins: [/** @type {*} */ (tailwindcss())],
  },
});
