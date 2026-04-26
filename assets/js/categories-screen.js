'use strict';

(function initCategoriesScreen() {
  const API_BASE = window.EONET_CONFIG?.API_BASE || 'https://eonet.gsfc.nasa.gov/api/v3';
  const grid = document.getElementById('categories-grid');
  const count = document.getElementById('categories-count');

  if (!grid) return;

  document.addEventListener('DOMContentLoaded', loadCategories);

  async function loadCategories() {
    setLoading();

    try {
      const res = await fetch(`${API_BASE}/categories`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const categories = data.categories || [];

      if (count) count.textContent = `${categories.length} CATEGORIES`;
      grid.innerHTML = categories.map(createCategoryCard).join('');
    } catch (err) {
      showError(err);
    }
  }

  function createCategoryCard(category) {
    const title = escHtml(category.title || category.id || 'Unknown');
    const description = escHtml(category.description || 'No description available.');
    const id = escHtml(category.id || '');
    const link = category.link
      ? `<a class="inline-link" href="${escHtml(category.link)}" target="_blank" rel="noopener noreferrer">API LINK</a>`
      : '';

    return `
      <article class="info-card" data-category="${title}" role="listitem">
        <div class="info-card-kicker">${id}</div>
        <h3 class="info-card-title">${title}</h3>
        <p class="info-card-desc">${description}</p>
        <div class="info-card-footer">
          <span class="source-tag">/categories</span>
          ${link}
        </div>
      </article>
    `;
  }

  function setLoading() {
    if (count) count.textContent = 'Loading...';
    grid.innerHTML = '<div class="no-events">// LOADING CATEGORIES</div>';
  }

  function showError(err) {
    if (count) count.textContent = 'FAILED';
    grid.innerHTML = `<div class="no-events">// CATEGORIES API ERROR: ${escHtml(err.message)}</div>`;
  }

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
