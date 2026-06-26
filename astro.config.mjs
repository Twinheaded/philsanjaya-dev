// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Canonical/OG host. Pages preview URL until M5 (PHI-46) flips it to the
  // production domain philsanjaya.dev (PRD §7.84).
  site: 'https://philsanjaya-dev.pages.dev',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
