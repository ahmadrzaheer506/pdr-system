'use strict';

const express = require('express');
const { JobType } = require('../models');
const { requireAuth, requireOffice, requireAdmin, asyncHandler } = require('../auth');
const skills = require('../skills');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', asyncHandler(async (req, res) => {
  res.json({ job_types: await skills.listJobTypeRows() });
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Job type name is required' });
  const catalogue = await skills.listSkillRows();
  const maxOrder = await JobType.max('sort_order');
  const row = await JobType.create({
    name,
    required_skills: skills.normaliseJobSkills(req.body?.required_skills, catalogue),
    sort_order: Number.isFinite(Number(req.body?.sort_order))
      ? Number(req.body.sort_order)
      : (Number(maxOrder) || 0) + 1,
  });
  res.json({ job_type: skills.publicJobType(row) });
}));

router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const row = await JobType.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job type not found' });
  const updates = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Job type name is required' });
    updates.name = name;
  }
  if (req.body?.required_skills !== undefined) {
    const catalogue = await skills.listSkillRows();
    updates.required_skills = skills.normaliseJobSkills(req.body.required_skills, catalogue);
  }
  if (req.body?.sort_order !== undefined) {
    const n = Number(req.body.sort_order);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'Invalid sort order' });
    updates.sort_order = n;
  }
  if (Object.keys(updates).length) await row.update(updates);
  res.json({ job_type: skills.publicJobType(row) });
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const row = await JobType.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job type not found' });
  const { Job } = require('../models');
  await Job.update({ job_type_id: null }, { where: { job_type_id: row.id } });
  await row.destroy();
  res.json({ ok: true });
}));

module.exports = router;
