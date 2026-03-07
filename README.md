# Satoshi Motors — Bitcoin P2P Car Market

Premium, low-friction marketplace for cars priced in BTC. UX inspired by Carvana’s browsing and StockX-style bid/ask execution.

**Highlights**

- Dependency-free Python API (no frameworks) serving both API and static UI
- JSON storage: listings, offers, bids, asks, and sales
- StockX-like orderbook: Highest Bid / Lowest Ask with instant Buy Now / Sell Now
- Clean, responsive UI with sidebar facets, search suggestions, chips, and sorting
- VIN, BTC address, and numeric validations; atomic JSON writes

## Quick Start

```bash
python3 src/p2p_cars_api.py
```

Open:

- Web app: `http://localhost:8000/`
- Health: `http://localhost:8000/health`

Data is stored in `data/` and auto-created on first run.

## Current Functionality

- Browsing
  - 3-up card grid (spacious layout; 2-up on medium screens, 1-up on mobile)
  - Cards show price, key specs, Lowest Ask, Highest Bid, and Spread
  - Details modal with gallery, features, and financing snapshot
  - Save vehicles locally, search with suggestions, sort, and facet filters

- Listing vehicles
  - “List Vehicle” modal creates a listing with VIN/year/mileage/price/address
  - Sellers can also post an Ask to participate in the orderbook immediately

- Bidding and Asking (StockX-style)
  - Place Bid (buyer) and Place Ask (seller) via simple modals
  - Buy Now executes at the current Lowest Ask (if present)
  - Sell Now executes at the current Highest Bid (if present)
  - Automatic matching creates a sale in “matched” state and marks listing “pending”
  - Settlement endpoint marks a matched sale as “settled” with a BTC txid

## API Endpoints

- Core
  - `GET /health`
  - `GET /listings`
  - `POST /listings`
  - `GET /offers` • `POST /offers` (legacy direct offers)
  - `GET /sales`
  - `POST /sales/settle` (legacy settlement for direct offers)

- Orderbook
  - `GET /bids` • `POST /bids`
  - `GET /asks` • `POST /asks`
  - `POST /execute/buy_now`  — executes at Lowest Ask
  - `POST /execute/sell_now` — executes at Highest Bid
  - `POST /sales/settle_matched` — finalize matched sale: `{ sale_id, btc_txid }`

## Examples

Create a listing

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
    "seller_btc_address": "bc1qqq...",
    "escrow_required": true
  }'
```

Place a bid

```bash
curl -X POST http://localhost:8000/bids \
  -H 'Content-Type: application/json' \
  -d '{
    "listing_id": "lst_00003",
    "buyer_id": "buyer_001",
    "bid_btc": 1.40,
    "buyer_btc_address": "bc1q..."
  }'
```

Place an ask

```bash
curl -X POST http://localhost:8000/asks \
  -H 'Content-Type: application/json' \
  -d '{
    "listing_id": "lst_00003",
    "seller_id": "seller_123",
    "ask_btc": 1.45,
    "seller_btc_address": "bc1q..."
  }'
```

Buy now (executes at Lowest Ask)

```bash
curl -X POST http://localhost:8000/execute/buy_now \
  -H 'Content-Type: application/json' \
  -d '{
    "listing_id": "lst_00003",
    "buyer_id": "buyer_001",
    "buyer_btc_address": "bc1q..."
  }'
```

Finalize a matched sale

```bash
curl -X POST http://localhost:8000/sales/settle_matched \
  -H 'Content-Type: application/json' \
  -d '{
    "sale_id": "sal_00001",
    "btc_txid": "<txid>"
  }'
```

## Data & Seeding

- Listings, bids, asks, offers, sales live in `data/*.json`.
- The repo includes a seeded inventory with realistic specs and placeholder images.
- On first run, missing files are created as empty arrays.

## UI Notes (Layout and Spacing)

- The grid defaults to 3-up on desktop for visual comfort; we purposely avoid 4-up to prevent cramped cards.
- Card images use a 4:3 aspect ratio and increased inner padding to reduce visual crowding.
- If you prefer denser or looser spacing, adjust in `web/styles.css`:
  - Grid gap: `.listings-grid { gap: … }`
  - Image ratio: `.listing-image-container { aspect-ratio: … }`
  - Card padding: `.listing-content { padding: … }`

## Hosting Notes

1. Run `python3 src/p2p_cars_api.py`.
2. Expose port `8000` publicly.
3. Persist `data/` between deploys.

## Roadmap

- Auth + signature ownership proof
- Escrow UX flow and dispute resolution
- Moderation, fraud controls, reputation
- Postgres + background jobs
- Image uploads and richer listing media

## Merge-hardening

- IDs are generated from max ID in JSON to reduce collisions.
- Atomic writes (temp file then replace) guard against corruption.
- `HEAD` works for health checks on routes/static files.
