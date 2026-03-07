Backend Engineer (API)

Scope
- Applies to all files under src/.
- Owns stdlib HTTP server (p2p_cars_api.py) and JSON storage under data/.

Rules
- Python 3.10+; stdlib only; 4-space indents; type hints encouraged.
- Preserve ID formats: lst_00001, bid_00001, ask_00001, sal_00001.
- Keep endpoints/keys snake_case; mirror code style (e.g., /sales/settle_matched).
- Writes must be atomic; handlers non-blocking; validate all inputs.

Testing
- Add/adjust tests in tests/ for validation, ID generation, and content types.
- Run: pytest -q (or python -m pytest -q). Avoid network.

Operational
- Server binds :8000; persist data/ across runs.
- Expose simple healthcheck at /health.

