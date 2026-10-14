jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
  requireOffice: (req, res, next) => next(),
  requireAdmin: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../models', () => ({
  Skill: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    max: jest.fn(),
  },
  JobType: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    max: jest.fn(),
  },
  User: { findAll: jest.fn() },
  Job: { findAll: jest.fn(), update: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const { Skill, JobType, User, Job } = require('../models');
const skillsRoutes = require('../routes/skills');
const jobTypeRoutes = require('../routes/jobTypes');

const app = express();
app.use(express.json());
app.use('/api/skills', skillsRoutes);
app.use('/api/job-types', jobTypeRoutes);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('skills and job-types CRUD', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET /api/skills lists the catalogue', async () => {
    Skill.findAll.mockResolvedValue([{ id: 1, slug: 'roofing', name: 'Roofing', sort_order: 0 }]);
    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
    expect(res.body.skills).toEqual([expect.objectContaining({ id: 1, name: 'Roofing' })]);
    expect(res.body.levels.map((l) => l.id)).toEqual(['trainee', 'competent', 'advanced']);
  });

  test('POST /api/skills creates a skill', async () => {
    Skill.max.mockResolvedValue(3);
    Skill.findOne.mockResolvedValue(null);
    Skill.create.mockResolvedValue({ id: 19, slug: 'solar', name: 'Solar', sort_order: 4 });
    const res = await request(app).post('/api/skills').send({ name: 'Solar' });
    expect(res.status).toBe(200);
    expect(Skill.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Solar', slug: 'solar' }));
  });

  test('POST /api/skills requires a name', async () => {
    const res = await request(app).post('/api/skills').send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  test('PUT /api/skills/:id renames a skill', async () => {
    const row = { id: 1, slug: 'roofing', name: 'Roofing', update: jest.fn() };
    Skill.findByPk.mockResolvedValue(row);
    const res = await request(app).put('/api/skills/1').send({ name: 'Pitched Roofing' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ name: 'Pitched Roofing' });
  });

  test('DELETE /api/skills/:id strips the skill from staff and jobs', async () => {
    const row = { id: 1, destroy: jest.fn() };
    Skill.findByPk.mockResolvedValue(row);
    const user = {
      id: 3,
      skills: [{ skill_id: 1, level: 'advanced' }, { skill_id: 2, level: 'trainee' }],
      update: jest.fn(),
    };
    const job = { id: 8, required_skills: [{ skill_id: 1, level: 'competent' }], update: jest.fn() };
    const type = { id: 4, required_skills: [{ skill_id: 1, level: 'advanced' }], update: jest.fn() };
    User.findAll.mockResolvedValue([user]);
    Job.findAll.mockResolvedValue([job]);
    JobType.findAll.mockResolvedValue([type]);
    const res = await request(app).delete('/api/skills/1');
    expect(res.status).toBe(200);
    expect(user.update).toHaveBeenCalledWith({ skills: [{ skill_id: 2, level: 'trainee' }] });
    expect(job.update).toHaveBeenCalledWith({ required_skills: [] });
    expect(type.update).toHaveBeenCalledWith({ required_skills: [] });
    expect(row.destroy).toHaveBeenCalled();
  });

  test('POST /api/job-types stores required skills', async () => {
    Skill.findAll.mockResolvedValue([{ id: 1, slug: 'roofing', name: 'Roofing', sort_order: 0 }]);
    JobType.max.mockResolvedValue(2);
    JobType.create.mockResolvedValue({
      id: 9, name: 'Re-roof', required_skills: [{ skill_id: 1, level: 'advanced' }], sort_order: 3,
    });
    const res = await request(app).post('/api/job-types').send({
      name: 'Re-roof',
      required_skills: [{ skill_id: 1, level: 'advanced' }, { skill_id: 99, level: 'trainee' }],
    });
    expect(res.status).toBe(200);
    expect(JobType.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Re-roof',
      required_skills: [{ skill_id: 1, level: 'advanced' }],
    }));
  });
});
