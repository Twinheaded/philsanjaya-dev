// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Canonical/OG host — the production domain (FR-84, flipped at PHI-46).
  // The same build also serves at philsanjaya-dev.pages.dev (deploy origin).
  site: 'https://philsanjaya.com',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
