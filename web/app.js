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

async function loadListings() {
  const listings = await api('/listings');
  const container = document.getElementById('listings');
  if (!listings.length) {
    container.innerHTML = '<p>No listings yet.</p>';
    return;
  }
  container.innerHTML = listings.map(listingCard).join('');
}

function formToJson(form) {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  if ('escrow_required' in payload) {
    payload.escrow_required = data.get('escrow_required') === 'on';
  }
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
  const payload = formToJson(form);

  try {
    await api('/listings', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    writeMessage(msg, 'Listing posted.');
    await loadListings();
  } catch (error) {
    writeMessage(msg, error.message, true);
  }
});

document.getElementById('offer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const msg = document.getElementById('offer-message');
  const payload = formToJson(form);

  try {
    await api('/offers', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    writeMessage(msg, 'Offer submitted.');
  } catch (error) {
    writeMessage(msg, error.message, true);
  }
});

loadListings().catch((error) => {
  writeMessage(document.getElementById('listing-message'), error.message, true);
});
