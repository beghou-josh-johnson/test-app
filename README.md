# P2P Bitcoin Car Market (MVP)

A lightweight Craigslist-style marketplace for peer-to-peer car sales priced in Bitcoin.

## What is included

- A dependency-free Python backend API.
- A simple, elegant web UI served by the same server.
- JSON-backed storage for listings, offers, and settled sales.
- Validation for VIN format, Bitcoin addresses, and core numeric fields.

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

## Example: create a listing

```bash
curl -X POST http://localhost:8000/listings \
  -H 'Content-Type: application/json' \
  -d '{
    "seller_id": "user_123",
    "vin": "1HGCM82633A004352",
    "make": "Ford",
    "model": "F-150",
    "year": 2021,
    "mileage": 30000,
    "price_btc": 0.55,
    "seller_btc_address": "bc1qqqg8n0lyqv6gm5fd4z58xm8qnn6l5yr4mj57d0",
    "escrow_required": true
  }'
```

## Hosting notes

This is easy to host on any small VM or container platform:

1. Deploy this repo.
2. Run `python3 src/p2p_cars_api.py`.
3. Expose port `8000` publicly.
4. Persist the `data/` directory between deploys.

## Next milestones

1. Add auth and wallet-signature ownership proof.
2. Add escrow workflow and dispute resolution.
3. Add moderation, fraud controls, and reputation.
4. Move to PostgreSQL and background jobs.
5. Add image uploads and richer listing search.


## Merge-hardening updates

- IDs are now generated from the current max ID in JSON, so merges/manual edits are less likely to cause duplicate IDs.
- JSON writes are atomic (write-temp-then-replace) to reduce corrupted files on abrupt restarts.
- `HEAD` requests now work for routes/static files (helpful for host health checks and uptime probes).
