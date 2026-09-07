# APPLY-LOG — Week 1 self-GEO patches

**Applied:** 2026-09-07 21:31 CEST (PT)
**Target:** `/workspace/delivery/clients/shifter/site-src/live`
**Sources:** `/workspace/delivery/clients/shifter/w1-patches`
**Deploy:** not deployed (files only)

## Changes

- Copied llms.txt → live/llms.txt
- Copied sitemap.xml → live/sitemap.xml
- Copied method.html → live/method.html
- Copied about.html → live/about.html
- Path check method.html: missing site-pages.css (absent in mirror; page-local CSS present)
- Path check about.html: missing site-pages.css (absent in mirror; page-local CSS present)
- Created vercel.json with method/about rewrites only
- vercel.json rewrites: [{"source": "/method", "destination": "/method.html"}, {"source": "/about", "destination": "/about.html"}]
- JSON-LD: replaced Organization; FAQ append=yes; kept types ['Organization', 'Service', 'DefinedTerm', 'FAQPage'] → ['Organization', 'Service', 'DefinedTerm', 'FAQPage']
- JSON-LD validates (json.loads OK; Organization+Service+DefinedTerm+FAQPage; disambiguation Q present)
- Added visible FAQ details for shifter.io disambiguation
- Footer nav: added /method and /about after Insights
- Added story-link to /method after snapshot-essentials (near #how / journey)
- Updated footer copyright to Shifter Strategy FZ-LLC · Licence 17003064
- Wrote live/index.html
- Post-edit JSON-LD still parses

## Files touched

- `index.html` — Organization JSON-LD, FAQPage + visible FAQ, footer links, story-link, copyright
- `llms.txt` — replaced
- `sitemap.xml` — replaced
- `method.html` — added
- `about.html` — added
- `vercel.json` — created/merged with `/method` and `/about` rewrites
- `APPLY-LOG.md` — this file

## Notes

- `method.html` / `about.html` reference `/site-pages.css`, which is not present in this mirror (same as several other live pages). Page-local `<style>` blocks cover layout.
- Pretty URLs `/method` and `/about` require the Vercel rewrites in `vercel.json` at deploy time.
