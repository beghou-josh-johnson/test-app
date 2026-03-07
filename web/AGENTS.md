Frontend Engineer (Web)

Scope
- Applies to all files under web/.
- Owns HTML/CSS/JS for static frontend; no frameworks, stdlib server only.

Technical Guidelines
- HTML: semantic structure, accessible labels, mobile-first. Reuse existing classes and utilities.
- CSS: extend styles.css with CSS variables and small, reusable components; avoid heavy resets.
- JS: keep functions small and pure; avoid globals where possible; follow existing patterns in app.js.
- Performance: avoid layout thrash; prefer CSS for animation; lazy-load images.

Naming & Style
- Classes: kebab-case (e.g., .welcome-banner, .stat-chip).
- IDs: kebab-case; JS variables: camelCase; constants: UPPER_SNAKE_CASE.
- Keep file size modest and comments minimal; self-explanatory code preferred.

UX Guidelines
- Prioritize clarity: clear CTAs, visible prices, obvious state (saved, active filters).
- Cards: consistent image ratios (4:3), clear titles, price prominent.
- Empty states: informative and friendly.

Testing
- Manually verify with the stdlib server (python3 src/p2p_cars_api.py) and hit /health.
- Don’t introduce dependencies; no network calls.

