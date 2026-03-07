let globalListingsData = [];
let showOnlySaved = false;
let isWalletConnected = false;
let savedVehicles = [];
let globalBids = [];
let globalAsks = [];
let bestBidByListing = new Map();
let bestAskByListing = new Map();
let userProfile = null;
let promoTimer = null;

try {
  const persisted = localStorage.getItem("savedVehicles");
  savedVehicles = persisted ? JSON.parse(persisted) : [];
  if (!Array.isArray(savedVehicles)) {
    savedVehicles = [];
  }
} catch {
  savedVehicles = [];
}

try {
  const u = localStorage.getItem("userProfile");
  userProfile = u ? JSON.parse(u) : null;
} catch { userProfile = null; }

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.remove("active");
  document.body.style.overflow = "";
}

document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal(overlay.id);
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach((modal) => closeModal(modal.id));
  }
});

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = document.createElement("span");
  icon.textContent = type === "success" ? "✓" : "✕";

  const text = document.createElement("span");
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#039;";
  });
}

function formatBTC(num) {
  return parseFloat(num).toFixed(8).replace(/\.?0+$/, "");
}

function renderResultCount(count, total) {
  const el = document.getElementById("results-count");
  if (!el) return;
  el.textContent = `${count} shown / ${total} total`;
}

// ---------- Promo banner ----------
const PROMO_SLIDES = [
  { img: "/banner_1.svg", kicker: "New this week", title: "Premium inventory. Bitcoin-native settlement.", sub: "Browse verified listings, bid or buy now, and settle with confidence.", ctaText: "Browse Inventory", ctaHref: "#marketplace" },
  { img: "/banner_2.svg", kicker: "For sellers", title: "List in minutes. Get real bids.", sub: "Post a vehicle and let the orderbook work for you.", ctaText: "List Vehicle", ctaHref: "#" },
  { img: "/banner_3.svg", kicker: "For partners", title: "Advertise to intent-rich buyers.", sub: "Finance, insurance, and accessories that fit the moment.", ctaText: "Contact Sales", ctaHref: "#" },
];

function initPromo() {
  if (localStorage.getItem("hidePromo") === "1") return;
  const wrap = document.getElementById("promo");
  if (!wrap) return;
  const img = document.getElementById("promo-image");
  const kicker = document.getElementById("promo-kicker");
  const title = document.getElementById("promo-title");
  const sub = document.getElementById("promo-sub");
  const cta = document.getElementById("promo-cta");
  const dots = document.getElementById("promo-dots");
  if (!img || !kicker || !title || !sub || !cta || !dots) return;

  let idx = 0;
  function render() {
    const s = PROMO_SLIDES[idx];
    img.src = s.img;
    kicker.textContent = s.kicker;
    title.textContent = s.title;
    sub.textContent = s.sub;
    cta.textContent = s.ctaText;
    if (s.ctaHref && s.ctaHref !== "#") cta.href = s.ctaHref; else cta.href = "#marketplace";
    dots.innerHTML = PROMO_SLIDES.map((_, i) => `<button class="promo-dot ${i===idx? 'active':''}" aria-label="Slide ${i+1}" data-i="${i}"></button>`).join("");
    dots.querySelectorAll(".promo-dot").forEach(b => b.addEventListener("click", () => { idx = Number(b.dataset.i); render(); restart(); }));
    wrap.classList.remove("hidden");
  }
  function next() { idx = (idx + 1) % PROMO_SLIDES.length; render(); }
  function restart() { clearInterval(promoTimer); promoTimer = setInterval(next, 6000); }
  render();
  promoTimer = setInterval(next, 6000);
}

window.dismissPromo = function () {
  const wrap = document.getElementById("promo");
  if (wrap) wrap.classList.add("hidden");
  localStorage.setItem("hidePromo", "1");
  clearInterval(promoTimer);
};

function updateFiltersBadge() {
  const btn = document.querySelector('.show-filters-mobile');
  if (!btn) return;
  let count = 0;
  ["make", "model", "body_style", "drivetrain", "transmission", "exterior_color"].forEach((k) => (count += filtersState[k]?.size || 0));
  ["priceMin", "priceMax", "yearMin", "yearMax", "mileageMin", "mileageMax"].forEach((k) => { if (String(filtersState[k] || "").trim() !== "") count += 1; });
  btn.textContent = count ? `Filters (${count})` : "Filters";
}

function updateUserUI() {
  const btn = document.getElementById("user-btn");
  const banner = document.getElementById("welcome-back");
  const countSaved = savedVehicles.length;
  const userId = userProfile?.id || null;
  const bidsCount = userId ? globalBids.filter((b) => b.buyer_id === userId && b.status === "open").length : 0;
  const asksCount = userId ? globalAsks.filter((a) => a.seller_id === userId && a.status === "open").length : 0;
  if (btn) btn.textContent = userProfile ? `Hi, ${userProfile.name}` : "Sign in";
  if (banner) {
    if (userProfile) {
      banner.innerHTML = `
        <div class="welcome-left">
          <h3 class="welcome-title">Welcome back, <strong>${escapeHtml(userProfile.name)}</strong></h3>
          <div class="welcome-stats">
            <div class="stat-chip" aria-label="Saved vehicles"><span class="stat-label">Saved</span><span class="stat-value">${countSaved}</span></div>
            <div class="stat-chip" aria-label="Open bids"><span class="stat-label">Open Bids</span><span class="stat-value">${bidsCount}</span></div>
            <div class="stat-chip" aria-label="Open asks"><span class="stat-label">Open Asks</span><span class="stat-value">${asksCount}</span></div>
          </div>
        </div>
        <div class="welcome-actions">
          <button class="btn btn-secondary" onclick="toggleSavedFilter()">View Saved</button>
          <button class="btn btn-secondary" onclick="openModal('listing-modal')">List Vehicle</button>
        </div>`;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }
  updateFiltersBadge();
}

window.handleUserButton = function () {
  if (userProfile) {
    localStorage.removeItem("userProfile");
    userProfile = null;
    updateUserUI();
    showToast("Signed out", "success");
  } else {
    openModal("signin-modal");
  }
};

document.getElementById("signin-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const name = form.display_name.value.trim();
  if (!name) return;
  userProfile = { id: name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"), name };
  localStorage.setItem("userProfile", JSON.stringify(userProfile));
  closeModal("signin-modal");
  updateUserUI();
  showToast(`Hi ${name}!`, "success");
});

// ---------- Carvana-like Search + Filters ----------
const filtersState = {
  make: new Set(),
  model: new Set(),
  body_style: new Set(),
  drivetrain: new Set(),
  transmission: new Set(),
  exterior_color: new Set(),
  yearMin: "",
  yearMax: "",
  mileageMax: "",
  priceMin: "",
  priceMax: "",
};

function uniqueValues(data, key) {
  return Array.from(new Set(data.map((d) => d[key]).filter(Boolean))).sort();
}

function computeFacets() {
  const base = globalListingsData;
  const makes = uniqueValues(base, "make");
  const models = uniqueValues(
    filtersState.make.size ? base.filter((d) => filtersState.make.has(d.make)) : base,
    "model"
  );
  return {
    make: makes,
    model: models,
    body_style: uniqueValues(base, "body_style"),
    drivetrain: uniqueValues(base, "drivetrain"),
    transmission: uniqueValues(base, "transmission"),
    exterior_color: uniqueValues(base, "exterior_color"),
  };
}

function checkboxList(name, values) {
  return `
    <div class="filters-section">
      <h4>${escapeHtml(name)}</h4>
      <div class="checkbox-list">
        ${values
          .map((v) => {
            const key = name.toLowerCase().replace(/\s+/g, "_");
            const checked = filtersState[key]?.has(v) ? "checked" : "";
            const id = `${key}-${v}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return `<label for="${id}"><input id="${id}" type="checkbox" data-key="${key}" value="${escapeHtml(
              v
            )}" ${checked}/> <span>${escapeHtml(v)}</span></label>`;
          })
          .join("")}
      </div>
    </div>`;
}

function numberInputs(label, minKey, maxKey, placeholderMin, placeholderMax, step = "any") {
  const minVal = filtersState[minKey] || "";
  const maxVal = filtersState[maxKey] || "";
  return `
    <div class="filters-section">
      <h4>${escapeHtml(label)}</h4>
      <div class="input-row">
        <input type="number" step="${step}" placeholder="${escapeHtml(
    placeholderMin
  )}" value="${escapeHtml(minVal)}" data-key="${minKey}" />
        <input type="number" step="${step}" placeholder="${escapeHtml(
    placeholderMax
  )}" value="${escapeHtml(maxVal)}" data-key="${maxKey}" />
      </div>
    </div>`;
}

function renderFilters(targetId = "filters-panel") {
  const facets = computeFacets();
  const html = [
    checkboxList("Make", facets.make),
    checkboxList("Model", facets.model),
    checkboxList("Body Style", facets.body_style),
    checkboxList("Drivetrain", facets.drivetrain),
    checkboxList("Transmission", facets.transmission),
    checkboxList("Exterior Color", facets.exterior_color),
    numberInputs("Price (BTC)", "priceMin", "priceMax", "Min", "Max", "0.00000001"),
    numberInputs("Year", "yearMin", "yearMax", "From", "To", "1"),
    numberInputs("Mileage (mi)", "mileageMin", "mileageMax", "From", "To", "1"),
  ].join("");

  const panel = document.getElementById(targetId);
  if (panel) {
    panel.innerHTML = html;
    // attach listeners
    panel.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.addEventListener("change", () => {
        const key = el.getAttribute("data-key");
        if (!filtersState[key]) filtersState[key] = new Set();
        el.checked ? filtersState[key].add(el.value) : filtersState[key].delete(el.value);
        renderFilters(targetId); // refresh dependent lists (e.g., models)
        renderActiveChips();
        renderListings();
      });
    });
    panel.querySelectorAll('input[type="number"]').forEach((el) => {
      el.addEventListener("input", () => {
        const key = el.getAttribute("data-key");
        filtersState[key] = el.value;
        renderActiveChips();
        renderListings();
      });
    });
  }

  // Also sync into modal body if exists
  const modalBody = document.getElementById("filters-modal-body");
  if (modalBody && targetId === "filters-panel") {
    modalBody.innerHTML = html;
    modalBody.querySelectorAll('input[type="checkbox"], input[type="number"]').forEach((node) => {
      const clone = node;
      clone.addEventListener("change", () => {
        const key = clone.getAttribute("data-key");
        if (clone.type === "checkbox") {
          if (!filtersState[key]) filtersState[key] = new Set();
          clone.checked ? filtersState[key].add(clone.value) : filtersState[key].delete(clone.value);
        } else {
          filtersState[key] = clone.value;
        }
        renderFilters("filters-panel");
        renderActiveChips();
        renderListings();
      });
    });
  }
}

function clearAllFilters() {
  filtersState.make.clear();
  filtersState.model.clear();
  filtersState.body_style.clear();
  filtersState.drivetrain.clear();
  filtersState.transmission.clear();
  filtersState.exterior_color.clear();
  filtersState.yearMin = filtersState.yearMax = filtersState.priceMin = filtersState.priceMax = filtersState.mileageMin = filtersState.mileageMax = "";
  renderFilters();
  renderActiveChips();
  renderListings();
}

function renderActiveChips() {
  const el = document.getElementById("active-chips");
  if (!el) return;
  const chips = [];
  ["make", "model", "body_style", "drivetrain", "transmission", "exterior_color"].forEach((k) => {
    filtersState[k].forEach((v) => {
      chips.push({ key: k, label: `${k.replace(/_/g, " ")}: ${v}`, value: v });
    });
  });
  [["priceMin", "Min ₿"], ["priceMax", "Max ₿"], ["yearMin", "Year ≥"], ["yearMax", "Year ≤"], ["mileageMin", "Mi ≥"], ["mileageMax", "Mi ≤"]].forEach(([k, prefix]) => {
    if (filtersState[k]) {
      const val = String(filtersState[k]).trim();
      if (val !== "") chips.push({ key: k, label: `${prefix} ${val}` });
    }
  });
  el.innerHTML = chips
    .map(
      (c, i) => `
      <span class="chip">
        ${escapeHtml(c.label)}
        <button aria-label="Remove filter" onclick="removeChip('${escapeHtml(c.key)}','${escapeHtml(c.value || "")}')">×</button>
      </span>`
    )
    .join("");
  updateFiltersBadge();
}

window.removeChip = function (key, value) {
  if (filtersState[key] instanceof Set) {
    if (value) filtersState[key].delete(value);
    else filtersState[key].clear();
  } else {
    filtersState[key] = "";
  }
  renderFilters();
  renderActiveChips();
  renderListings();
};

function parseQueryToFilters(q) {
  // lightweight heuristics for things like: "blue 911 2020 awd under 2 btc"
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const add = (k, v) => {
    if (filtersState[k] instanceof Set) filtersState[k].add(v);
  };
  const set = (k, v) => (filtersState[k] = v);

  const colors = new Set(["black", "white", "red", "blue", "green", "gray", "silver", "orange", "yellow"]); 
  const bodies = new Set(["sedan", "coupe", "suv", "truck", "wagon", "van", "hatchback"]);
  const drives = new Set(["awd", "4wd", "rwd", "fwd"]);
  const trans = new Set(["manual", "automatic", "dct", "pdk"]);

  tokens.forEach((t, i) => {
    if (/^(under|<|<=)$/.test(t) && tokens[i + 1]) {
      const n = parseFloat(tokens[i + 1]);
      if (!isNaN(n)) set("priceMax", n);
    }
    if (/^(over|>|>=)$/.test(t) && tokens[i + 1]) {
      const n = parseFloat(tokens[i + 1]);
      if (!isNaN(n)) set("priceMin", n);
    }
    const num = parseFloat(t);
    if (!isNaN(num)) {
      // possible year or price number next to btc
      if (num >= 1980 && num <= 2100) set("yearMin", Math.max(Number(filtersState.yearMin || 0), num));
    }
    if (t.includes("btc")) {
      const prev = parseFloat(tokens[i - 1]);
      if (!isNaN(prev)) set("priceMax", prev);
    }
    // map tokens
    if (colors.has(t)) add("exterior_color", titleCase(t));
    if (bodies.has(t)) add("body_style", titleCase(t));
    if (drives.has(t)) add("drivetrain", t.toUpperCase());
    if (trans.has(t)) add("transmission", titleCase(t));
  });
}

function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function buildSuggestionsDataset() {
  const makes = uniqueValues(globalListingsData, "make");
  const models = uniqueValues(globalListingsData, "model");
  const bodies = uniqueValues(globalListingsData, "body_style");
  const colors = uniqueValues(globalListingsData, "exterior_color");
  const quick = ["Under 1 BTC", "Low mileage", "Newer than 2020", "AWD", "Manual"];
  return { makes, models, bodies, colors, quick };
}

function renderSuggestions(q) {
  const box = document.getElementById("search-suggestions");
  if (!box) return;
  const data = buildSuggestionsDataset();
  if (!q) {
    box.innerHTML = data.quick
      .map((s) => `<div class="suggestion-item" onclick="applyQuick('${escapeHtml(s)}')">${escapeHtml(s)}</div>`) 
      .join("");
    box.classList.toggle("hidden", false);
    return;
  }
  const lower = q.toLowerCase();
  const items = [];
  data.makes.filter((m) => m.toLowerCase().startsWith(lower)).slice(0, 5).forEach((m) => items.push({ type: "Make", v: m }));
  data.models.filter((m) => m.toLowerCase().startsWith(lower)).slice(0, 5).forEach((m) => items.push({ type: "Model", v: m }));
  data.bodies.filter((b) => b && b.toLowerCase().startsWith(lower)).slice(0, 4).forEach((b) => items.push({ type: "Body", v: b }));
  data.colors.filter((c) => c && c.toLowerCase().startsWith(lower)).slice(0, 4).forEach((c) => items.push({ type: "Color", v: c }));
  if (items.length === 0) {
    box.classList.add("hidden");
    return;
  }
  box.innerHTML = items
    .map((it) => `<div class="suggestion-item" onclick="applySuggestion('${escapeHtml(it.type)}','${escapeHtml(it.v)}')">${escapeHtml(it.type)}: ${escapeHtml(it.v)}</div>`) 
    .join("");
  box.classList.remove("hidden");
}

window.onSearchInput = function () {
  const q = (document.getElementById("search-input")?.value || "").trim();
  renderSuggestions(q);
  updateFilteredState();
};

window.applyQuick = function (label) {
  if (label.includes("Under")) filtersState.priceMax = 1;
  if (label.includes("Low mileage")) filtersState.mileageMax = 15000;
  if (label.includes("Newer")) filtersState.yearMin = 2020;
  if (label.includes("AWD")) filtersState.drivetrain.add("AWD");
  if (label.includes("Manual")) filtersState.transmission.add("Manual");
  document.getElementById("search-suggestions")?.classList.add("hidden");
  renderFilters();
  renderActiveChips();
  renderListings();
};

window.applySuggestion = function (type, value) {
  const map = { Make: "make", Model: "model", Body: "body_style", Color: "exterior_color" };
  const key = map[type] || null;
  if (key) filtersState[key].add(value);
  document.getElementById("search-input").value = "";
  document.getElementById("search-suggestions")?.classList.add("hidden");
  renderFilters();
  renderActiveChips();
  renderListings();
};
function getImagePool() {
  return [
    "/car_1.png",
    "/car_2.png",
    "/photo_1.svg",
    "/photo_2.svg",
    "/photo_3.svg",
    "/photo_4.svg",
    "/photo_5.svg",
    "/photo_6.svg",
  ];
}

function pickPlaceholder(id) {
  const pool = getImagePool();
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

function getListingHeroImage(listing) {
  if (Array.isArray(listing.images) && listing.images.length > 0) return listing.images[0];
  return pickPlaceholder(listing.id || `${listing.make}-${listing.model}-${listing.year}`);
}

function getListingGallery(listing) {
  if (Array.isArray(listing.images) && listing.images.length > 0) return listing.images;
  // fallback gallery of 3 assorted placeholders
  const pool = getImagePool();
  const primary = getListingHeroImage(listing);
  const extras = pool.filter((p) => p !== primary).slice(0, 2);
  return [primary, ...extras];
}

function listingCard(listing) {
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const safeId = escapeHtml(listing.id);
  const safeTitle = escapeHtml(title);
  const safeVin = escapeHtml(listing.vin);
  const safeSeller = escapeHtml(listing.seller_id);
  const isSaved = savedVehicles.includes(listing.id);
  const imgSrc = getListingHeroImage(listing);
  const specs = [
    listing.transmission ? { k: "Trans", v: listing.transmission } : null,
    listing.drivetrain ? { k: "Drive", v: listing.drivetrain } : null,
    listing.exterior_color ? { k: "Color", v: listing.exterior_color } : null,
    listing.mileage != null ? { k: "Mileage", v: `${Number(listing.mileage).toLocaleString()} mi` } : null,
  ].filter(Boolean);

  const bestBid = bestBidByListing.get(listing.id);
  const bestAsk = bestAskByListing.get(listing.id);
  const spread = bestBid && bestAsk ? (parseFloat(bestAsk.ask_btc) - parseFloat(bestBid.bid_btc)).toFixed(4) : null;
  return `
    <article class="card listing-card" data-id="${safeId}">
      <div class="listing-image-container">
        <button class="favorite-btn ${isSaved ? "active" : ""}" onclick="toggleFavorite(event, '${safeId}')" title="Save Vehicle">
          ${isSaved ? "♥" : "♡"}
        </button>
        <img class="listing-image" loading="lazy" src="${escapeHtml(imgSrc)}" alt="${safeTitle}" />
      </div>
      <div class="listing-content">
        <div class="listing-header">
          <h3 class="listing-title">${safeTitle}</h3>
        </div>
        <div class="listing-badges">
          <span class="vin-badge" title="VIN provided">VIN: ${safeVin}</span>
          <span class="escrow-badge ${listing.escrow_required ? 'required' : 'optional'}" title="${listing.escrow_required ? 'Escrow is required' : 'Escrow is optional'}">Escrow: ${listing.escrow_required ? 'Required' : 'Optional'}</span>
        </div>

        <div class="listing-price">
          <span>₿</span> ${formatBTC(listing.price_btc)}
        </div>

        <div class="spread-row">
          <span class="spread-pill ${bestAsk ? '' : 'muted-text'}">Lowest Ask: ${bestAsk ? '₿ ' + formatBTC(bestAsk.ask_btc) : '—'}</span>
          <span class="spread-pill ${bestBid ? '' : 'muted-text'}">Highest Bid: ${bestBid ? '₿ ' + formatBTC(bestBid.bid_btc) : '—'}</span>
          ${spread !== null ? `<span class="spread-diff">Spread: ₿ ${spread}</span>` : ''}
        </div>

        <div class="listing-meta-grid">
          ${specs
            .slice(0, 3)
            .map(
              (s) => `
          <div class="meta-item">
            <span class="meta-label">${escapeHtml(s.k)}</span>
            <span class="meta-value">${escapeHtml(s.v)}</span>
          </div>`
            )
            .join("")}
        </div>

        <div class="listing-actions">
          <div class="listing-actions-row">
            ${bestAsk ? `<button class="btn btn-primary btn-full" onclick="openBuyNow('${safeId}')">Buy Now • ₿ ${formatBTC(bestAsk.ask_btc)}</button>` : `<button class="btn btn-secondary btn-full" onclick="openAskModal('${safeId}')">Place Ask</button>`}
            ${bestBid ? `<button class="btn btn-secondary btn-full" onclick="openSellNow('${safeId}')">Sell Now • ₿ ${formatBTC(bestBid.bid_btc)}</button>` : ''}
            <button class="btn btn-secondary btn-full" onclick="openBidModal('${safeId}')">Place Bid</button>
            <button class="btn btn-secondary btn-full" onclick="openDetailsModal('${safeId}')">Details</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderSkeletons() {
  const container = document.getElementById("listings");
  if (!container) return;
  const skeletonHTML = Array(3)
    .fill(`
      <div class="skeleton-card">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-text-lg"></div>
        <div class="skeleton skeleton-text-xl"></div>
        <div class="skeleton-meta-grid">
          <div class="skeleton skeleton-text-sm"></div>
          <div class="skeleton skeleton-text-sm"></div>
          <div class="skeleton skeleton-text-sm"></div>
          <div class="skeleton skeleton-text-sm"></div>
        </div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    `)
    .join("");
  container.innerHTML = skeletonHTML;
}

function updateFilteredState() {
  const query = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
  const list = document.getElementById("listings");
  if (!list) return;
  const total = list.querySelectorAll(".listing-card").length;
  let visible = 0;
  list.querySelectorAll(".listing-card").forEach((card) => {
    const textContext = card.textContent.toLowerCase();
    const id = card.getAttribute("data-id") || "";
    const matchesSearch = !query || textContext.includes(query);
    const matchesSaved = showOnlySaved ? savedVehicles.includes(id) : true;
    const shouldShow = matchesSearch && matchesSaved;
    card.style.display = shouldShow ? "flex" : "none";
    if (shouldShow) visible += 1;
  });
  const noResults = document.getElementById("no-results");
  if (noResults) noResults.classList.toggle("hidden", visible > 0 || total === 0);
  renderResultCount(visible, total);
}

window.filterListings = function () {
  updateFilteredState();
};

window.toggleWallet = function () {
  isWalletConnected = !isWalletConnected;
  const btn = document.getElementById("wallet-btn");
  if (!btn) return;

  if (isWalletConnected) {
    btn.textContent = "Wallet: Connected";
    btn.classList.add("connected");
    showToast("Wallet connected", "success");
  } else {
    btn.textContent = "Wallet: Disconnected";
    btn.classList.remove("connected");
    showToast("Wallet disconnected", "success");
  }
};

window.toggleFavorite = function (event, listingId) {
  event.stopPropagation();
  const idx = savedVehicles.indexOf(listingId);
  if (idx === -1) {
    savedVehicles.push(listingId);
    showToast("Vehicle saved", "success");
  } else {
    savedVehicles.splice(idx, 1);
    showToast("Vehicle removed from saved", "success");
  }
  localStorage.setItem("savedVehicles", JSON.stringify(savedVehicles));
  loadListings(false);
};

window.toggleSavedFilter = function () {
  showOnlySaved = !showOnlySaved;
  const btn = document.getElementById("saved-filter-btn");
  if (btn) {
    btn.textContent = showOnlySaved ? "Saved Only: On" : "Saved Only: Off";
    btn.classList.toggle("saved-filter-active", showOnlySaved);
  }
  updateFilteredState();
};

window.openDetailsModal = function (listingId) {
  const listing = globalListingsData.find((entry) => entry.id === listingId);
  if (!listing) return;
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const gallery = getListingGallery(listing);
  const monthlyBTC = ((Number(listing.price_btc) / 60) * 1.05).toFixed(4);
  const body = document.getElementById("details-modal-body");
  if (!body) return;

  body.innerHTML = `
    <div class="details-layout">
      <div>
        <div class="gallery">
          <img id="gallery-hero" class="details-image" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(title)}" />
          <div class="thumb-row">
            ${gallery
              .map(
                (src, i) => `
              <img class="thumb ${i === 0 ? "active" : ""}" src="${escapeHtml(src)}" alt="thumb ${i + 1}" onclick="swapHero('${escapeHtml(src)}', this)" />
            `
              )
              .join("")}
          </div>
        </div>
        <h2 class="details-title">${escapeHtml(title)}</h2>
        <h3 class="details-price">₿ ${formatBTC(listing.price_btc)}</h3>
        <div class="card details-card">
          <h4>Financing Snapshot</h4>
          <div class="details-row"><span>Estimated Monthly</span><strong>₿ ${monthlyBTC}</strong></div>
          <div class="details-row"><span>Terms</span><span>60 months @ 5% APR</span></div>
        </div>
      </div>
      <div>
        <div class="card details-card">
          <h4>Vehicle Data</h4>
          <div class="details-row"><span>VIN</span><span>${escapeHtml(listing.vin)}</span></div>
          <div class="details-row"><span>Mileage</span><span>${Number(listing.mileage).toLocaleString()} mi</span></div>
          <div class="details-row"><span>Seller</span><span>${escapeHtml(listing.seller_id)}</span></div>
          <div class="details-row"><span>Escrow</span><span>${listing.escrow_required ? "Required" : "Optional"}</span></div>
          ${listing.transmission ? `<div class=\"details-row\"><span>Transmission</span><span>${escapeHtml(listing.transmission)}</span></div>` : ""}
          ${listing.drivetrain ? `<div class=\"details-row\"><span>Drivetrain</span><span>${escapeHtml(listing.drivetrain)}</span></div>` : ""}
          ${listing.exterior_color ? `<div class=\"details-row\"><span>Exterior</span><span>${escapeHtml(listing.exterior_color)}</span></div>` : ""}
          ${listing.interior_color ? `<div class=\"details-row\"><span>Interior</span><span>${escapeHtml(listing.interior_color)}</span></div>` : ""}
          ${listing.body_style ? `<div class=\"details-row\"><span>Body</span><span>${escapeHtml(listing.body_style)}</span></div>` : ""}
        </div>
        <div class="card details-card">
          <h4>Settlement Readiness</h4>
          <ul class="details-list">
            <li>Title evidence required before handoff</li>
            <li>Address verification recommended out-of-band</li>
            <li>Escrow release path should be documented</li>
          </ul>
        </div>
        ${listing.description ? `
        <div class="card details-card">
          <h4>Seller Notes</h4>
          <p class="muted-text">${escapeHtml(listing.description)}</p>
        </div>` : ""}
        ${Array.isArray(listing.features) && listing.features.length ? `
        <div class="card details-card">
          <h4>Features</h4>
          <ul class="details-list">${listing.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        </div>` : ""}
        <button class="btn btn-primary btn-full" onclick="closeModal('details-modal'); openOfferModal('${escapeHtml(listing.id)}')">Proceed to Offer</button>
      </div>
    </div>
  `;
  openModal("details-modal");
  try {
    const rv = JSON.parse(localStorage.getItem("recentViewed") || "[]");
    const next = [listingId, ...rv.filter((x) => x !== listingId)].slice(0, 20);
    localStorage.setItem("recentViewed", JSON.stringify(next));
  } catch {}
};

window.swapHero = function (src, el) {
  const hero = document.getElementById("gallery-hero");
  if (hero) hero.src = src;
  document.querySelectorAll(".thumb-row .thumb").forEach((t) => t.classList.remove("active"));
  if (el) el.classList.add("active");
};

window.openOfferModal = function (listingId) {
  const listing = globalListingsData.find((entry) => entry.id === listingId);
  if (!listing) return;
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const offerId = document.getElementById("offer-listing-id");
  const offerDisplay = document.getElementById("offer-listing-display");
  const offerAmount = document.getElementById("offer-amount-input");
  if (offerId) offerId.value = listingId;
  if (offerDisplay) offerDisplay.value = `${title} (${listingId})`;
  if (offerAmount) offerAmount.value = listing.price_btc;
  openModal("offer-modal");
};

let currentSort = "recommended";

function sortListings(data) {
  const copy = [...data];
  switch (currentSort) {
    case "price_asc":
      return copy.sort((a, b) => Number(a.price_btc) - Number(b.price_btc));
    case "price_desc":
      return copy.sort((a, b) => Number(b.price_btc) - Number(a.price_btc));
    case "year_desc":
      return copy.sort((a, b) => Number(b.year) - Number(a.year));
    case "mileage_asc":
      return copy.sort((a, b) => Number(a.mileage) - Number(b.mileage));
    default:
      return copy; // recommended (API order)
  }
}

window.changeSort = function (value) {
  currentSort = value;
  renderListings();
};

function renderListings() {
  const container = document.getElementById("listings");
  if (!container) return;
  // apply filter engine then sort
  const filtered = applyFilters(globalListingsData);
  const sorted = sortListings(filtered);
  const cards = sorted.map(listingCard);
  const ads = [
    adCard(1, "/banner_1.svg", "Partner Spotlight", "Reach serious buyers with targeted placements."),
    adCard(2, "/banner_2.svg", "Sell Your Inventory", "List fleet or dealer cars effortlessly."),
    adCard(3, "/banner_3.svg", "Finance & Insurance", "Promote products buyers actually need."),
  ];
  const output = [];
  let adIdx = 0;
  for (let i = 0; i < cards.length; i++) {
    output.push(cards[i]);
    if ((i === 2 || i === 7 || i === 12) && adIdx < ads.length) output.push(ads[adIdx++]);
  }
  container.innerHTML = output.join("");
  updateFilteredState();
  renderRecentStrip();
}

async function loadListings(showSkeleton = true) {
  const container = document.getElementById("listings");
  if (!container) return;
  if (showSkeleton) renderSkeletons();

  try {
    if (showSkeleton) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Load listings + order book snapshots
    [globalListingsData, globalBids, globalAsks] = await Promise.all([
      api("/listings"),
      api("/bids"),
      api("/asks"),
    ]);

    // compute best bid/ask per listing
    bestBidByListing = new Map();
    bestAskByListing = new Map();
    for (const bid of globalBids.filter((b) => b.status === "open")) {
      const l = bid.listing_id;
      const cur = bestBidByListing.get(l);
      if (!cur || parseFloat(bid.bid_btc) > parseFloat(cur.bid_btc)) bestBidByListing.set(l, bid);
    }
    for (const ask of globalAsks.filter((a) => a.status === "open")) {
      const l = ask.listing_id;
      const cur = bestAskByListing.get(l);
      if (!cur || parseFloat(ask.ask_btc) < parseFloat(cur.ask_btc)) bestAskByListing.set(l, ask);
    }
    if (!Array.isArray(globalListingsData) || globalListingsData.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p>The network is quiet. No active listings available.</p>
        </div>
      `;
      renderResultCount(0, 0);
      return;
    }

    // parse current query into filters (one-shot helper for natural queries)
    const q = (document.getElementById("search-input")?.value || "").trim();
    if (q) parseQueryToFilters(q);
    renderFilters();
    renderActiveChips();
    renderListings();
    updateUserUI();
    initPromo();
  } catch (error) {
    showToast(error.message || "Failed to sync network data", "error");
  }
}

function adCard(slot, img, title, body) {
  return `
    <article class="card ad-card">
      <img class="ad-image" src="${escapeHtml(img)}" alt="sponsored" />
      <div class="ad-body">
        <span class="ad-badge">Sponsored</span>
        <h3>${escapeHtml(title)}</h3>
        <p class="muted-text" style="margin: 0.35rem 0 0.7rem;">${escapeHtml(body)}</p>
        <div class="listing-actions-row"><button class="btn btn-secondary btn-full" onclick="showToast('Contact sales: ads@satoshimotors.example','success')">Advertise</button></div>
      </div>
    </article>`;
}

window.openBidModal = function (listingId) {
  document.getElementById("bid-listing-id").value = listingId;
  openModal("bid-modal");
};

window.openAskModal = function (listingId) {
  document.getElementById("ask-listing-id").value = listingId;
  openModal("ask-modal");
};

window.openBuyNow = function (listingId) {
  const bestAsk = bestAskByListing.get(listingId);
  if (!bestAsk) {
    showToast("No asks available for Buy Now", "error");
    return;
  }
  document.getElementById("buynow-listing-id").value = listingId;
  openModal("buynow-modal");
};

window.openSellNow = function (listingId) {
  const bestBid = bestBidByListing.get(listingId);
  if (!bestBid) {
    showToast("No bids available for Sell Now", "error");
    return;
  }
  document.getElementById("sellnow-listing-id").value = listingId;
  openModal("sellnow-modal");
};

document.getElementById("bid-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const payload = formToJson(form);
  try {
    btn.disabled = true; btn.textContent = "Submitting...";
    await api("/bids", { method: "POST", body: JSON.stringify(payload) });
    closeModal("bid-modal"); form.reset();
    showToast("Bid placed", "success");
    await loadListings(false);
  } catch (e) { showToast(e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Submit Bid"; }
});

document.getElementById("ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const payload = formToJson(form);
  try {
    btn.disabled = true; btn.textContent = "Submitting...";
    await api("/asks", { method: "POST", body: JSON.stringify(payload) });
    closeModal("ask-modal"); form.reset();
    showToast("Ask placed", "success");
    await loadListings(false);
  } catch (e) { showToast(e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Submit Ask"; }
});

document.getElementById("buynow-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const payload = formToJson(form);
  try {
    btn.disabled = true; btn.textContent = "Matching...";
    await api("/execute/buy_now", { method: "POST", body: JSON.stringify(payload) });
    closeModal("buynow-modal"); form.reset();
    showToast("Order matched. Awaiting settlement.", "success");
    await loadListings(false);
  } catch (e) { showToast(e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Confirm Buy Now"; }
});

document.getElementById("sellnow-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const payload = formToJson(form);
  try {
    btn.disabled = true; btn.textContent = "Matching...";
    await api("/execute/sell_now", { method: "POST", body: JSON.stringify(payload) });
    closeModal("sellnow-modal"); form.reset();
    showToast("Order matched. Awaiting settlement.", "success");
    await loadListings(false);
  } catch (e) { showToast(e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Confirm Sell Now"; }
});

function renderRecentStrip() {
  const host = document.getElementById("recent-strip");
  const wrap = document.querySelector(".recently-viewed");
  if (!host || !wrap) return;
  let rv = [];
  try { rv = JSON.parse(localStorage.getItem("recentViewed") || "[]"); } catch { rv = []; }
  const items = rv.map((id) => globalListingsData.find((x) => x.id === id)).filter(Boolean).slice(0, 8);
  if (items.length === 0) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  host.innerHTML = items
    .map((l) => {
      const img = getListingHeroImage(l);
      const title = `${l.year} ${l.make} ${l.model}`;
      return `
        <div class="recent-card" onclick="openDetailsModal('${escapeHtml(l.id)}')">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" />
          <div class="rc-body">
            <h5>${escapeHtml(title)}</h5>
            <p>₿ ${formatBTC(l.price_btc)}</p>
          </div>
        </div>`;
    })
    .join("");
}

window.applyQuickPick = function (label) {
  clearAllFilters();
  switch (label) {
    case 'SUV':
      filtersState.body_style.add('SUV'); break;
    case 'Truck':
      filtersState.body_style.add('Truck'); break;
    case 'EV':
      ['Tesla','Lucid','Rivian','Nissan'].forEach((mk)=> filtersState.make.add(mk)); break;
    case 'Manual':
      filtersState.transmission.add('Manual'); break;
    case 'AWD':
      filtersState.drivetrain.add('AWD'); break;
    case 'Under1':
      filtersState.priceMax = 1; break;
    case 'Coupe':
      filtersState.body_style.add('Coupe'); break;
    case 'Wagon':
      filtersState.body_style.add('Wagon'); break;
  }
  renderFilters();
  renderActiveChips();
  renderListings();
}

function inSetOrEmpty(set, v) {
  return set.size === 0 || set.has(v);
}

function applyFilters(data) {
  const q = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
  return data.filter((d) => {
    if (!inSetOrEmpty(filtersState.make, d.make)) return false;
    if (!inSetOrEmpty(filtersState.model, d.model)) return false;
    if (!inSetOrEmpty(filtersState.body_style, d.body_style)) return false;
    if (!inSetOrEmpty(filtersState.drivetrain, d.drivetrain)) return false;
    if (!inSetOrEmpty(filtersState.transmission, d.transmission)) return false;
    if (!inSetOrEmpty(filtersState.exterior_color, d.exterior_color)) return false;
    const price = Number(d.price_btc);
    const year = Number(d.year);
    const mileage = Number(d.mileage);
    if (filtersState.priceMin && !(price >= Number(filtersState.priceMin))) return false;
    if (filtersState.priceMax && !(price <= Number(filtersState.priceMax))) return false;
    if (filtersState.yearMin && !(year >= Number(filtersState.yearMin))) return false;
    if (filtersState.yearMax && !(year <= Number(filtersState.yearMax))) return false;
    if (filtersState.mileageMin && !(mileage >= Number(filtersState.mileageMin))) return false;
    if (filtersState.mileageMax && !(mileage <= Number(filtersState.mileageMax))) return false;
    // search text across common fields
    if (q) {
      const hay = [
        d.make,
        d.model,
        d.body_style,
        d.exterior_color,
        d.drivetrain,
        d.transmission,
        d.vin,
        d.seller_id,
        ...(Array.isArray(d.features) ? d.features : []),
        d.description || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (showOnlySaved && !savedVehicles.includes(d.id)) return false;
    return true;
  });
}

function formToJson(form) {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  if (!data.has("escrow_required") && form.querySelector('input[name="escrow_required"]')) {
    payload.escrow_required = false;
  }
  return payload;
}

document.getElementById("listing-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const payload = formToJson(form);
  payload.escrow_required = form.querySelector('input[name="escrow_required"]').checked;

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Broadcasting...";
    await api("/listings", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    closeModal("listing-modal");
    showToast("Listing broadcast to network", "success");
    await loadListings();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Broadcast Listing";
  }
});

document.getElementById("offer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  const payload = formToJson(form);

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing...";
    await api("/offers", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    closeModal("offer-modal");
    showToast("Offer signed and submitted", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign & Send Offer";
  }
});

loadListings();
