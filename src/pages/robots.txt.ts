import type { APIRoute } from 'astro';

// Generated from the configured `site` so it tracks the M5 domain flip
// automatically (FR-81).
const sitemap = new URL('sitemap-index.xml', import.meta.env.SITE).href;

const body = `User-agent: *
Allow: /

Sitemap: ${sitemap}
`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
