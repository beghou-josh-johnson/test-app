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

## Cursor Agents Setup

This repo includes workspace rules and role files for Cursor AI.

- Global rules: `.cursorrules` (applies repo-wide)
- Role-specific rules: `.cursor/rules/`
  - `carvana-specialist.md` — marketplace UX/design guidance
  - `frontend-engineer.md` — web UI implementation rules
  - `backend-engineer.md` — API/validation rules
  - `project-manager.md` — planning and review cadence

How to use in Cursor
- Open Cursor → AI → Rules → Workspace.
- Enable the roles you want (you can combine, e.g., Project Manager + Frontend Engineer).
- Start a chat and reference the role, e.g., “Use Frontend Engineer and Carvana Specialist rules to polish the listing cards.”

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
  - `GET /metrics` — counts for listings, bids/asks, sales, and GMV (BTC)
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


## Using More Images (Stock or AI)

You can use both local files and remote image URLs for:

- Promo banners (`PROMO_SLIDES` in `web/app.js`)
- Listing image galleries (`images` array in `data/listings.json`)

### Supported image paths

- Local/static paths: `/banner_1.svg`, `/car_1.png`, `/my_new_photo.jpg`
- Remote URLs: `https://images.example.com/car-front-01.jpg`

The frontend now normalizes image paths and applies an automatic fallback if a URL fails to load, so broken images gracefully swap to default artwork.

### Example listing using mixed sources

```json
{
  "id": "lst_90001",
  "make": "Porsche",
  "model": "911 Carrera",
  "year": 2022,
  "images": [
    "https://images.example-cdn.com/porsche-911-front.jpg",
    "/car_2.png",
    "https://images.example-cdn.com/porsche-911-rear.jpg"
  ]
}
```

### AI generation workflow (fast)

1. Generate 4:3 images (recommended: 1600x1200 or 1200x900).
2. Keep style consistent (lighting, angle, color grading).
3. Save optimized `.jpg`/`.webp` files into `web/` for best performance.
4. Reference them with absolute static paths in listing JSON (for example: `/listing_911_front.jpg`).

### Stock image workflow

1. Download images with commercial-safe licenses.
2. Rename to descriptive, lowercase files (for example: `listing_tesla_model3_front.jpg`).
3. Compress before commit to keep page loads fast.
4. Update listing `images` or banner entries in `web/app.js`.

## Hosting Notes

1. Run `python3 src/p2p_cars_api.py`.
2. Expose port `8000` publicly (or set a custom port with `PORT=8001 python3 src/p2p_cars_api.py` or `python3 src/p2p_cars_api.py 8001`).
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

---

## Lonisa Mari Quote Index Scraper

This repository now includes a production-oriented script for crawling public posts from `https://lonisamari.blog/`, extracting memorable quotes, assigning thematic tags, and exporting searchable Markdown and JSON indexes.

### Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run

```bash
python3 scrape_quotes.py
```

Optional flags:

```bash
python3 scrape_quotes.py --max-pages 120 --rate-limit 1.5 --log-level INFO
python3 scrape_quotes.py --dry-run --max-pages 40
python3 scrape_quotes.py --no-cache
```

### How quote extraction works

1. Crawl internal, public URLs on `lonisamari.blog` while respecting `robots.txt`.
2. Identify probable post pages using URL and page-structure heuristics (`article`, `time`, entry-content markers).
3. Clean extracted main content by removing navigation, comments, share/subscription blocks, and boilerplate.
4. Build quote candidates from paragraphs and adjacent multi-paragraph combinations.
5. Score each candidate for readability, meaningful length, complete thought, emotional/spiritual signal words, and distinctiveness.
6. Select the top 3 non-duplicate quotes per post (or fewer for very short posts).
7. Assign 2–8 reusable lowercase tags per quote using a rule-based keyword+category hybrid.

### Outputs

- `quotes_index.md` — human-readable quote index with summary, tag index, and quotes grouped by post.
- `quotes_index.json` — structured machine-readable export for reuse.
- `.cache_pages.json` — optional local HTML cache for faster reruns.

### Limitations

- Heuristic post detection may miss edge-case templates or include an occasional non-post page.
- Rule-based quote ranking can still pick weaker passages on highly irregular post formats.
- Category extraction depends on theme markup and may not always capture all labels.
- Tags are deterministic heuristics (no LLM API usage), so semantic nuance is limited.
