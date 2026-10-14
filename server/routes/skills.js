'use strict';

const express = require('express');
const { Skill } = require('../models');
const { requireAuth, requireOffice, requireAdmin, asyncHandler } = require('../auth');
const skills = require('../skills');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', asyncHandler(async (req, res) => {
  res.json({
    skills: await skills.listSkillRows(),
    levels: skills.SKILL_LEVELS.map((id) => ({ id, label: skills.LEVEL_LABELS[id] })),
  });
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Skill name is required' });
  const slug = await skills.uniqueSlug(req.body?.slug || name);
  const maxOrder = await Skill.max('sort_order');
  const row = await Skill.create({
    name,
    slug,
    sort_order: Number.isFinite(Number(req.body?.sort_order))
      ? Number(req.body.sort_order)
      : (Number(maxOrder) || 0) + 1,
  });
  res.json({ skill: skills.publicSkill(row) });
}));

router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const row = await Skill.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Skill not found' });
  const updates = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Skill name is required' });
    updates.name = name;
  }
  if (req.body?.slug !== undefined) {
    const slug = await skills.uniqueSlug(req.body.slug || updates.name || row.name, row.id);
    updates.slug = slug;
  }
  if (req.body?.sort_order !== undefined) {
    const n = Number(req.body.sort_order);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'Invalid sort order' });
    updates.sort_order = n;
  }
  if (Object.keys(updates).length) await row.update(updates);
  res.json({ skill: skills.publicSkill(row) });
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const row = await Skill.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Skill not found' });
  await skills.removeSkillFromRecords(row.id);
  await row.destroy();
  res.json({ ok: true });
}));

module.exports = router;
