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
from urllib.parse import urlparse
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LISTINGS_FILE = DATA_DIR / "listings.json"
OFFERS_FILE = DATA_DIR / "offers.json"
SALES_FILE = DATA_DIR / "sales.json"
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
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


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


def _content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".html":
        return "text/html; charset=utf-8"
    if suffix == ".css":
        return "text/css; charset=utf-8"
    if suffix == ".js":
        return "application/javascript; charset=utf-8"
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

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            return self._json_response(HTTPStatus.OK, {"ok": True})

        if path == "/listings":
            listings = _load_json(LISTINGS_FILE, [])
            return self._json_response(HTTPStatus.OK, listings)

        if path == "/offers":
            offers = _load_json(OFFERS_FILE, [])
            return self._json_response(HTTPStatus.OK, offers)

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
            self.wfile.write(body)
            return

        return self._json_response(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            payload = self._read_json_body()
            path = urlparse(self.path).path
            if path == "/listings":
                listing = _validate_listing(payload)
                listings = _load_json(LISTINGS_FILE, [])
                listing["id"] = f"lst_{len(listings) + 1:05d}"
                listings.append(listing)
                _save_json(LISTINGS_FILE, listings)
                return self._json_response(HTTPStatus.CREATED, listing)

            if path == "/offers":
                offer = _validate_offer(payload)
                offers = _load_json(OFFERS_FILE, [])
                offer["id"] = f"off_{len(offers) + 1:05d}"
                offers.append(offer)
                _save_json(OFFERS_FILE, offers)
                return self._json_response(HTTPStatus.CREATED, offer)

            if path == "/sales/settle":
                required = ["listing_id", "offer_id", "btc_txid"]
                missing = [k for k in required if k not in payload]
                if missing:
                    raise ValidationError(f"Missing fields: {', '.join(missing)}")

                sales = _load_json(SALES_FILE, [])
                sale = {
                    "id": f"sal_{len(sales) + 1:05d}",
                    "listing_id": payload["listing_id"],
                    "offer_id": payload["offer_id"],
                    "btc_txid": payload["btc_txid"],
                    "status": "settled",
                }
                sales.append(sale)
                _save_json(SALES_FILE, sales)
                return self._json_response(HTTPStatus.CREATED, sale)

            return self._json_response(HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except ValidationError as exc:
            return self._json_response(HTTPStatus.BAD_REQUEST, {"error": exc.message})


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for file_path in (LISTINGS_FILE, OFFERS_FILE, SALES_FILE):
        if not file_path.exists():
            _save_json(file_path, [])

    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print("P2P Cars API listening on http://0.0.0.0:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
