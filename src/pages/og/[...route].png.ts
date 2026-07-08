/**
 * Per-project OG/Twitter card generation (FR-82). One 1200x630 PNG per
 * published project at /og/<slug>.png, plus /og/default.png for the rest of
 * the site. Rendered from a single template with satori (→ SVG) and resvg
 * (→ PNG) at build time, using the self-hosted brand fonts.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Resolve from the project root — the build always runs from there, which is
// steadier than a module-relative path Astro's bundler can move.
const font = (pkg: string, file: string): Buffer =>
  readFileSync(join(process.cwd(), 'node_modules', pkg, 'files', file));

const archivo = font('@fontsource/archivo', 'archivo-latin-500-normal.woff');
const instrument = font('@fontsource/instrument-sans', 'instrument-sans-latin-400-normal.woff');
const mono = font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff');

interface Card {
  title: string;
  kicker: string;
  summary: string;
}

const DEFAULT: Card = {
  title: 'Philipus Sanjaya',
  kicker: 'philsanjaya.com',
  summary:
    'Software engineering and data science — agent simulations, ML pipelines, and ICS security tooling.',
};

export const getStaticPaths: GetStaticPaths = async () => {
  const projects = await getCollection('projects', ({ data }) => data.status === 'published');
  const cards: Array<{ route: string; card: Card }> = [{ route: 'default', card: DEFAULT }];
  for (const p of projects) {
    cards.push({
      route: p.data.slug,
      card: { title: p.data.title, kicker: p.data.tags.join(' · '), summary: p.data.summary },
    });
  }
  return cards.map(({ route, card }) => ({ params: { route }, props: { card } }));
};

// The template as satori's JSX-free object tree (avoids a .tsx file).
function template(card: Card): Parameters<typeof satori>[0] {
  const text = (
    content: string,
    style: Record<string, unknown>
  ): Record<string, unknown> => ({
    type: 'div',
    props: { style: { display: 'flex', ...style }, children: content },
  });
  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#101312',
        borderLeft: '16px solid #23B893',
        padding: '72px 80px',
        fontFamily: 'Instrument Sans',
      },
      children: [
        text(card.kicker, {
          fontFamily: 'IBM Plex Mono',
          fontSize: 28,
          letterSpacing: '0.08em',
          color: '#23B893',
        }),
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: '24px' },
            children: [
              text(card.title, {
                fontFamily: 'Archivo',
                fontSize: 84,
                fontWeight: 500,
                color: '#E7EAE8',
                lineHeight: 1.05,
              }),
              text(card.summary, { fontSize: 36, color: '#9AA39E', maxWidth: '900px' }),
            ],
          },
        },
        text('philsanjaya.com', { fontFamily: 'IBM Plex Mono', fontSize: 24, color: '#67706C' }),
      ],
    },
  };
}

export const GET: APIRoute = async ({ props }) => {
  const { card } = props as { card: Card };
  const svg = await satori(template(card), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Archivo', data: archivo, weight: 500, style: 'normal' },
      { name: 'Instrument Sans', data: instrument, weight: 400, style: 'normal' },
      { name: 'IBM Plex Mono', data: mono, weight: 400, style: 'normal' },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  // Wrap the Node Buffer in a plain Uint8Array — a valid BodyInit (Buffer
  // works at runtime but is not in the Response type).
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
