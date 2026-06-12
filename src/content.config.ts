/**
 * Content collections (FR-20): projects, notes, buildlog. Adding content
 * is a markdown file, never a code change (FR-24). Invalid frontmatter
 * fails the build.
 */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * FR-22 — the mechanical honest-numbers rule (§4.2, ADR 0004): every
 * metric must carry a `source`; a number that cannot cite a report, log,
 * or measurement cannot ship. `value: pending` is legal and renders as
 * an em-dash card.
 */
const metric = z.object({
  label: z.string().min(1),
  value: z.union([z.string().min(1), z.number()]),
  source: z.string().min(1, 'every metric needs a source (PRD FR-22)'),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/[^_]*.md' }),
  schema: z.object({
    title: z.string().min(1),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case'),
    order: z.number().int().positive(),
    tags: z.array(z.string()).min(1),
    stack: z.array(z.string()).min(1),
    period: z.string().min(1),
    summary: z.string().min(1).max(120, 'summary is one line (FR-21)'),
    question: z.string().optional(),
    metrics: z.array(metric).default([]),
    status: z.enum(['draft', 'published']),
    links: z
      .array(z.object({ label: z.string().min(1), url: z.string().url() }))
      .default([]),
    hero: z.string().optional(),
  }),
});

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/[^_]*.md' }),
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    summary: z.string().max(160).optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const buildlog = defineCollection({
  loader: glob({ base: './src/content/buildlog', pattern: '**/[^_]*.md' }),
  schema: z.object({
    title: z.string().min(1),
    entry: z.number().int().min(0),
    date: z.coerce.date(),
    /** Milestone reference, e.g. "M1" — or "design" for entry 00 (FR-52). */
    milestone: z.string().min(1),
    /** Short SHAs linking to GitHub commits; empty for entry 00 (FR-23). */
    commits: z
      .array(z.string().regex(/^[0-9a-f]{7,12}$/i, 'commits are short SHAs'))
      .default([]),
  }),
});

export const collections = { projects, notes, buildlog };
