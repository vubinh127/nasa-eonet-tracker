'use strict';

(function initEonetMap() {
  const API_BASE = 'https://eonet.gsfc.nasa.gov/api/v3';
  const CATEGORY_COLORS = {
    Wildfires: '#ff6b35',
    'Severe Storms': '#ffbe00',
    Volcanoes: '#ff3b3b',
    'Sea and Lake Ice': '#00d4ff',
    Earthquakes: '#aa44ff',
    Floods: '#0066ff',
    Landslides: '#a0522d',
    Drought: '#c8a000',
    'Dust and Haze': '#c49a6c',
    Manmade: '#ff4488',
    Snow: '#aaddff',
    'Temperature Extremes': '#ff8800',
    'Water Color': '#00ffcc',
  };
  const WORLD_BOUNDS = L.latLngBounds(
    L.latLng(-85, -180),
    L.latLng(85, 180)
  );

  const dom = {
    map: document.getElementById('eonet-map'),
    status: document.getElementById('map-status-panel'),
    statusFilter: document.getElementById('map-status'),
    categoryFilter: document.getElementById('map-category'),
    limitFilter: document.getElementById('map-limit'),
    refresh: document.getElementById('map-refresh'),
    clock: document.getElementById('map-clock'),
  };

  if (!dom.map || typeof L === 'undefined') return;

  let map;
  let eventLayer;
  let fullData = null;

  document.addEventListener('DOMContentLoaded', () => {
    createStars();
    startClock();
    initMap();
    bindEvents();
    loadGeoJson();
  });

  function initMap() {
    map = L.map(dom.map, {
      worldCopyJump: false,
      preferCanvas: true,
      zoomControl: true,
      minZoom: 3,
      maxZoom: 8,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1,
    }).setView([20, 0], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      bounds: WORLD_BOUNDS,
      noWrap: true,
      minZoom: 3,
      maxZoom: 18,
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(map);

    eventLayer = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 0);
  }

  async function loadGeoJson() {
    setStatus('Loading GeoJSON...');

    try {
      const params = new URLSearchParams({
        status: dom.statusFilter?.value || 'all',
        limit: dom.limitFilter?.value || '50',
      });

      const res = await fetch(`${API_BASE}/events/geojson?${params.toString()}`, {
        headers: { Accept: 'application/geo+json, application/json' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      fullData = await res.json();
      populateCategories(fullData.features || []);
      renderMap();
    } catch (err) {
      setStatus(`GeoJSON API error: ${err.message}`, true);
    }
  }

  function renderMap() {
    eventLayer.clearLayers();

    const categoryId = dom.categoryFilter?.value || '';
    const features = (fullData?.features || []).filter(feature => {
      if (!categoryId) return true;
      return getCategories(feature).some(category => category.id === categoryId);
    });

    const bounds = [];
    features.forEach(feature => {
      const center = getFeatureCenter(feature);
      if (!center) return;

      const color = getFeatureColor(feature);
      const marker = L.circleMarker(center, {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.62,
        interactive: true,
      });

      marker.bindPopup(createPopup(feature), {
          maxWidth: 360,
          className: 'eonet-popup',
      });
      marker.addTo(eventLayer);
      bounds.push(center);
    });

    if (bounds.length) {
      const layerBounds = L.latLngBounds(bounds);
      if (layerBounds.isValid()) {
        map.fitBounds(layerBounds.pad(0.18), { maxZoom: 5, animate: false });
        map.panInsideBounds(WORLD_BOUNDS, { animate: false });
      }
    } else {
      map.setView([20, 0], 3);
    }

    const label = bounds.length === 1 ? 'event' : 'events';
    setStatus(`${bounds.length} ${label} shown`);
  }

  function populateCategories(features) {
    if (!dom.categoryFilter) return;

    const current = dom.categoryFilter.value;
    const categories = new Map();
    features.forEach(feature => {
      getCategories(feature).forEach(category => {
        if (category.id) categories.set(category.id, category.title || category.id);
      });
    });

    dom.categoryFilter.innerHTML = '<option value="">All Categories</option>';
    Array.from(categories.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([id, title]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = title;
        dom.categoryFilter.appendChild(option);
      });

    if (current && categories.has(current)) {
      dom.categoryFilter.value = current;
    }
  }

  function createPopup(feature) {
    const props = feature.properties || {};
    const categories = getCategories(feature);
    const category = categories[0]?.title || 'Unknown';
    const closed = props.closed ? new Date(props.closed).toLocaleDateString('en-US') : null;
    const date = getFeatureDate(feature);
    const sources = Array.isArray(props.sources)
      ? props.sources.slice(0, 4).map(source => {
          const label = escHtml(source.id || 'source');
          return source.url
            ? `<a href="${escAttr(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
            : `<span>${label}</span>`;
        }).join('')
      : '';

    return `
      <article class="popup-card">
        <div class="popup-kicker">${escHtml(category)}</div>
        <h2>${escHtml(props.title || feature.id || 'Untitled event')}</h2>
        <dl>
          <div><dt>Status</dt><dd>${closed ? `Closed ${escHtml(closed)}` : 'Active'}</dd></div>
          <div><dt>Latest</dt><dd>${escHtml(date || 'Unknown')}</dd></div>
          <div><dt>Type</dt><dd>${escHtml(feature.geometry?.type || 'Unknown')}</dd></div>
        </dl>
        ${sources ? `<div class="popup-sources">${sources}</div>` : ''}
      </article>
    `;
  }

  function getCategories(feature) {
    return Array.isArray(feature.properties?.categories) ? feature.properties.categories : [];
  }

  function getFeatureColor(feature) {
    const title = getCategories(feature)[0]?.title;
    return CATEGORY_COLORS[title] || '#00d4ff';
  }

  function getFeatureCenter(feature) {
    const geometry = feature.geometry;
    if (!geometry?.coordinates) return null;

    if (geometry.type === 'Point' && isCoordinatePair(geometry.coordinates)) {
      return [geometry.coordinates[1], geometry.coordinates[0]];
    }

    const pairs = flattenCoordinatePairs(geometry.coordinates);
    if (!pairs.length) return null;

    const bounds = pairs.reduce((acc, pair) => ({
      minLon: Math.min(acc.minLon, pair[0]),
      maxLon: Math.max(acc.maxLon, pair[0]),
      minLat: Math.min(acc.minLat, pair[1]),
      maxLat: Math.max(acc.maxLat, pair[1]),
    }), {
      minLon: pairs[0][0],
      maxLon: pairs[0][0],
      minLat: pairs[0][1],
      maxLat: pairs[0][1],
    });

    return [
      bounds.minLat + ((bounds.maxLat - bounds.minLat) / 2),
      bounds.minLon + ((bounds.maxLon - bounds.minLon) / 2),
    ];
  }

  function flattenCoordinatePairs(coords, result = []) {
    if (!Array.isArray(coords)) return result;
    if (isCoordinatePair(coords)) {
      result.push(coords);
      return result;
    }

    for (let i = 0; i < coords.length; i += 1) {
      flattenCoordinatePairs(coords[i], result);
    }
    return result;
  }

  function isCoordinatePair(value) {
    return Array.isArray(value)
      && value.length >= 2
      && Number.isFinite(value[0])
      && Number.isFinite(value[1]);
  }

  function getFeatureDate(feature) {
    const props = feature.properties || {};
    const firstDate = Array.isArray(props.geometryDates) ? props.geometryDates[0] : null;
    const date = firstDate || props.date;
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function bindEvents() {
    dom.refresh?.addEventListener('click', loadGeoJson);
    dom.statusFilter?.addEventListener('change', loadGeoJson);
    dom.limitFilter?.addEventListener('change', loadGeoJson);
    dom.categoryFilter?.addEventListener('change', renderMap);
  }

  function setStatus(message, isError = false) {
    if (!dom.status) return;
    dom.status.textContent = message;
    dom.status.classList.toggle('is-error', isError);
  }

  function startClock() {
    function updateClock() {
      const now = new Date();
      const utc = now.toUTCString().replace('GMT', 'UTC').slice(0, -4);
      if (dom.clock) dom.clock.textContent = utc;
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  function createStars() {
    const container = document.querySelector('.stars-bg');
    if (!container) return;

    for (let i = 0; i < 32; i++) {
      const star = document.createElement('div');
      const size = Math.random() * 2.2 + 0.5;
      star.className = 'star';
      star.style.cssText = `
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        width: ${size}px;
        height: ${size}px;
        animation-duration: ${Math.random() * 4 + 2}s;
        animation-delay: ${Math.random() * 5}s;
        opacity: ${Math.random() * 0.5 + 0.1};
      `;
      container.appendChild(star);
    }
  }

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escAttr(value) {
    return escHtml(value).replace(/`/g, '&#096;');
  }
})();
