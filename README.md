# Local PDF Reader Web

A cloud-deployed web app that reads PDF locally in the browser.
<img width="2550" height="1437" alt="image" src="https://github.com/user-attachments/assets/aa09efa8-89f9-40ac-a82a-4722984f5083" />


## Privacy model

- PDF processing happens only in the browser.
- No upload API is implemented.
- Data is stored locally in `IndexedDB`.
- CSP keeps `connect-src 'self'`.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Core pages

- Bookshelf page: show imported/previously read books
- Reader page: focused reading UI (no upload area)

## Current features

- Import local PDF files
- Import a whole local directory (`webkitdirectory`)
- Build local index on bookshelf
- Persist book data/progress/bookmarks in `IndexedDB`
- Previous/next page, jump page, zoom
- Single-page and continuous mode toggle
- Full-text search (page-level matching)
- Collapsible control panel
- Collapsible left thumbnail preview panel
- Outline navigation and bookmark navigation

## Deploy

Deploy as a static site to Vercel or Netlify.
