'use strict';

(function initLayersScreen() {
  const API_BASE = window.EONET_CONFIG?.API_BASE || 'https://eonet.gsfc.nasa.gov/api/v3';
  const grid = document.getElementById('layers-grid');
  const count = document.getElementById('layers-count');
  const categoryFilter = document.getElementById('layers-category-filter');
  let categories = [];

  if (!grid) return;

  document.addEventListener('DOMContentLoaded', () => {
    loadLayers();
    categoryFilter?.addEventListener('change', renderLayers);
  });

  async function loadLayers() {
    setLoading();

    try {
      const categoryRes = await fetch(`${API_BASE}/categories`, {
        headers: { Accept: 'application/json' },
      });

      if (!categoryRes.ok) throw new Error(`HTTP ${categoryRes.status}`);

      const categoryData = await categoryRes.json();
      const categoryList = categoryData.categories || [];
      const layerResults = await Promise.all(categoryList.map(fetchCategoryLayers));
      categories = layerResults.filter(category => category.layers.length);
      populateFilter();
      renderLayers();
    } catch (err) {
      showError(err);
    }
  }

  async function fetchCategoryLayers(category) {
    const res = await fetch(`${API_BASE}/layers/${encodeURIComponent(category.id)}`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return { ...category, layers: [] };
    }

    const data = await res.json();
    const layerCategory = data.categories?.[0] || {};
    return {
      ...category,
      ...layerCategory,
      id: category.id,
      title: category.title,
      layers: layerCategory.layers || [],
    };
  }

  function populateFilter() {
    if (!categoryFilter) return;

    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id || category.title || '';
      option.textContent = category.title || category.id || 'Unknown';
      categoryFilter.appendChild(option);
    });
  }

  function renderLayers() {
    const selected = categoryFilter?.value || '';
    const visibleCategories = selected
      ? categories.filter(category => (category.id || category.title) === selected)
      : categories;

    const totalLayers = visibleCategories.reduce((sum, category) => sum + (category.layers?.length || 0), 0);
    if (count) count.textContent = `${totalLayers} LAYERS`;

    if (!totalLayers) {
      grid.innerHTML = '<div class="no-events">// NO LAYERS FOUND</div>';
      return;
    }

    grid.innerHTML = visibleCategories.map(createLayerGroup).join('');
  }

  function createLayerGroup(category) {
    const layers = category.layers || [];
    const title = escHtml(category.title || category.id || 'Unknown');
    const cards = layers.map(layer => createLayerCard(layer, title)).join('');

    return `
      <section class="layer-group" role="listitem">
        <div class="layer-group-header">
          <h3 class="info-card-title">${title}</h3>
          <span class="source-tag">${layers.length} layers</span>
        </div>
        <div class="layer-list">${cards}</div>
      </section>
    `;
  }

  function createLayerCard(layer, categoryTitle) {
    const params = Array.isArray(layer.parameters) ? layer.parameters : [];
    const paramText = params
      .map(param => Object.entries(param).map(([key, value]) => `${key}: ${value}`).join(', '))
      .filter(Boolean)
      .slice(0, 3)
      .join(' / ');

    const url = layer.serviceUrl
      ? `<a class="inline-link" href="${escHtml(layer.serviceUrl)}" target="_blank" rel="noopener noreferrer">SERVICE</a>`
      : '';

    return `
      <article class="layer-card" data-category="${escHtml(categoryTitle)}">
        <div class="info-card-kicker">${escHtml(layer.serviceTypeId || 'LAYER')}</div>
        <h4 class="layer-title">${escHtml(layer.name || layer.id || 'Unnamed layer')}</h4>
        <p class="info-card-desc">${escHtml(layer.title || layer.subtitle || 'NASA imagery/web service layer')}</p>
        <div class="layer-meta">${escHtml(paramText || 'No parameters listed')}</div>
        <div class="info-card-footer">
          <span class="source-tag">/layers</span>
          ${url}
        </div>
      </article>
    `;
  }

  function setLoading() {
    if (count) count.textContent = 'Loading...';
    grid.innerHTML = '<div class="no-events">// LOADING LAYERS</div>';
  }

  function showError(err) {
    if (count) count.textContent = 'FAILED';
    grid.innerHTML = `<div class="no-events">// LAYERS API ERROR: ${escHtml(err.message)}</div>`;
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
