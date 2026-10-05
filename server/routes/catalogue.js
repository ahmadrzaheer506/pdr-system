const express = require('express');
const { CatalogueItem } = require('../models');
const { getSetting } = require('../db');
const { requireAuth, requireOffice, requireAdmin, asyncHandler } = require('../auth');
const catalogue = require('../catalogue');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', asyncHandler(async (req, res) => {
  const items = await catalogue.listItems({
    q: req.query.q,
    kind: req.query.kind,
  });
  res.json({ items });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const item = await catalogue.findItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Catalogue item not found' });
  res.json({ item });
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const uk = (await getSetting('uk')) || {};
  const parsed = catalogue.parseCatalogueItem(req.body || {}, { requireId: true, uk });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const row = await CatalogueItem.create(parsed.value);
    res.json({ item: catalogue.publicItem(row) });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Catalogue id already exists' });
    }
    throw err;
  }
}));

router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const row = await CatalogueItem.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Catalogue item not found' });
  const uk = (await getSetting('uk')) || {};
  const parsed = catalogue.parseCatalogueItem(
    { ...req.body, id: row.id },
    { requireId: true, uk },
  );
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { id: _id, ...fields } = parsed.value;
  await row.update(fields);
  res.json({ item: catalogue.publicItem(row) });
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const row = await CatalogueItem.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Catalogue item not found' });
  await row.destroy();
  res.json({ ok: true });
}));

module.exports = router;
