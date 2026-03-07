#!/usr/bin/env python3
"""Minimal peer-to-peer car marketplace API using bitcoin-denominated prices.

This is intentionally dependency-free and stores data in local JSON files to keep
this repository simple and easy to run.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.parse import urlparse

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LISTINGS_FILE = DATA_DIR / "listings.json"
OFFERS_FILE = DATA_DIR / "offers.json"
SALES_FILE = DATA_DIR / "sales.json"
BIDS_FILE = DATA_DIR / "bids.json"
ASKS_FILE = DATA_DIR / "asks.json"
WEB_DIR = Path(__file__).resolve().parent.parent / "web"

VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
BTC_ADDR_RE = re.compile(r"^(bc1|[13])[a-zA-HJ-NP-Z0-9]{24,87}$")


@dataclass
class ValidationError(Exception):
    message: str


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", delete=False, dir=path.parent, encoding="utf-8") as tmp:
        json.dump(payload, tmp, indent=2)
        tmp.write("\n")
        temp_name = tmp.name
    Path(temp_name).replace(path)


def _next_id(prefix: str, items: list[dict[str, Any]]) -> str:
    max_id = 0
    for item in items:
        raw = str(item.get("id", ""))
        if raw.startswith(f"{prefix}_"):
            number = raw.split("_", 1)[1]
            if number.isdigit():
                max_id = max(max_id, int(number))
    return f"{prefix}_{max_id + 1:05d}"


def _validate_listing(payload: dict[str, Any]) -> dict[str, Any]:
    required = [
        "seller_id",
        "vin",
        "make",
        "model",
        "year",
        "mileage",
        "price_btc",
        "seller_btc_address",
        "escrow_required",
    ]
    missing = [k for k in required if k not in payload]
    if missing:
        raise ValidationError(f"Missing fields: {', '.join(missing)}")

    if not VIN_RE.match(str(payload["vin"]).upper()):
        raise ValidationError("vin must be a 17-character VIN value")

    try:
        year = int(payload["year"])
    except (ValueError, TypeError) as exc:
        raise ValidationError("year must be an integer") from exc
    if not (1980 <= year <= 2100):
        raise ValidationError("year must be between 1980 and 2100")

    try:
        mileage = int(payload["mileage"])
    except (ValueError, TypeError) as exc:
        raise ValidationError("mileage must be an integer") from exc
    if mileage < 0:
        raise ValidationError("mileage must be >= 0")

    try:
        price_btc = float(payload["price_btc"])
    except (ValueError, TypeError) as exc:
        raise ValidationError("price_btc must be numeric") from exc
    if price_btc <= 0:
        raise ValidationError("price_btc must be > 0")

    if not BTC_ADDR_RE.match(str(payload["seller_btc_address"])):
        raise ValidationError("seller_btc_address does not appear valid")

    payload["vin"] = str(payload["vin"]).upper()
    payload["year"] = year
    payload["mileage"] = mileage
    payload["price_btc"] = round(price_btc, 8)
    payload["escrow_required"] = bool(payload["escrow_required"])
    payload["status"] = payload.get("status", "open")
    return payload


def _validate_offer(payload: dict[str, Any]) -> dict[str, Any]:
    required = ["listing_id", "buyer_id", "offered_btc", "buyer_btc_address"]
    missing = [k for k in required if k not in payload]
    if missing:
        raise ValidationError(f"Missing fields: {', '.join(missing)}")

    if not BTC_ADDR_RE.match(str(payload["buyer_btc_address"])):
        raise ValidationError("buyer_btc_address does not appear valid")

    try:
        offered_btc = float(payload["offered_btc"])
    except (ValueError, TypeError) as exc:
        raise ValidationError("offered_btc must be numeric") from exc
    if offered_btc <= 0:
        raise ValidationError("offered_btc must be > 0")

    payload["offered_btc"] = round(offered_btc, 8)
    payload["status"] = payload.get("status", "pending")
    return payload


def _validate_bid(payload: dict[str, Any]) -> dict[str, Any]:
    required = ["listing_id", "buyer_id", "bid_btc", "buyer_btc_address"]
    missing = [k for k in required if k not in payload]
    if missing:
        raise ValidationError(f"Missing fields: {', '.join(missing)}")
    if not BTC_ADDR_RE.match(str(payload["buyer_btc_address"])):
        raise ValidationError("buyer_btc_address does not appear valid")
    try:
        bid_btc = float(payload["bid_btc"])
    except (ValueError, TypeError) as exc:
        raise ValidationError("bid_btc must be numeric") from exc
    if bid_btc <= 0:
        raise ValidationError("bid_btc must be > 0")
    payload["bid_btc"] = round(bid_btc, 8)
    payload["status"] = payload.get("status", "open")
    return payload


def _validate_ask(payload: dict[str, Any]) -> dict[str, Any]:
    required = ["listing_id", "seller_id", "ask_btc", "seller_btc_address"]
    missing = [k for k in required if k not in payload]
    if missing:
        raise ValidationError(f"Missing fields: {', '.join(missing)}")
    if not BTC_ADDR_RE.match(str(payload["seller_btc_address"])):
        raise ValidationError("seller_btc_address does not appear valid")
    try:
        ask_btc = float(payload["ask_btc"])
    except (ValueError, TypeError) as exc:
        raise ValidationError("ask_btc must be numeric") from exc
    if ask_btc <= 0:
        raise ValidationError("ask_btc must be > 0")
    payload["ask_btc"] = round(ask_btc, 8)
    payload["status"] = payload.get("status", "open")
    return payload


def _best_open_bid(bids: list[dict[str, Any]], listing_id: str) -> dict[str, Any] | None:
    open_bids = [b for b in bids if b.get("listing_id") == listing_id and b.get("status") == "open"]
    if not open_bids:
        return None
    return max(open_bids, key=lambda x: float(x.get("bid_btc", 0)))


def _best_open_ask(asks: list[dict[str, Any]], listing_id: str) -> dict[str, Any] | None:
    open_asks = [a for a in asks if a.get("listing_id") == listing_id and a.get("status") == "open"]
    if not open_asks:
        return None
    return min(open_asks, key=lambda x: float(x.get("ask_btc", 0)))


def _try_match(listing_id: str) -> dict[str, Any] | None:
    listings = _load_json(LISTINGS_FILE, [])
    listing = next((item for item in listings if item.get("id") == listing_id), None)
    if listing is None:
        return None
    bids = _load_json(BIDS_FILE, [])
    asks = _load_json(ASKS_FILE, [])
    best_bid = _best_open_bid(bids, listing_id)
    best_ask = _best_open_ask(asks, listing_id)
    if not best_bid or not best_ask:
        return None
    if float(best_bid["bid_btc"]) < float(best_ask["ask_btc"]):
        return None

    sales = _load_json(SALES_FILE, [])
    sale = {
        "id": _next_id("sal", sales),
        "listing_id": listing_id,
        "bid_id": best_bid["id"],
        "ask_id": best_ask["id"],
        "price_btc": round(float(best_ask["ask_btc"]), 8),
        "status": "matched",
    }
    sales.append(sale)

    # Update order statuses and listing status to pending (await settlement)
    best_bid["status"] = "filled"
    best_ask["status"] = "filled"
    listing["status"] = "pending"
    _save_json(SALES_FILE, sales)
    _save_json(BIDS_FILE, bids)
    _save_json(ASKS_FILE, asks)
    _save_json(LISTINGS_FILE, listings)
    return sale


def _content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".html":
        return "text/html; charset=utf-8"
    if suffix == ".css":
        return "text/css; charset=utf-8"
    if suffix == ".js":
        return "application/javascript; charset=utf-8"
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".json":
        return "application/json; charset=utf-8"
    return "application/octet-stream"


class Handler(BaseHTTPRequestHandler):
    server_version = "P2PCars/0.1"

    def _json_response(self, code: int, payload: Any) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValidationError("Request body must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValidationError("Request body must be a JSON object")
        return payload

    def _route_get(self, path: str, head_only: bool = False) -> None:
        if path == "/health":
            return self._json_response(HTTPStatus.OK, {"ok": True})

        if path == "/listings":
            listings = _load_json(LISTINGS_FILE, [])
            return self._json_response(HTTPStatus.OK, listings)

        if path == "/offers":
            offers = _load_json(OFFERS_FILE, [])
            return self._json_response(HTTPStatus.OK, offers)

        if path == "/bids":
            bids = _load_json(BIDS_FILE, [])
            return self._json_response(HTTPStatus.OK, bids)

        if path == "/asks":
            asks = _load_json(ASKS_FILE, [])
            return self._json_response(HTTPStatus.OK, asks)

        if path == "/sales":
            sales = _load_json(SALES_FILE, [])
            return self._json_response(HTTPStatus.OK, sales)

        static_name = "index.html" if path == "/" else path.lstrip("/")
        static_file = (WEB_DIR / static_name).resolve()
        if WEB_DIR.resolve() in static_file.parents and static_file.exists() and static_file.is_file():
            body = static_file.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", _content_type(static_file))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return

        return self._json_response(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        self._route_get(path)

    def do_HEAD(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        self._route_get(path, head_only=True)

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = self._read_json_body()
            path = urlparse(self.path).path
            if path == "/listings":
                listing = _validate_listing(payload)
                listings = _load_json(LISTINGS_FILE, [])
                listing["id"] = _next_id("lst", listings)
                listings.append(listing)
                _save_json(LISTINGS_FILE, listings)
                return self._json_response(HTTPStatus.CREATED, listing)

            if path == "/offers":
                offer = _validate_offer(payload)
                listings = _load_json(LISTINGS_FILE, [])
                listing = next((item for item in listings if item.get("id") == offer["listing_id"]), None)
                if listing is None:
                    raise ValidationError("listing_id does not exist")
                if listing.get("status") not in {"open", "pending"}:
                    raise ValidationError("listing is not accepting offers")

                offers = _load_json(OFFERS_FILE, [])
                offer["id"] = _next_id("off", offers)
                offers.append(offer)
                _save_json(OFFERS_FILE, offers)
                return self._json_response(HTTPStatus.CREATED, offer)

            if path == "/bids":
                bid = _validate_bid(payload)
                listings = _load_json(LISTINGS_FILE, [])
                listing = next((item for item in listings if item.get("id") == bid["listing_id"]), None)
                if listing is None:
                    raise ValidationError("listing_id does not exist")
                bids = _load_json(BIDS_FILE, [])
                bid["id"] = _next_id("bid", bids)
                bids.append(bid)
                _save_json(BIDS_FILE, bids)
                # Try to match against best ask
                matched = _try_match(bid["listing_id"]) or {}
                return self._json_response(HTTPStatus.CREATED, {"bid": bid, "matched": bool(matched), "sale": matched})

            if path == "/asks":
                ask = _validate_ask(payload)
                listings = _load_json(LISTINGS_FILE, [])
                listing = next((item for item in listings if item.get("id") == ask["listing_id"]), None)
                if listing is None:
                    raise ValidationError("listing_id does not exist")
                asks = _load_json(ASKS_FILE, [])
                ask["id"] = _next_id("ask", asks)
                asks.append(ask)
                _save_json(ASKS_FILE, asks)
                matched = _try_match(ask["listing_id"]) or {}
                return self._json_response(HTTPStatus.CREATED, {"ask": ask, "matched": bool(matched), "sale": matched})

            if path == "/execute/buy_now":
                required = ["listing_id", "buyer_id", "buyer_btc_address"]
                missing = [k for k in required if k not in payload]
                if missing:
                    raise ValidationError(f"Missing fields: {', '.join(missing)}")
                if not BTC_ADDR_RE.match(str(payload["buyer_btc_address"])):
                    raise ValidationError("buyer_btc_address does not appear valid")
                asks = _load_json(ASKS_FILE, [])
                best_ask = _best_open_ask(asks, payload["listing_id"])        
                if not best_ask:
                    raise ValidationError("No open asks for this listing")
                # Create a bid at best ask to match immediately
                bids = _load_json(BIDS_FILE, [])
                bid = {
                    "id": _next_id("bid", bids),
                    "listing_id": payload["listing_id"],
                    "buyer_id": payload["buyer_id"],
                    "bid_btc": best_ask["ask_btc"],
                    "buyer_btc_address": payload["buyer_btc_address"],
                    "status": "open",
                }
                bids.append(bid)
                _save_json(BIDS_FILE, bids)
                matched = _try_match(payload["listing_id"]) or {}
                return self._json_response(HTTPStatus.CREATED, {"sale": matched})

            if path == "/execute/sell_now":
                required = ["listing_id", "seller_id", "seller_btc_address"]
                missing = [k for k in required if k not in payload]
                if missing:
                    raise ValidationError(f"Missing fields: {', '.join(missing)}")
                if not BTC_ADDR_RE.match(str(payload["seller_btc_address"])):
                    raise ValidationError("seller_btc_address does not appear valid")
                bids = _load_json(BIDS_FILE, [])
                best_bid = _best_open_bid(bids, payload["listing_id"])        
                if not best_bid:
                    raise ValidationError("No open bids for this listing")
                asks = _load_json(ASKS_FILE, [])
                ask = {
                    "id": _next_id("ask", asks),
                    "listing_id": payload["listing_id"],
                    "seller_id": payload["seller_id"],
                    "ask_btc": best_bid["bid_btc"],
                    "seller_btc_address": payload["seller_btc_address"],
                    "status": "open",
                }
                asks.append(ask)
                _save_json(ASKS_FILE, asks)
                matched = _try_match(payload["listing_id"]) or {}
                return self._json_response(HTTPStatus.CREATED, {"sale": matched})
            if path == "/sales/settle":
                required = ["listing_id", "offer_id", "btc_txid"]
                missing = [k for k in required if k not in payload]
                if missing:
                    raise ValidationError(f"Missing fields: {', '.join(missing)}")

                listings = _load_json(LISTINGS_FILE, [])
                offers = _load_json(OFFERS_FILE, [])
                listing = next((item for item in listings if item.get("id") == payload["listing_id"]), None)
                if listing is None:
                    raise ValidationError("listing_id does not exist")
                if listing.get("status") not in {"open", "pending"}:
                    raise ValidationError("listing is not available to settle")

                offer = next((item for item in offers if item.get("id") == payload["offer_id"]), None)
                if offer is None:
                    raise ValidationError("offer_id does not exist")
                if offer.get("listing_id") != payload["listing_id"]:
                    raise ValidationError("offer_id does not belong to listing_id")
                if offer.get("status") != "pending":
                    raise ValidationError("offer is not pending")

                sales = _load_json(SALES_FILE, [])
                sale = {
                    "id": _next_id("sal", sales),
                    "listing_id": payload["listing_id"],
                    "offer_id": payload["offer_id"],
                    "btc_txid": payload["btc_txid"],
                    "status": "settled",
                }
                sales.append(sale)

                listing["status"] = "settled"
                offer["status"] = "accepted"
                for sibling_offer in offers:
                    if (
                        sibling_offer.get("listing_id") == payload["listing_id"]
                        and sibling_offer.get("id") != payload["offer_id"]
                        and sibling_offer.get("status") == "pending"
                    ):
                        sibling_offer["status"] = "declined"

                _save_json(SALES_FILE, sales)
                _save_json(LISTINGS_FILE, listings)
                _save_json(OFFERS_FILE, offers)
                return self._json_response(HTTPStatus.CREATED, sale)

            if path == "/sales/settle_matched":
                required = ["sale_id", "btc_txid"]
                missing = [k for k in required if k not in payload]
                if missing:
                    raise ValidationError(f"Missing fields: {', '.join(missing)}")
                sales = _load_json(SALES_FILE, [])
                sale = next((s for s in sales if s.get("id") == payload["sale_id"]), None)
                if sale is None:
                    raise ValidationError("sale_id does not exist")
                if sale.get("status") != "matched":
                    raise ValidationError("sale is not in matched state")
                listings = _load_json(LISTINGS_FILE, [])
                listing = next((item for item in listings if item.get("id") == sale.get("listing_id")), None)
                if listing is None:
                    raise ValidationError("listing for sale not found")
                sale["btc_txid"] = payload["btc_txid"]
                sale["status"] = "settled"
                listing["status"] = "settled"
                _save_json(SALES_FILE, sales)
                _save_json(LISTINGS_FILE, listings)
                return self._json_response(HTTPStatus.CREATED, sale)

            return self._json_response(HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except ValidationError as exc:
            return self._json_response(HTTPStatus.BAD_REQUEST, {"error": exc.message})


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for file_path in (LISTINGS_FILE, OFFERS_FILE, SALES_FILE, BIDS_FILE, ASKS_FILE):
        if not file_path.exists():
            _save_json(file_path, [])

    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print("P2P Cars API listening on http://0.0.0.0:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
