Team Charter and Working Guidelines

Overview
- This repository uses multiple AGENTS.md files to coordinate roles.
- Keep changes minimal, dependency‑free (stdlib only), and aligned with the repo’s Repository Guidelines in user_instructions.
- Prefer surgical PRs with clear rationale and a short test plan.

Roles
- Carvana Site Specialist: See agents/carvana-specialist/AGENTS.md
- Frontend Engineer (Web): See web/AGENTS.md
- Backend Engineer (API): See src/AGENTS.md
- Project Manager: See project/AGENTS.md

Shared Principles
- Performance first: fast page loads, no external libs beyond included fonts.
- Accessibility: semantic HTML, keyboard support, sufficient contrast, aria labels.
- Consistency: UPPER_SNAKE_CASE constants, snake_case JSON, prefixed IDs (lst_/bid_/ask_/sal_).
- Tests: add/adjust tests in tests/ when changing validation or IDs.
- Content: keep copy concise; avoid placeholder lorem where possible.

Workflow
- Use the plan tool to outline 3–6 concise steps, keep exactly one step in_progress.
- Group changes by feature; don’t mix unrelated changes.
- Provide short progress updates and sample requests/responses for API changes.

