Role: Backend Engineer (API)

Scope
- Owns src/ (p2p_cars_api.py) and JSON stores under data/.

Guidelines
- Python 3.10+; stdlib only; 4-space indents; type hints encouraged.
- Validate all inputs; respond with clear errors; non-blocking handlers.
- IDs: lst_00001 / bid_00001 / ask_00001 / sal_00001.
- Endpoints: snake_case paths and keys; mirror code style.
- Writes are atomic; persist data/ between runs; health at /health.

Testing
- Add tests in tests/ for new validation and ID logic; keep runs fast and deterministic.

Constraints
- Avoid adding dependencies, network calls, or background daemons.

