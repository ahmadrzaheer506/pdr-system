/**
 * Service catalogue for the quotation builder (requirement 6.1 / 17.2).
 *
 * Seeded rows live in `catalogue_items`. Prices copy onto the quote line and
 * can be overridden; later catalogue changes do not rewrite saved quotes.
 */
const { Op } = require('sequelize');
const ukTax = require('./services/ukTax');

const CATALOGUE_KINDS = Object.freeze(['labour', 'materials', 'both']);

const CATALOGUE = Object.freeze([
  { id: 'strip_covering', description: 'Strip existing covering, battens and felt', unit: 'm²', unit_price: 12, vat_code: 'standard', kind: 'labour' },
  { id: 'felt_3layer', description: 'Supply & fit 3-layer torch-on felt system', unit: 'm²', unit_price: 42, vat_code: 'standard', kind: 'materials' },
  { id: 'grp_overlay', description: 'GRP fibreglass overlay', unit: 'm²', unit_price: 58, vat_code: 'standard', kind: 'both' },
  { id: 'epdm', description: 'Supply & fit EPDM rubber covering', unit: 'm²', unit_price: 65, vat_code: 'standard', kind: 'materials' },
  { id: 'concrete_tiles', description: 'Supply & fit interlocking concrete tiles', unit: 'm²', unit_price: 24, vat_code: 'standard', kind: 'materials' },
  { id: 'slate', description: 'Supply & fit natural slate', unit: 'm²', unit_price: 68, vat_code: 'standard', kind: 'materials' },
  { id: 'breathable_felt', description: 'Breathable membrane & battens', unit: 'm²', unit_price: 8, vat_code: 'standard', kind: 'materials' },
  { id: 'ridge_dryfix', description: 'Dry-fix ridge and hip', unit: 'lin m', unit_price: 38, vat_code: 'standard', kind: 'both' },
  { id: 'gutter_upvc', description: 'Supply & fit UPVC guttering', unit: 'lin m', unit_price: 28, vat_code: 'standard', kind: 'materials' },
  { id: 'fascia_upvc', description: 'Supply & fit UPVC fascia & soffit', unit: 'lin m', unit_price: 34, vat_code: 'standard', kind: 'materials' },
  { id: 'lead_flashing', description: 'Code 4 lead flashing', unit: 'lin m', unit_price: 42, vat_code: 'standard', kind: 'materials' },
  { id: 'chimney_repoint', description: 'Repoint chimney stack', unit: 'each', unit_price: 380, vat_code: 'standard', kind: 'labour' },
  { id: 'chimney_cowl', description: 'Fit chimney cowl', unit: 'each', unit_price: 45, vat_code: 'standard', kind: 'materials' },
  { id: 'velux', description: 'Supply & fit Velux window', unit: 'each', unit_price: 640, vat_code: 'standard', kind: 'both' },
  { id: 'moss_removal', description: 'Roof moss removal (soft wash)', unit: 'item', unit_price: 340, vat_code: 'standard', kind: 'labour' },
  { id: 'cracked_tile', description: 'Replace cracked tile', unit: 'each', unit_price: 22, vat_code: 'standard', kind: 'both' },
  { id: 'scaffold', description: 'Scaffold', unit: 'item', unit_price: 450, vat_code: 'standard', kind: 'labour' },
  { id: 'skip', description: 'Skip hire', unit: 'each', unit_price: 220, vat_code: 'standard', kind: 'materials' },
]);

function publicItem(row) {
  const o = row && typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: o.id,
    description: o.description,
    unit: o.unit,
    unit_price: Number(o.unit_price),
    vat_code: o.vat_code,
    kind: o.kind,
  };
}

function slugId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
}

function allowedVatCodes(uk) {
  const codes = new Set(ukTax.CORE_VAT_CODES);
  for (const row of uk?.vat_rates || []) {
    if (row && row.code) codes.add(String(row.code));
  }
  return codes;
}

/**
 * Validate a catalogue row for create/update (requirement 17.2).
 * @returns {{ value: object }|{ error: string }}
 */
function parseCatalogueItem(body, { requireId = true, uk = {} } = {}) {
  const id = slugId(body?.id);
  if (requireId && !id) return { error: 'Catalogue id is required' };
  if (requireId && (id.length < 2 || id.length > 40)) return { error: 'Catalogue id must be 2–40 characters' };
  const description = String(body?.description || '').trim();
  if (!description) return { error: 'Description is required' };
  if (description.length > 500) return { error: 'Description is too long' };
  const unit = String(body?.unit || '').trim();
  if (!unit) return { error: 'Unit is required' };
  if (unit.length > 20) return { error: 'Unit is too long' };
  const unit_price = Number(body?.unit_price);
  if (!Number.isFinite(unit_price) || unit_price < 0) {
    return { error: 'Unit price must be a non-negative number' };
  }
  const vat_code = String(body?.vat_code || '').trim().toLowerCase();
  if (!allowedVatCodes(uk).has(vat_code)) {
    return { error: 'Invalid VAT code' };
  }
  const kind = String(body?.kind || '').trim().toLowerCase();
  if (!CATALOGUE_KINDS.includes(kind)) {
    return { error: 'Kind must be labour, materials, or both' };
  }
  const value = { description, unit, unit_price, vat_code, kind };
  if (requireId) value.id = id;
  return { value };
}

function escapeLike(q) {
  return String(q || '').replace(/[%_\\]/g, '\\$&').slice(0, 80);
}

async function listItems({ q, kind } = {}) {
  const { CatalogueItem } = require('./models');
  const where = {};
  if (kind && CATALOGUE_KINDS.includes(kind)) where.kind = kind;
  const term = escapeLike(q).trim();
  if (term) {
    const like = `%${term}%`;
    where[Op.or] = [
      { description: { [Op.iLike]: like } },
      { id: { [Op.iLike]: like } },
    ];
  }
  const rows = await CatalogueItem.findAll({
    where,
    order: [['description', 'ASC'], ['id', 'ASC']],
    limit: 500,
  });
  return rows.map(publicItem);
}

async function findItem(id) {
  const { CatalogueItem } = require('./models');
  if (!id) return null;
  const row = await CatalogueItem.findByPk(String(id));
  return row ? publicItem(row) : null;
}

function findCatalogueItem(id) {
  if (!id) return null;
  return CATALOGUE.find((row) => row.id === String(id)) || null;
}

/**
 * Copy catalogue fields onto a quote line. Quantity stays a simple measured qty.
 * @param {{ id: string, description: string, unit: string, unit_price: number, vat_code: string, kind: string }} item
 * @param {number} [qty]
 */
function lineFromCatalogue(item, qty = 1) {
  if (!item) return null;
  const amount = Number(qty);
  return {
    catalogue_id: item.id,
    description: item.description,
    unit: item.unit,
    qty: Number.isFinite(amount) && amount > 0 ? amount : 1,
    unit_price: item.unit_price,
    vat_code: item.vat_code,
    kind: item.kind,
  };
}

module.exports = {
  CATALOGUE,
  CATALOGUE_KINDS,
  parseCatalogueItem,
  listItems,
  findItem,
  findCatalogueItem,
  lineFromCatalogue,
  publicItem,
};
