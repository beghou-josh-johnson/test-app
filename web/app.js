async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function listingCard(listing) {
  return `
    <article class="listing">
      <h3>${listing.year} ${listing.make} ${listing.model}</h3>
      <p class="meta">${listing.id} · VIN ${listing.vin}</p>
      <p class="meta">${Number(listing.mileage).toLocaleString()} miles</p>
      <p><strong>${listing.price_btc} BTC</strong> · seller ${listing.seller_id}</p>
    </article>
  `;
}

function offerCard(offer) {
  return `
    <article class="listing">
      <h3>${offer.id}</h3>
      <p class="meta">listing ${offer.listing_id} · buyer ${offer.buyer_id}</p>
      <p><strong>${offer.offered_btc} BTC</strong> · ${offer.status}</p>
    </article>
  `;
}

function saleCard(sale) {
  return `
    <article class="listing">
      <h3>${sale.id}</h3>
      <p class="meta">listing ${sale.listing_id} · offer ${sale.offer_id}</p>
      <p><strong>${sale.status}</strong> · txid ${sale.btc_txid}</p>
    </article>
  `;
}

function fillCollection(containerId, rows, renderFn, emptyText) {
  const container = document.getElementById(containerId);
  container.innerHTML = rows.length ? rows.map(renderFn).join('') : `<p>${emptyText}</p>`;
}

async function refreshAll() {
  const [listings, offers, sales] = await Promise.all([
    api('/listings'),
    api('/offers'),
    api('/sales'),
  ]);
  fillCollection('listings', listings, listingCard, 'No listings yet.');
  fillCollection('offers', offers, offerCard, 'No offers yet.');
  fillCollection('sales', sales, saleCard, 'No settled sales yet.');
}

function formToJson(form) {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  payload.escrow_required = data.get('escrow_required') === 'on';
  return payload;
}

function writeMessage(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? '#9b2226' : '#865d36';
}

document.getElementById('listing-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const msg = document.getElementById('listing-message');

  try {
    await api('/listings', { method: 'POST', body: JSON.stringify(formToJson(form)) });
    form.reset();
    writeMessage(msg, 'Listing posted.');
    await refreshAll();
  } catch (error) {
    writeMessage(msg, error.message, true);
  }
});

document.getElementById('offer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const msg = document.getElementById('offer-message');

  try {
    await api('/offers', { method: 'POST', body: JSON.stringify(formToJson(form)) });
    form.reset();
    writeMessage(msg, 'Offer submitted.');
    await refreshAll();
  } catch (error) {
    writeMessage(msg, error.message, true);
  }
});

document.getElementById('reset-demo').addEventListener('click', async () => {
  const msg = document.getElementById('listing-message');
  try {
    await api('/demo/reset', { method: 'POST' });
    writeMessage(msg, 'Demo data reset.');
    await refreshAll();
  } catch (error) {
    writeMessage(msg, error.message, true);
  }
});

refreshAll().catch((error) => {
  writeMessage(document.getElementById('listing-message'), error.message, true);
});
