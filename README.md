# P2P Bitcoin Car Market (MVP)

A lightweight Craigslist-style marketplace for peer-to-peer car sales priced in Bitcoin.

## What is included

- A dependency-free Python backend API.
- A simple, elegant web UI served by the same server.
- JSON-backed storage for listings, offers, and settled sales.
- Validation for VIN format, Bitcoin addresses, and core numeric fields.
- Demo-friendly reset endpoint to quickly restore sample data.

## Quick start

```bash
python3 src/p2p_cars_api.py
```

Open:

- Web app: `http://localhost:8000/`
- Health: `http://localhost:8000/health`

## API endpoints

- `GET /health`
- `GET /listings`
- `POST /listings`
- `GET /offers`
- `POST /offers`
- `GET /sales`
- `POST /sales/settle`
- `POST /demo/reset` (reset data back to demo records)

## Demo testing checklist

Run the app and verify quickly:

1. Open `http://localhost:8000/` and confirm listings, offers, and settled sales appear.
2. Submit a listing and confirm it appears in "Live listings".
3. Submit an offer and confirm it appears in "Recent offers".
4. Click **Reset demo data** and confirm all sections return to sample data.

## CLI smoke test

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/listings | jq '. | length'
curl -s -X POST http://localhost:8000/demo/reset
```

## Hosting notes

This is easy to host on any small VM or container platform:

1. Deploy this repo.
2. Run `python3 src/p2p_cars_api.py`.
3. Expose port `8000` publicly.
4. Persist the `data/` directory between deploys.

## Merge-hardening updates

- IDs are generated from the current max ID in JSON to reduce duplicate-ID issues after merges/manual edits.
- JSON writes are atomic (write-temp-then-replace) to reduce corrupted files on abrupt restarts.
- `HEAD` requests work for routes/static files (helpful for host health checks and uptime probes).
