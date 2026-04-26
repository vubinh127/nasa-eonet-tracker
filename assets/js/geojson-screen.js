'use strict';

(function initGeoJsonScreen() {
  const API_BASE = window.EONET_CONFIG?.API_BASE || 'https://eonet.gsfc.nasa.gov/api/v3';
  const summary = document.getElementById('geojson-summary');
  const preview = document.getElementById('geojson-preview');
  const count = document.getElementById('geojson-count');

  if (!summary || !preview) return;

  document.addEventListener('DOMContentLoaded', loadGeoJson);

  async function loadGeoJson() {
    setLoading();

    try {
      const params = new URLSearchParams({ status: 'all', limit: '50' });
      const res = await fetch(`${API_BASE}/events/geojson?${params.toString()}`, {
        headers: { Accept: 'application/geo+json, application/json' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const features = data.features || [];
      const geometryTypes = countBy(features, feature => feature.geometry?.type || 'Unknown');
      const categories = countBy(features, feature => feature.properties?.categories?.[0]?.title || 'Unknown');

      if (count) count.textContent = `${features.length} FEATURES`;
      summary.innerHTML = `
        <article class="info-card">
          <div class="info-card-kicker">FeatureCollection</div>
          <h3 class="info-card-title">${escHtml(data.title || 'EONET GeoJSON Feed')}</h3>
          <p class="info-card-desc">${escHtml(data.description || 'GeoJSON feed for NASA EONET events.')}</p>
          <div class="metric-row">
            <span><strong>${features.length}</strong> features</span>
            <span><strong>${Object.keys(geometryTypes).length}</strong> geometry types</span>
            <span><strong>${Object.keys(categories).length}</strong> categories</span>
          </div>
        </article>
        ${createBreakdown('Geometry', geometryTypes)}
        ${createBreakdown('Categories', categories)}
      `;

      preview.textContent = limitText(JSON.stringify(data, null, 2), 14000);
    } catch (err) {
      showError(err);
    }
  }

  function createBreakdown(title, items) {
    const rows = Object.entries(items)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => `
        <div class="breakdown-row">
          <span>${escHtml(label)}</span>
          <strong>${value}</strong>
        </div>
      `)
      .join('');

    return `
      <article class="info-card">
        <div class="info-card-kicker">${escHtml(title)}</div>
        <div class="breakdown-list">${rows}</div>
      </article>
    `;
  }

  function countBy(items, getKey) {
    return items.reduce((acc, item) => {
      const key = getKey(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function limitText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n\n// Preview truncated in UI. Fetch /events/geojson for the full response.`;
  }

  function setLoading() {
    if (count) count.textContent = 'Loading...';
    summary.innerHTML = '<div class="no-events">// LOADING GEOJSON FEED</div>';
    preview.textContent = '';
  }

  function showError(err) {
    if (count) count.textContent = 'FAILED';
    summary.innerHTML = `<div class="no-events">// GEOJSON API ERROR: ${escHtml(err.message)}</div>`;
    preview.textContent = '';
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
