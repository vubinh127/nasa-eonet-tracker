'use strict';

// ===== CONFIG =====
const API = {
  BASE: 'https://eonet.gsfc.nasa.gov/api/v3',
  geojson: (params = {}) => {
    const q = new URLSearchParams(params);
    return `${API.BASE}/events/geojson?${q}`;
  }
};

// ===== STATE =====
const state = {
  map: null,
  mapLayerGroup: null,
  geojson: null,
  filters: { status: 'open', days: 30 }
};

// ===== FETCH =====
async function fetchData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ===== INIT MAP =====
async function initMap() {
  if (state.map) return;

  state.map = L.map('eventsMap', {
    center: [20, 0],
    zoom: 2,
    minZoom: 1,
    maxZoom: 12,
    zoomControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(state.map);

  // Dark map tile
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.9
  }).addTo(state.map);

  state.mapLayerGroup = L.layerGroup().addTo(state.map);

  await loadGeoJSON();
}

// ===== LOAD GEOJSON =====
async function loadGeoJSON() {
  try {
    const params = {};
    if (state.filters.days) params.days = state.filters.days;
    if (state.filters.status !== 'all') params.status = state.filters.status;

    const data = await fetchData(API.geojson(params));
    state.geojson = data;

    renderMapMarkers(data);
  } catch (err) {
    console.error('GeoJSON error:', err);
  }
}

// ===== COLOR =====
function getMarkerColor(categoryId = '') {
  const id = categoryId.toLowerCase();
  if (id.includes('fire')) return '#ff4444';
  if (id.includes('storm') || id.includes('flood')) return '#4488ff';
  if (id.includes('volcano')) return '#ff8800';
  if (id.includes('snow') || id.includes('ice')) return '#88ddff';
  if (id.includes('drought') || id.includes('dust')) return '#cc8844';
  return '#44cc88';
}

// ===== RENDER MARKERS =====
function renderMapMarkers(geojson) {
  if (!state.mapLayerGroup) return;

  state.mapLayerGroup.clearLayers();

  const features = geojson.features || [];

  features.forEach(feature => {
    const geom = feature.geometry;
    const props = feature.properties || {};
    if (!geom) return;

    const catId = props.categories?.[0]?.id || '';
    const color = getMarkerColor(catId);
    const isOpen = !props.closed;

    let marker = null;

    if (geom.type === 'Point') {
      marker = createPointMarker(geom.coordinates, props, color, isOpen);
    } else {
      marker = createPolygonMarker(geom, props, color);
    }

    if (marker) marker.addTo(state.mapLayerGroup);
  });
}

// ===== POINT MARKER =====
function createPointMarker(coords, props, color, isOpen) {
  if (!coords || coords.length < 2) return null;

  const [lng, lat] = coords;

  const icon = L.divIcon({
    html: `<div style="
      width:${isOpen ? '14px' : '10px'};
      height:${isOpen ? '14px' : '10px'};
      background:${color};
      border-radius:50%;
      box-shadow:0 0 10px ${color};
    "></div>`,
    className: '',
    iconSize: [14, 14]
  });

  return L.marker([lat, lng], { icon }).bindPopup(`
    <strong>${props.title || 'Event'}</strong><br/>
    ${lat.toFixed(4)}, ${lng.toFixed(4)}
  `);
}

// ===== POLYGON =====
function createPolygonMarker(geom, props, color) {
  try {
    const layer = L.geoJSON(geom, {
      style: {
        color,
        fillColor: color,
        fillOpacity: 0.25,
        weight: 1.5
      }
    });

    layer.bindPopup(`<strong>${props.title || 'Event'}</strong>`);
    return layer;
  } catch {
    return null;
  }
}

// ===== LAZY LOAD MAP =====
const mapSection = document.getElementById('map-section');

if (mapSection) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        initMap();
        observer.unobserve(mapSection);
      }
    });
  }, { threshold: 0.1 });

  observer.observe(mapSection);
}

 const dom = {
  clock: document.getElementById('live-clock')
};

function updateClock() {
  const now = new Date();
  const utc = now.toUTCString().replace('GMT', 'UTC').slice(0, -4);
  if (dom.clock) dom.clock.textContent = utc;
}

setInterval(updateClock, 1000);
updateClock();