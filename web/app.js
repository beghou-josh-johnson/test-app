let globalListingsData = [];
let showOnlySaved = false;
let isWalletConnected = false;
let savedVehicles = [];

try {
  const persisted = localStorage.getItem("savedVehicles");
  savedVehicles = persisted ? JSON.parse(persisted) : [];
  if (!Array.isArray(savedVehicles)) {
    savedVehicles = [];
  }
} catch {
  savedVehicles = [];
}

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

function listingCard(listing) {
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const safeId = escapeHtml(listing.id);
  const safeTitle = escapeHtml(title);
  const safeVin = escapeHtml(listing.vin);
  const safeSeller = escapeHtml(listing.seller_id);
  const isSaved = savedVehicles.includes(listing.id);
  const imgVariant = (listing.id.charCodeAt(listing.id.length - 1) % 2) + 1;

  return `
    <article class="card listing-card" data-id="${safeId}">
      <div class="listing-image-container">
        <button class="favorite-btn ${isSaved ? "active" : ""}" onclick="toggleFavorite(event, '${safeId}')" title="Save Vehicle">
          ${isSaved ? "♥" : "♡"}
        </button>
        <img class="listing-image" src="/car_${imgVariant}.png" alt="${safeTitle}" />
      </div>
      <div class="listing-content">
        <div class="listing-header">
          <h3 class="listing-title">${safeTitle}</h3>
        </div>

        <div class="listing-price">
          <span>₿</span> ${formatBTC(listing.price_btc)}
        </div>

        <div class="listing-meta-grid">
          <div class="meta-item">
            <span class="meta-label">Mileage</span>
            <span class="meta-value">${Number(listing.mileage).toLocaleString()} mi</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Escrow</span>
            <span class="meta-value">${listing.escrow_required ? "Required ✓" : "Optional"}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Seller</span>
            <span class="meta-value listing-seller">${safeSeller}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Listing ID</span>
            <span class="meta-value">${safeId}</span>
          </div>
        </div>

        <div class="listing-actions">
          <div class="vin-badge mb-4">VIN: ${safeVin}</div>
          <div class="listing-actions-row">
            <button class="btn btn-secondary btn-full" onclick="openDetailsModal('${safeId}')">View Details</button>
            <button class="btn btn-primary btn-full" onclick="openOfferModal('${safeId}')">Make Offer</button>
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
  const cards = Array.from(document.querySelectorAll(".listing-card"));
  let visible = 0;

  cards.forEach((card) => {
    const textContext = card.textContent.toLowerCase();
    const id = card.getAttribute("data-id") || "";
    const matchesSearch = !query || textContext.includes(query);
    const matchesSaved = showOnlySaved ? savedVehicles.includes(id) : true;
    const shouldShow = matchesSearch && matchesSaved;
    card.style.display = shouldShow ? "flex" : "none";
    if (shouldShow) visible += 1;
  });

  const noResults = document.getElementById("no-results");
  if (noResults) {
    noResults.classList.toggle("hidden", visible > 0 || cards.length === 0);
  }
  renderResultCount(visible, cards.length);
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
  const imgVariant = (listing.id.charCodeAt(listing.id.length - 1) % 2) + 1;
  const monthlyBTC = ((Number(listing.price_btc) / 60) * 1.05).toFixed(4);
  const body = document.getElementById("details-modal-body");
  if (!body) return;

  body.innerHTML = `
    <div class="details-layout">
      <div>
        <img class="details-image" src="/car_${imgVariant}.png" alt="${escapeHtml(title)}" />
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
        </div>
        <div class="card details-card">
          <h4>Settlement Readiness</h4>
          <ul class="details-list">
            <li>Title evidence required before handoff</li>
            <li>Address verification recommended out-of-band</li>
            <li>Escrow release path should be documented</li>
          </ul>
        </div>
        <button class="btn btn-primary btn-full" onclick="closeModal('details-modal'); openOfferModal('${escapeHtml(listing.id)}')">Proceed to Offer</button>
      </div>
    </div>
  `;
  openModal("details-modal");
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

async function loadListings(showSkeleton = true) {
  const container = document.getElementById("listings");
  if (!container) return;
  if (showSkeleton) renderSkeletons();

  try {
    if (showSkeleton) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    globalListingsData = await api("/listings");
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

    container.innerHTML = globalListingsData.map(listingCard).join("");
    updateFilteredState();
  } catch (error) {
    showToast(error.message || "Failed to sync network data", "error");
  }
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
