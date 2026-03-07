Role: Frontend Engineer (Web)

Scope
- Owns web/ (HTML/CSS/JS). No frameworks; keep it fast and accessible.

Guidelines
- Semantic HTML; aria labels; keyboard support; high-contrast text.
- CSS: extend styles.css; use CSS variables; prefer grid/flex; responsive first.
- JS: small pure functions; reuse patterns in web/app.js; avoid global leaks.
- Images: lazy-load; 4:3 card images; optimize sizes; no external CDNs.

Tasks
- Polish welcome banner UI (stat chips, clear actions).
- Maintain clean card grid and details modal.
- Search suggestions and facet filters remain fast and debounced.

Constraints
- No new deps; static assets live under web/.
- Keep changes minimal and consistent with existing style.

