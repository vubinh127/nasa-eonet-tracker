/**
 * NASA EONET - Earth Observatory Natural Event Tracker
 * Main Application Script
 * API: https://eonet.gsfc.nasa.gov/api/v3
 */

'use strict';

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  API_BASE: 'https://eonet.gsfc.nasa.gov/api/v3',
  EVENTS_PER_PAGE: 12,
  MAX_EVENTS: 200,
};

window.EONET_CONFIG = CONFIG;

// ============================================================
// CATEGORY META
// ============================================================
const CATEGORY_META = {
  'Wildfires':            { icon: '🔥', color: '#ff6b35' },
  'Severe Storms':        { icon: '⛈️',  color: '#ffbe00' },
  'Volcanoes':            { icon: '🌋', color: '#ff3b3b' },
  'Sea and Lake Ice':     { icon: '🧊', color: '#00d4ff' },
  'Earthquakes':          { icon: '🌊', color: '#aa44ff' },
  'Floods':               { icon: '💧', color: '#0066ff' },
  'Landslides':           { icon: '⛰️',  color: '#a0522d' },
  'Drought':              { icon: '☀️',  color: '#c8a000' },
  'Dust and Haze':        { icon: '🌫️', color: '#c49a6c' },
  'Manmade':              { icon: '🏭', color: '#ff4488' },
  'Snow':                 { icon: '❄️',  color: '#aaddff' },
  'Temperature Extremes': { icon: '🌡️', color: '#ff8800' },
  'Water Color':          { icon: '🌊', color: '#00ffcc' },
};

function getCategoryMeta(title) {
  return CATEGORY_META[title] || { icon: '🌍', color: '#00d4ff' };
}

// ============================================================
// STATE
// ============================================================
const state = {
  allEvents: [],
  filteredEvents: [],
  categories: [],
  currentPage: 1,
  loading: false,
  error: null,
  filters: {
    category: '',
    status: '',
    search: '',
    limit: CONFIG.MAX_EVENTS,
  },
};

// ============================================================
// DOM REFS
// ============================================================
const dom = {
  loader: document.getElementById('loader'),
  eventsGrid: document.getElementById('events-grid'),
  errorState: document.getElementById('error-state'),
  eventCount: document.getElementById('event-count'),
  pagination: document.getElementById('pagination'),
  categoryFilter: document.getElementById('filter-category'),
  statusFilter: document.getElementById('filter-status'),
  searchInput: document.getElementById('filter-search'),
  totalStat: document.getElementById('stat-total'),
  openStat: document.getElementById('stat-open'),
  closedStat: document.getElementById('stat-closed'),
  catStat: document.getElementById('stat-categories'),
  modal: document.getElementById('event-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
  clock: document.getElementById('live-clock'),
};

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
  const now = new Date();
  const utc = now.toUTCString().replace('GMT', 'UTC').slice(0, -4);
  if (dom.clock) dom.clock.textContent = utc;
}

setInterval(updateClock, 1000);
updateClock();

// ============================================================
// STARS BACKGROUND
// ============================================================
function createStars() {
  const container = document.querySelector('.stars-bg');
  if (!container) return;

  for (let i = 0; i < 120; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
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

// ============================================================
// API
// ============================================================
async function fetchEvents() {
  const params = new URLSearchParams({
    limit: state.filters.limit,
    status: state.filters.status || 'all',
  });

  if (state.filters.category) {
    params.set('category', state.filters.category);
  }

  const url = `${CONFIG.API_BASE}/events/geojson?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/geo+json, application/json' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return normalizeGeoJsonFeed(data);
}

async function fetchCategories() {
  const res = await fetch(`${CONFIG.API_BASE}/categories`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.categories || [];
}

function normalizeGeoJsonFeed(data) {
  const features = Array.isArray(data.features) ? data.features : [];
  const events = features.map(feature => {
    const props = feature.properties || {};
    const coordinates = feature.geometry?.coordinates;
    const geometryDates = props.geometryDates || [];
    const geometries = Array.isArray(coordinates)
      ? [{
          type: feature.geometry.type,
          coordinates,
          date: geometryDates[0] || props.date || null,
          magnitudeValue: props.magnitudeValue ?? null,
          magnitudeUnit: props.magnitudeUnit ?? null,
        }]
      : [];

    return {
      id: props.id || feature.id || '',
      title: props.title || 'Untitled event',
      description: props.description || null,
      link: props.link || null,
      closed: props.closed || null,
      categories: props.categories || [],
      sources: props.sources || [],
      geometry: geometries,
      geojson: feature,
    };
  });

  return {
    title: data.title,
    description: data.description,
    link: data.link,
    events,
  };
}

// ============================================================
// LOAD DATA
// ============================================================
async function loadData() {
  if (state.loading) return;
  state.loading = true;
  state.error = null;

  showLoader();
  hideError();

  try {
    const [eventsData, categories] = await Promise.all([
      fetchEvents(),
      state.categories.length ? Promise.resolve({ categories: state.categories }) : fetchCategories().then(c => ({ categories: c })),
    ]);

    state.allEvents = eventsData.events || [];
    if (!state.categories.length) {
      state.categories = eventsData.categories || [];
      // Merge API categories if needed
      if (categories.categories && categories.categories.length) {
        state.categories = categories.categories;
      }
      populateCategoryFilter();
    }

    applyFilters();
    updateStats();

  } catch (err) {
    console.error('EONET API Error:', err);
    state.error = err.message;
    showError(err.message);
  } finally {
    state.loading = false;
    hideLoader();
  }
}

// ============================================================
// FILTER
// ============================================================
function applyFilters() {
  const search = state.filters.search.toLowerCase().trim();

  state.filteredEvents = state.allEvents.filter(event => {
    // Search filter
    if (search && !event.title.toLowerCase().includes(search)) return false;
    return true;
  });

  state.currentPage = 1;
  renderEvents();
  renderPagination();
}

function populateCategoryFilter() {
  if (!dom.categoryFilter) return;

  const cats = new Map();
  state.categories.forEach(cat => {
    if (cat.id) cats.set(cat.id, cat.title || cat.id);
  });

  // Include categories seen in current results in case the event feed returns a newer label.
  state.allEvents.forEach(event => {
    if (event.categories) {
      event.categories.forEach(cat => {
        if (!cats.has(cat.id)) cats.set(cat.id, cat.title);
      });
    }
  });

  dom.categoryFilter.innerHTML = '<option value="">All Categories</option>';
  cats.forEach((title, id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = title;
    dom.categoryFilter.appendChild(opt);
  });
}

// ============================================================
// STATS
// ============================================================
function updateStats() {
  const total = state.allEvents.length;
  const open = state.allEvents.filter(e => e.closed === null).length;
  const closed = total - open;

  const cats = new Set();
  state.allEvents.forEach(e => {
    if (e.categories) e.categories.forEach(c => cats.add(c.id));
  });

  animateNumber(dom.totalStat, total);
  animateNumber(dom.openStat, open);
  animateNumber(dom.closedStat, closed);
  animateNumber(dom.catStat, cats.size);
}

function animateNumber(el, target) {
  if (!el) return;
  const duration = 1200;
  const start = parseInt(el.textContent) || 0;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ============================================================
// RENDER EVENTS
// ============================================================
function renderEvents() {
  if (!dom.eventsGrid) return;

  const total = state.filteredEvents.length;
  const start = (state.currentPage - 1) * CONFIG.EVENTS_PER_PAGE;
  const end = start + CONFIG.EVENTS_PER_PAGE;
  const pageEvents = state.filteredEvents.slice(start, end);

  if (dom.eventCount) {
    dom.eventCount.textContent = `${total.toLocaleString()} EVENTS FOUND`;
  }

  if (total === 0) {
    dom.eventsGrid.innerHTML = '<div class="no-events">// NO EVENTS MATCH CURRENT FILTERS</div>';
    return;
  }

  dom.eventsGrid.innerHTML = pageEvents.map((event, idx) => createEventCard(event, idx)).join('');

  // Stagger animation
  dom.eventsGrid.querySelectorAll('.event-card').forEach((card, i) => {
    card.style.animationDelay = `${i * 60}ms`;
  });

  // Click handlers
  dom.eventsGrid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const event = state.filteredEvents.find(e => e.id === id);
      if (event) openModal(event);
    });
  });
}

function createEventCard(event, idx) {
  const category = event.categories?.[0] || {};
  const meta = getCategoryMeta(category.title);
  const isOpen = event.closed === null;

  // Get latest geometry
  const geo = event.geometry?.[0];
  const coords = geo?.coordinates ? formatCoordinates(geo) : 'N/A';

  // Format date
  const date = geo?.date ? new Date(geo.date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  }) : '–';

  const sources = event.sources?.slice(0, 3).map(s =>
    `<span class="source-tag">${s.id}</span>`
  ).join('') || '';

  const geoCount = event.geometry?.length || 0;

  return `
    <article class="event-card" data-category="${escHtml(category.title || '')}" data-id="${escHtml(event.id)}" tabindex="0" role="button" aria-label="View details for ${escHtml(event.title)}">
      <div class="event-card-header">
        <h3 class="event-title">${escHtml(event.title)}</h3>
        <div class="event-category-badge">
          <span class="cat-icon">${meta.icon}</span>
          <span>${escHtml(category.title || 'Unknown')}</span>
        </div>
      </div>
      <div class="event-card-body">
        <div class="event-meta">
          <div class="event-meta-item">
            <span class="meta-label">Latest Date</span>
            <span class="meta-value">${date}</span>
          </div>
          <div class="event-meta-item">
            <span class="meta-label">Data Points</span>
            <span class="meta-value">${geoCount} geometr${geoCount === 1 ? 'y' : 'ies'}</span>
          </div>
        </div>
        <div class="event-coords" data-tooltip="Geographic Coordinates">
          📍 ${coords}
        </div>
      </div>
      <div class="event-card-footer">
        <div class="event-sources">${sources}</div>
        <span class="event-status ${isOpen ? 'status-open' : 'status-closed'}">
          ${isOpen ? '● ACTIVE' : '○ CLOSED'}
        </span>
      </div>
    </article>
  `;
}

// ============================================================
// PAGINATION
// ============================================================
function renderPagination() {
  if (!dom.pagination) return;

  const totalPages = Math.ceil(state.filteredEvents.length / CONFIG.EVENTS_PER_PAGE);

  if (totalPages <= 1) {
    dom.pagination.innerHTML = '';
    return;
  }

  const cur = state.currentPage;
  let pages = [];

  pages.push({ label: '‹ PREV', page: cur - 1, disabled: cur === 1 });

  // Page numbers
  const range = 2;
  let start = Math.max(1, cur - range);
  let end = Math.min(totalPages, cur + range);

  if (start > 1) {
    pages.push({ label: '1', page: 1 });
    if (start > 2) pages.push({ label: '…', page: null });
  }

  for (let i = start; i <= end; i++) {
    pages.push({ label: String(i), page: i, active: i === cur });
  }

  if (end < totalPages) {
    if (end < totalPages - 1) pages.push({ label: '…', page: null });
    pages.push({ label: String(totalPages), page: totalPages });
  }

  pages.push({ label: 'NEXT ›', page: cur + 1, disabled: cur === totalPages });

  dom.pagination.innerHTML = pages.map(p => {
    if (p.page === null) return `<span class="page-btn" style="cursor:default;border-color:transparent;color:var(--text-muted)">${p.label}</span>`;
    return `<button class="page-btn ${p.active ? 'active' : ''}" data-page="${p.page}" ${p.disabled ? 'disabled' : ''}>${p.label}</button>`;
  }).join('');

  dom.pagination.querySelectorAll('[data-page]:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentPage = parseInt(btn.dataset.page);
      renderEvents();
      renderPagination();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ============================================================
// MODAL
// ============================================================
function openModal(event) {
  const category = event.categories?.[0] || {};
  const meta = getCategoryMeta(category.title);
  const isOpen = event.closed === null;

  if (dom.modalTitle) {
    dom.modalTitle.innerHTML = `
      <span style="margin-right:0.5rem">${meta.icon}</span>
      ${escHtml(event.title)}
    `;
  }

  if (dom.modalBody) {
    const sourceLinks = event.sources?.map(s =>
      `<div class="source-item">
        <span class="source-tag">${escHtml(s.id)}</span>
        <a href="${escHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escHtml(s.url)}</a>
      </div>`
    ).join('') || '<p style="color:var(--text-muted);font-size:0.75rem;font-family:var(--font-mono)">No sources available</p>';

    const geoItems = event.geometry?.map(g => {
      const coords = formatCoordinates(g, 6);
      const date = g.date ? new Date(g.date).toLocaleString('en-US') : '–';
      return `
        <div class="geometry-item">
          <div>${coords}</div>
          <div class="geometry-date">📅 ${date} &nbsp;|&nbsp; Type: ${g.type}</div>
        </div>
      `;
    }).join('') || '';

    dom.modalBody.innerHTML = `
      <div class="modal-section">
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
          <div class="event-category-badge" data-category="${escHtml(category.title || '')}">
            ${meta.icon} ${escHtml(category.title || 'Unknown')}
          </div>
          <span class="event-status ${isOpen ? 'status-open' : 'status-closed'}" style="font-size:0.7rem;padding:0.25rem 0.75rem">
            ${isOpen ? '● ACTIVE EVENT' : '○ EVENT CLOSED'}
          </span>
          ${event.closed ? `<span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted)">Closed: ${new Date(event.closed).toLocaleDateString()}</span>` : ''}
        </div>
        <p style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-muted);letter-spacing:0.1em">ID: ${escHtml(event.id)}</p>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">📍 Geometry Data (${event.geometry?.length || 0} points)</div>
        <div class="geometry-list">${geoItems}</div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">🔗 Sources</div>
        <div class="source-list">${sourceLinks}</div>
      </div>

      ${event.link ? `
      <div class="modal-section">
        <div class="modal-section-title">🌐 EONET Link</div>
        <a href="${escHtml(event.link)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);font-family:var(--font-mono);font-size:0.75rem;word-break:break-all;">${escHtml(event.link)}</a>
      </div>` : ''}
    `;
  }

  if (dom.modal) {
    dom.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal() {
  if (dom.modal) {
    dom.modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function showLoader() {
  if (dom.loader) dom.loader.style.display = 'flex';
  if (dom.eventsGrid) dom.eventsGrid.style.display = 'none';
}

function hideLoader() {
  if (dom.loader) dom.loader.style.display = 'none';
  if (dom.eventsGrid) dom.eventsGrid.style.display = 'grid';
}

function showError(msg) {
  if (dom.errorState) {
    dom.errorState.classList.add('visible');
    const msgEl = dom.errorState.querySelector('.error-msg');
    if (msgEl) msgEl.textContent = `// ${msg}`;
  }
  if (dom.eventsGrid) dom.eventsGrid.style.display = 'none';
}

function hideError() {
  if (dom.errorState) dom.errorState.classList.remove('visible');
}

function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCoordinates(geometry, precision = 3) {
  const center = getGeometryCenter(geometry);
  if (!center) return 'N/A';
  const [lon, lat] = center;
  return `${lat.toFixed(precision)} deg N, ${lon.toFixed(precision)} deg E`;
}

function getGeometryCenter(geometry) {
  if (!geometry?.coordinates) return null;
  if (geometry.type === 'Point' && Number.isFinite(geometry.coordinates[0])) {
    return geometry.coordinates;
  }

  const points = flattenCoordinatePairs(geometry.coordinates);
  if (!points.length) return null;

  const bounds = points.reduce((acc, point) => ({
    minLon: Math.min(acc.minLon, point[0]),
    maxLon: Math.max(acc.maxLon, point[0]),
    minLat: Math.min(acc.minLat, point[1]),
    maxLat: Math.max(acc.maxLat, point[1]),
  }), {
    minLon: points[0][0],
    maxLon: points[0][0],
    minLat: points[0][1],
    maxLat: points[0][1],
  });

  return [
    bounds.minLon + ((bounds.maxLon - bounds.minLon) / 2),
    bounds.minLat + ((bounds.maxLat - bounds.minLat) / 2),
  ];
}

function flattenCoordinatePairs(coords, result = []) {
  if (!Array.isArray(coords)) return result;
  if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
    result.push(coords);
    return result;
  }
  coords.forEach(item => flattenCoordinatePairs(item, result));
  return result;
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function initEventListeners() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.viewTarget;
      document.querySelectorAll('.view-tab').forEach(item => item.classList.toggle('active', item === tab));
      document.querySelectorAll('.data-view').forEach(view => view.classList.toggle('active', view.id === targetId));
    });
  });

  // Modal close
  if (dom.modalClose) {
    dom.modalClose.addEventListener('click', closeModal);
  }

  if (dom.modal) {
    dom.modal.addEventListener('click', e => {
      if (e.target === dom.modal) closeModal();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Apply filter button
  const applyBtn = document.getElementById('btn-apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      state.filters.category = dom.categoryFilter?.value || '';
      state.filters.status = dom.statusFilter?.value || '';
      state.filters.search = dom.searchInput?.value || '';

      // If category changed, reload from API
      loadData();
    });
  }

  // Reset button
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (dom.categoryFilter) dom.categoryFilter.value = '';
      if (dom.statusFilter) dom.statusFilter.value = '';
      if (dom.searchInput) dom.searchInput.value = '';
      state.filters = { category: '', status: '', search: '', limit: CONFIG.MAX_EVENTS };
      loadData();
    });
  }

  // Search on enter
  if (dom.searchInput) {
    dom.searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        state.filters.search = dom.searchInput.value;
        applyFilters();
      }
    });
  }

  // Retry
  const retryBtn = document.getElementById('btn-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', loadData);
  }

  // Status filter live change
  if (dom.statusFilter) {
    dom.statusFilter.addEventListener('change', () => {
      state.filters.status = dom.statusFilter.value;
      loadData();
    });
  }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  createStars();
  initEventListeners();
  loadData();
});
