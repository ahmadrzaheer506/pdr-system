const { geocodeAddress, ensureJobSitePoint } = require('../geocode');

describe('geocode (requirement 9.2)', () => {
  test('returns the first Photon point', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (String(url).includes('photon')) {
        return {
          ok: true,
          json: async () => ({ features: [{ geometry: { coordinates: [-0.9781, 51.4543] } }] }),
        };
      }
      return { ok: true, json: async () => [] };
    });
    await expect(geocodeAddress('2 Priory Court, Reading', { fetchImpl })).resolves.toEqual({
      lat: 51.4543, lng: -0.9781,
    });
    expect(fetchImpl.mock.calls[0][0]).toContain('photon.komoot.io');
  });

  test('falls back to Nominatim when Photon is empty', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (String(url).includes('photon')) return { ok: true, json: async () => ({ features: [] }) };
      return { ok: true, json: async () => [{ lat: '51.42', lon: '-0.97' }] };
    });
    await expect(geocodeAddress('Church Road, Reading', { fetchImpl })).resolves.toEqual({
      lat: 51.42, lng: -0.97,
    });
    expect(fetchImpl.mock.calls[1][0]).toContain('nominatim.openstreetmap.org');
  });

  test('returns null when the lookup fails', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('network'); });
    await expect(geocodeAddress('nowhere', { fetchImpl })).resolves.toBeNull();
  });

  test('skips lookup when the job already has a site point', async () => {
    const job = { id: 8, address: '2 Priory Court', lat: 51.45, lng: -0.97, update: jest.fn() };
    const fetchImpl = jest.fn();
    await expect(ensureJobSitePoint(job, { fetchImpl })).resolves.toEqual({ lat: 51.45, lng: -0.97 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(job.update).not.toHaveBeenCalled();
  });

  test('persists a point when refresh is set', async () => {
    const job = { id: 8, address: 'Reading Community Hall', lat: 51.45, lng: -0.97, update: jest.fn() };
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => [{ lat: '51.46', lon: '-0.98' }],
    }));
    await expect(ensureJobSitePoint(job, { refresh: true, fetchImpl })).resolves.toEqual({
      lat: 51.46, lng: -0.98,
    });
    expect(job.update).toHaveBeenCalledWith({ lat: 51.46, lng: -0.98 });
  });
});
