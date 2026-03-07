from pathlib import Path

from src.p2p_cars_api import (
    ValidationError,
    _content_type,
    _default_demo_data,
    _next_id,
    _validate_listing,
    _validate_offer,
)


def test_validate_listing_ok():
    payload = {
        "seller_id": "user_1",
        "vin": "1HGCM82633A004352",
        "make": "Honda",
        "model": "Accord",
        "year": 2010,
        "mileage": 120000,
        "price_btc": 0.1,
        "seller_btc_address": "bc1qqqg8n0lyqv6gm5fd4z58xm8qnn6l5yr4mj57d0",
        "escrow_required": True,
    }
    out = _validate_listing(payload)
    assert out["vin"] == "1HGCM82633A004352"
    assert out["status"] == "open"


def test_validate_listing_bad_vin():
    payload = {
        "seller_id": "user_1",
        "vin": "BAD",
        "make": "Honda",
        "model": "Accord",
        "year": 2010,
        "mileage": 120000,
        "price_btc": 0.1,
        "seller_btc_address": "bc1qqqg8n0lyqv6gm5fd4z58xm8qnn6l5yr4mj57d0",
        "escrow_required": True,
    }
    try:
        _validate_listing(payload)
        raise AssertionError("Expected ValidationError")
    except ValidationError as exc:
        assert "vin" in exc.message.lower()


def test_validate_offer_ok():
    payload = {
        "listing_id": "lst_00001",
        "buyer_id": "user_2",
        "offered_btc": 0.2,
        "buyer_btc_address": "bc1qqqg8n0lyqv6gm5fd4z58xm8qnn6l5yr4mj57d0",
    }
    out = _validate_offer(payload)
    assert out["status"] == "pending"


def test_content_types():
    assert _content_type(Path("index.html")).startswith("text/html")
    assert _content_type(Path("styles.css")).startswith("text/css")
    assert _content_type(Path("app.js")).startswith("application/javascript")


def test_next_id_skips_non_numeric_and_uses_max_numeric_suffix():
    items = [
        {"id": "lst_00002"},
        {"id": "lst_bad"},
        {"id": "lst_00011"},
        {"id": "different_00099"},
    ]
    assert _next_id("lst", items) == "lst_00012"


def test_default_demo_data_has_seed_records():
    listings, offers, sales = _default_demo_data()
    assert len(listings) >= 2
    assert len(offers) >= 1
    assert len(sales) >= 1
