# P2P Bitcoin Car Market (MVP)

This repo starts a simple **data-first** app where people can list and buy cars directly from each other using Bitcoin—without a dealer.

## What is included

- A minimal Python HTTP API with no external dependencies.
- JSON-backed storage for:
  - car listings,
  - buyer offers,
  - settled sales.
- Basic validation for VIN format, Bitcoin addresses, and numeric pricing fields.

## Quick start

```bash
python3 src/p2p_cars_api.py
```

Then call endpoints:

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

## Next milestones

1. Add authentication and signed wallet ownership proof.
2. Add escrow state machine + dispute handling.
3. Add reputation, chat, and fraud controls.
4. Move persistence to PostgreSQL.
5. Add web/mobile UX.
