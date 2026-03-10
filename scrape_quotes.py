#!/usr/bin/env python3
"""Build a quote index for public posts on https://lonisamari.blog/."""

from __future__ import annotations

import argparse
import json
import logging
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple
from urllib.parse import urldefrag, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

SOURCE_URL = "https://lonisamari.blog/"
USER_AGENT = "LonisaQuoteIndexer/1.0 (+public quote indexing)"
DEFAULT_TIMEOUT = 20
DEFAULT_RATE_LIMIT = 1.0
DEFAULT_MAX_PAGES = 500
CACHE_FILE = Path(".cache_pages.json")

SKIP_PATTERNS = ["/wp-admin", "/wp-login", "/feed", "?s=", "/search", "#comment", "/comment", "/portfolio", "/shop"]
POST_URL_HINT = re.compile(r"/\d{4}/\d{2}(?:/\d{2})?/")
WS_RE = re.compile(r"\s+")

TAG_RULES = {
    "jesus": ["jesus", "christ", "savior"],
    "faith": ["faith", "god", "prayer", "grace", "church", "scripture", "bible"],
    "family": ["family", "home", "husband", "wife", "parents", "siblings"],
    "motherhood": ["mother", "mom", "motherhood", "mama"],
    "children": ["child", "children", "kid", "kids", "daughter", "son", "baby"],
    "marriage": ["marriage", "married", "spouse", "husband", "wife"],
    "grief": ["grief", "loss", "mourning", "sadness", "funeral"],
    "healing": ["healing", "heal", "restored", "recovery"],
    "hope": ["hope", "promise", "future", "light"],
    "resilience": ["endure", "persevere", "strength", "resilient", "press on"],
    "creativity": ["create", "creative", "writing", "story", "art"],
    "work": ["work", "job", "career", "calling", "business"],
    "money": ["money", "budget", "debt", "finance", "income"],
    "identity": ["identity", "purpose", "worth", "who i am"],
    "style": ["style", "fashion", "outfit", "wardrobe"],
    "adventure": ["adventure", "travel", "journey", "trip", "explore"],
    "encouragement": ["encourage", "encouragement", "inspire", "uplift"],
    "discipline": ["discipline", "habit", "routine", "practice", "consistency"],
    "wisdom": ["wisdom", "wise", "discernment", "understanding", "learned"],
    "funny": ["funny", "laugh", "hilarious", "joke", "lol"],
}


@dataclass
class PostContent:
    title: str
    url: str
    date: Optional[str]
    categories: List[str]
    paragraphs: List[str]


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: Set[str] = set()

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.add(href.strip())


class PostParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.in_title = False
        self.capture_stack: List[str] = []
        self.current_text: List[str] = []
        self.paragraphs: List[str] = []
        self.date: Optional[str] = None
        self.categories: Set[str] = set()
        self.current_anchor_text: List[str] = []
        self.current_anchor_attrs: Dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        classes = ad.get("class", "").lower()

        if tag == "h1" and ("entry-title" in classes or not self.title):
            self.in_title = True
        if tag == "title" and not self.title:
            self.in_title = True

        if tag in {"p", "blockquote"}:
            self.capture_stack.append(tag)
            self.current_text = []

        if tag == "time" and ad.get("datetime") and not self.date:
            self.date = ad["datetime"][:10]

        if tag == "meta" and ad.get("property") == "article:published_time" and ad.get("content") and not self.date:
            self.date = ad["content"][:10]

        if tag == "a":
            self.current_anchor_attrs = ad
            self.current_anchor_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"h1", "title"}:
            self.in_title = False

        if tag in {"p", "blockquote"} and self.capture_stack:
            text = normalize_space(" ".join(self.current_text))
            if len(text) >= 40 and not text.lower().startswith(("share", "subscribe", "leave a comment")):
                self.paragraphs.append(text)
            self.capture_stack.pop()
            self.current_text = []

        if tag == "a" and self.current_anchor_attrs:
            rel = self.current_anchor_attrs.get("rel", "").lower()
            cls = self.current_anchor_attrs.get("class", "").lower()
            txt = normalize_space(" ".join(self.current_anchor_text)).lower()
            if txt and ("category" in rel or "category" in cls or "cat-link" in cls):
                self.categories.add(txt)
            self.current_anchor_attrs = {}
            self.current_anchor_text = []

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self.in_title and len(self.title) < 200:
            self.title = (self.title + " " + text).strip()
        if self.capture_stack:
            self.current_text.append(text)
        if self.current_anchor_attrs:
            self.current_anchor_text.append(text)


def normalize_space(text: str) -> str:
    return WS_RE.sub(" ", unescape(text)).strip()


def normalize_url(url: str) -> str:
    p = urlparse(url)
    path = re.sub(r"/+", "/", p.path or "/")
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return urlunparse((p.scheme.lower() or "https", p.netloc.lower(), path, "", p.query, ""))


def load_cache() -> Dict[str, str]:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(cache: Dict[str, str]) -> None:
    CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")


def allowed_by_robots(rp: Optional[RobotFileParser], url: str) -> bool:
    if rp is None:
        return True
    return rp.can_fetch(USER_AGENT, url)


def fetch_url(url: str, timeout: int, rate_limit: float, cache: Dict[str, str], use_cache: bool) -> Optional[str]:
    if use_cache and url in cache:
        return cache[url]
    time.sleep(rate_limit)
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "text/html" not in content_type:
                return None
            html = resp.read().decode("utf-8", errors="ignore")
            cache[url] = html
            return html
    except Exception as exc:
        logging.warning("Failed %s: %s", url, exc)
        return None


def discover_links(current_url: str, html: str, domain: str) -> Set[str]:
    parser = LinkParser()
    parser.feed(html)
    out = set()
    for link in parser.links:
        abs_url = urljoin(current_url, link)
        abs_url, _ = urldefrag(abs_url)
        p = urlparse(abs_url)
        if p.scheme not in {"http", "https"}:
            continue
        if p.netloc.lower() != domain:
            continue
        norm = normalize_url(abs_url)
        if any(s in norm for s in SKIP_PATTERNS):
            continue
        out.add(norm)
    return out


def is_probable_post(url: str, html: str) -> bool:
    score = 0
    low = html.lower()
    if POST_URL_HINT.search(url):
        score += 3
    if "<article" in low:
        score += 2
    if "entry-content" in low or "post-content" in low:
        score += 2
    if "article:published_time" in low or "<time" in low:
        score += 1
    if "comment-respond" in low or "id=\"comments\"" in low:
        score += 1
    text_only = re.sub(r"<[^>]+>", " ", low)
    if len(text_only) > 1500:
        score += 1
    return score >= 4


def extract_post_content(url: str, html: str) -> Optional[PostContent]:
    parser = PostParser()
    parser.feed(html)

    canonical_match = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', html, re.I)
    canonical_url = normalize_url(canonical_match.group(1)) if canonical_match else url

    title = normalize_space(parser.title)
    if not title:
        m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
        title = normalize_space(m.group(1)) if m else canonical_url

    paragraphs = parser.paragraphs
    if len(paragraphs) < 2:
        # fallback rough paragraph extraction
        paragraphs = [normalize_space(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", html, re.I | re.S)]
        paragraphs = [re.sub(r"<[^>]+>", "", p) for p in paragraphs]
        paragraphs = [p for p in paragraphs if len(p) >= 40]

    if sum(len(p) for p in paragraphs) < 250:
        return None

    categories = sorted({c for c in parser.categories if c and len(c) < 40})
    return PostContent(title=title, url=canonical_url, date=parser.date, categories=categories, paragraphs=paragraphs)


def score_quote_candidate(text: str) -> float:
    low = text.lower()
    words = re.findall(r"\b\w+\b", low)
    wc = len(words)
    if wc < 12:
        return -10.0
    score = 0.0
    score += 2.5 if 16 <= wc <= 75 else (1.0 if wc <= 120 else -1.0)
    if re.search(r"[.!?][\"')\]]?$", text.strip()):
        score += 1.0
    for term in ["god", "jesus", "faith", "hope", "healing", "wisdom", "love", "family"]:
        if term in low:
            score += 0.7
    if any(t in low for t in ["subscribe", "share", "click", "comment below"]):
        score -= 4.0
    score += len(set(words)) / max(wc, 1)
    return score


def extract_quotes(paragraphs: Sequence[str], limit: int = 3) -> List[str]:
    candidates: List[str] = []
    for i, p in enumerate(paragraphs):
        candidates.append(p)
        if i + 1 < len(paragraphs):
            combo = f"{p} {paragraphs[i+1]}"
            if len(combo) <= 700:
                candidates.append(combo)

    scored = sorted(((score_quote_candidate(c), c) for c in candidates), reverse=True)
    selected: List[str] = []
    seen: Set[str] = set()
    for score, quote in scored:
        key = re.sub(r"\W+", "", quote.lower())
        if key in seen or score < 1.7:
            continue
        selected.append(quote.strip())
        seen.add(key)
        if len(selected) == limit:
            break
    return selected


def assign_tags(quote: str, categories: Sequence[str]) -> List[str]:
    low = quote.lower()
    tags: Set[str] = set()
    for c in categories:
        if c in TAG_RULES:
            tags.add(c)
        if c == "kids":
            tags.add("children")
    for tag, terms in TAG_RULES.items():
        if any(t in low for t in terms):
            tags.add(tag)
    if "jesus" in tags:
        tags.add("faith")
    if "motherhood" in tags or "children" in tags:
        tags.add("family")
    if not tags:
        tags.add("encouragement")
    return sorted(tags)[:8]


def render_markdown(payload: dict) -> str:
    posts = payload["posts"]
    total_quotes = sum(len(p["quotes"]) for p in posts)
    fewer = sum(1 for p in posts if len(p["quotes"]) < 3)
    tag_index: Dict[str, List[Tuple[str, str, str]]] = defaultdict(list)

    for post in posts:
        for quote in post["quotes"]:
            preview = quote["text"][:100] + ("..." if len(quote["text"]) > 100 else "")
            for tag in quote["tags"]:
                tag_index[tag].append((post["title"], post["url"], preview))

    lines = [
        "# Lonisa Mari Quote Index",
        "",
        f"Generated on: {payload['generated_at'][:10]}",
        f"Source: {payload['source']}",
        "",
        "## Summary",
        f"- Total posts processed: {len(posts)}",
        f"- Total quotes extracted: {total_quotes}",
        f"- Posts with fewer than 3 quotes: {fewer}",
        "",
        "## Tag Index",
        "",
    ]

    for tag in sorted(tag_index):
        lines.append(f"### {tag}")
        for title, url, preview in tag_index[tag]:
            lines.append(f'- [{title}]({url}) — "{preview}"')
        lines.append("")

    lines += ["## Quotes by Post", ""]
    for post in posts:
        lines += [
            f"### {post['title']}",
            f"- URL: {post['url']}",
            f"- Date: {post['date'] or 'unknown'}",
            f"- Categories: {', '.join(post['categories']) if post['categories'] else 'none'}",
            "- Quotes:",
        ]
        for idx, quote in enumerate(post["quotes"], start=1):
            q = quote["text"].replace('"', '\\"')
            lines.append(f'  {idx}. "{q}"')
            lines.append(f"     - Tags: {', '.join(quote['tags'])}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def export_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def crawl_and_extract(source: str, max_pages: int, timeout: int, rate_limit: float, use_cache: bool) -> dict:
    domain = urlparse(source).netloc.lower()
    rp: Optional[RobotFileParser] = RobotFileParser(urljoin(source, "/robots.txt"))
    try:
        rp.read()
    except Exception as exc:
        logging.warning("Could not read robots.txt; continuing with fail-open policy: %s", exc)
        rp = None

    cache = load_cache() if use_cache else {}
    queue = deque([normalize_url(source)])
    visited: Set[str] = set()
    candidates: Set[str] = set()

    while queue and len(visited) < max_pages:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)

        if not allowed_by_robots(rp, url):
            logging.info("Blocked by robots.txt: %s", url)
            continue

        html = fetch_url(url, timeout, rate_limit, cache, use_cache)
        if not html:
            continue

        logging.info("Crawled: %s", url)
        for link in discover_links(url, html, domain):
            if link not in visited:
                queue.append(link)

        if is_probable_post(url, html):
            candidates.add(url)

    logging.info("Pages crawled: %s", len(visited))
    logging.info("Candidate post URLs found: %s", len(candidates))

    posts: List[dict] = []
    for url in sorted(candidates):
        html = fetch_url(url, timeout, rate_limit, cache, use_cache)
        if not html:
            continue
        post = extract_post_content(url, html)
        if not post:
            continue

        quotes = extract_quotes(post.paragraphs, limit=3)
        quote_items = []
        dedupe: Set[str] = set()
        for q in quotes:
            key = re.sub(r"\W+", "", q.lower())
            if not key or key in dedupe:
                continue
            dedupe.add(key)
            quote_items.append({"text": q, "tags": assign_tags(q, post.categories)})

        if len(quote_items) < 3:
            logging.info("Fewer than 3 quotes found for %s", post.url)

        posts.append(
            {
                "title": post.title,
                "url": post.url,
                "date": post.date,
                "categories": post.categories,
                "quotes": quote_items,
            }
        )

    unique = {p["url"]: p for p in posts}
    posts = sorted(unique.values(), key=lambda p: p["date"] or "")

    if use_cache:
        save_cache(cache)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "posts": posts,
    }


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Scrape lonisamari.blog and build quote indexes")
    ap.add_argument("--source", default=SOURCE_URL)
    ap.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    ap.add_argument("--rate-limit", type=float, default=DEFAULT_RATE_LIMIT)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--markdown-output", default="quotes_index.md")
    ap.add_argument("--json-output", default="quotes_index.json")
    ap.add_argument("--log-level", default="INFO")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format="%(levelname)s: %(message)s")

    payload = crawl_and_extract(
        source=args.source,
        max_pages=args.max_pages,
        timeout=args.timeout,
        rate_limit=args.rate_limit,
        use_cache=not args.no_cache,
    )

    if args.dry_run:
        logging.info("Dry-run complete: %s posts", len(payload["posts"]))
        return

    Path(args.markdown_output).write_text(render_markdown(payload), encoding="utf-8")
    export_json(Path(args.json_output), payload)
    logging.info("Confirmed posts: %s", len(payload["posts"]))
    logging.info("Wrote %s and %s", args.markdown_output, args.json_output)


if __name__ == "__main__":
    main()
