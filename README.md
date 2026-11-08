# shark-byte 2026 — Cone of Uncertainty

MDC career pathway navigator. Catalog facts come from `data/Courses_data/mdc_pathways.json`; Swarms agents only personalize and tutor.

## Setup

```bash
npm install
cp .env.example .env.local   # add SWARMS_API_KEY and SWARMS_MODEL
npm run dev
```

Set `DEMO_MODE=true` to serve cached responses from `data/cache/` without calling Swarms.

## Scripts

- `npm run check-data` — validate the pathways JSON and sanitizer
- `npm run probe-swarms` — test the Swarms API connection
- `npm run seed-cache` — regenerate demo responses in `data/cache/`
- `npm run build` — production build (run before every PR)
