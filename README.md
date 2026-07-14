# KFxNet Personal Website

Static personal website for 許展發 (KLIF), built with Next.js (static export) and deployed to GitHub Pages.

## Development

npm install
npm run dev
# open http://localhost:3000

## Content updates (Google Sheets)

Project and Blog content are edited in this Google Sheet:
https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4

- `Projects` tab columns: slug, title, summary, description, tech_stack, image_url, link_url, order
- `Blog Posts` tab columns: slug, title, date, summary, content, order

Content is fetched at **build time**, not live. After editing the sheet, trigger a redeploy
(see below) for changes to appear on the site.

## Deploying

1. Push your changes to the `main`/`master` branch on GitHub.
2. Go to the repo's **Actions** tab.
3. Select **Deploy to GitHub Pages** and click **Run workflow**.
4. Site is published at https://cs83312.github.io/PersionalWebSite/

## Tests

npm test        # runs lib/ unit tests (CSV parsing, data validation, Markdown rendering)
npm run typecheck
npm run build   # also serves as the primary verification for pages/UI (no automated UI tests)
