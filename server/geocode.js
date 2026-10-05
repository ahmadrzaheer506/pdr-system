/**
 * Job address → lat/lng (requirement 9.2).
 * Photon first, Nominatim fallback. Failures return null so clock-in is never blocked.
 */
const { Job } = require('./models');

const USER_AGENT = 'PaulDouglasRoofingCRM/1.0 (https://pauldouglasroofing.co.uk)';

function hasCoords(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return false;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);
}

function parsePhoton(data) {
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  return hasCoords(lat, lng) ? { lat, lng } : null;
}

function parseNominatim(rows) {
  const row = Array.isArray(rows) ? rows[0] : null;
  const lat = Number(row?.lat);
  const lng = Number(row?.lon);
  return hasCoords(lat, lng) ? { lat, lng } : null;
}

async function fetchJson(url, fetchImpl, extraHeaders = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...extraHeaders },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} address
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ lat: number, lng: number }|null>}
 */
async function geocodeAddress(address, { fetchImpl } = {}) {
  const q = String(address || '').trim();
  if (!q) return null;

  const photon = parsePhoton(await fetchJson(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`,
    fetchImpl,
  ));
  if (photon) return photon;

  const params = new URLSearchParams({ q, format: 'json', limit: '1', countrycodes: 'gb' });
  return parseNominatim(await fetchJson(
    `https://nominatim.openstreetmap.org/search?${params}`,
    fetchImpl,
  ));
}

/**
 * Persist a site point on the job when missing, or when refresh is set (address changed).
 * @param {{ id?: number, address?: string, lat?: number, lng?: number, update?: Function }} job
 * @param {{ refresh?: boolean, fetchImpl?: typeof fetch }} [opts]
 */
async function ensureJobSitePoint(job, { refresh = false, fetchImpl } = {}) {
  if (!job) return null;
  if (!refresh && hasCoords(job.lat, job.lng)) {
    return { lat: Number(job.lat), lng: Number(job.lng) };
  }
  const point = await geocodeAddress(job.address, { fetchImpl });
  if (!point) {
    return hasCoords(job.lat, job.lng) ? { lat: Number(job.lat), lng: Number(job.lng) } : null;
  }
  if (typeof job.update === 'function') {
    await job.update({ lat: point.lat, lng: point.lng });
  } else if (job.id) {
    await Job.update({ lat: point.lat, lng: point.lng }, { where: { id: job.id } });
  }
  job.lat = point.lat;
  job.lng = point.lng;
  return point;
}

module.exports = { geocodeAddress, ensureJobSitePoint, hasCoords };
