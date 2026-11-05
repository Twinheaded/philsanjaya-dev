# archive/

Content that is kept but **not built**. Astro only reads `src/`, so nothing
here reaches `dist/`.

| Folder      | What it is                                  | Removed from the site |
| :---------- | :------------------------------------------ | :-------------------- |
| `notes/`    | The Notes posts (1), original markdown       | PHI-159, Nov 2026     |
| `buildlog/` | The Log build-diary entries 00–04, original markdown | PHI-159, Nov 2026     |

## Bringing a section back

The files are byte-identical to what the site used. To restore Notes or Log,
recover the code PHI-159 removed from git history (the commit before
PHI-159's, i.e. the parent of the PHI-159 commit):

1. `git mv archive/notes src/content/notes` (or `buildlog`).
2. Restore the routes: `git checkout <parent-of-PHI-159> -- src/pages/notes`
   (or `src/pages/log`).
3. Restore the collection schema in `src/content.config.ts` and the panel
   entry (plus the paginated-route match) in `src/lib/panels.ts` from the
   same commit, then renumber the panels.
4. Remove the matching lines from `public/_redirects`, or they will keep
   sending visitors to the home page.
5. The reading pane (`src/components/NotePane.astro`) and its CSP hash in
   `public/_headers` were left in place, so they need no restore.
6. Run `npm run verify`.
