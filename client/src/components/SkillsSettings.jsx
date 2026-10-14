import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wrench, Briefcase } from 'lucide-react';
import { api } from '../lib/api';
import { Modal, PageLoading, useToast, Toast } from './ui.jsx';
import SkillPicker from './SkillPicker.jsx';
import { skillLabel } from '../lib/skills';

function SkillForm({ draft, setDraft, saving, onSave, onClose }) {
  return (
    <Modal open={!!draft} onClose={onClose} title={draft?._existing ? 'Edit skill' : 'Add skill'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div>
          <label className="label" htmlFor="skill-name">Name</label>
          <input
            id="skill-name"
            className="input"
            value={draft?.name || ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function JobTypeForm({ draft, setDraft, skills, saving, onSave, onClose }) {
  return (
    <Modal open={!!draft} onClose={onClose} title={draft?._existing ? 'Edit job type' : 'Add job type'} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div>
          <label className="label" htmlFor="job-type-name">Name</label>
          <input
            id="job-type-name"
            className="input"
            value={draft?.name || ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            autoFocus
          />
        </div>
        <div>
          <p className="label">Required skills</p>
          <SkillPicker
            catalogue={skills}
            value={Array.isArray(draft?.required_skills) ? draft.required_skills : []}
            onChange={(required_skills) => setDraft({ ...draft, required_skills })}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SkillsSettings({ canEdit }) {
  const [skills, setSkills] = useState(null);
  const [jobTypes, setJobTypes] = useState(null);
  const [skillDraft, setSkillDraft] = useState(null);
  const [typeDraft, setTypeDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast();

  const load = useCallback(async () => {
    const [skillData, typeData] = await Promise.all([
      api.get('/skills'),
      api.get('/job-types'),
    ]);
    setSkills(skillData.skills || []);
    setJobTypes(typeData.job_types || []);
  }, []);

  useEffect(() => {
    load().catch((err) => show(err.message, 'error'));
  }, [load, show]);

  const saveSkill = async () => {
    setSaving(true);
    try {
      if (skillDraft._existing) {
        await api.put(`/skills/${skillDraft.id}`, { name: skillDraft.name });
      } else {
        await api.post('/skills', { name: skillDraft.name });
      }
      show('Saved');
      setSkillDraft(null);
      await load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeSkill = async (row) => {
    if (!window.confirm(`Delete “${row.name}”? It will be removed from staff and jobs.`)) return;
    try {
      await api.del(`/skills/${row.id}`);
      show('Deleted');
      await load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const saveType = async () => {
    setSaving(true);
    try {
      const payload = {
        name: typeDraft.name,
        required_skills: typeDraft.required_skills || [],
      };
      if (typeDraft._existing) {
        await api.put(`/job-types/${typeDraft.id}`, payload);
      } else {
        await api.post('/job-types', payload);
      }
      show('Saved');
      setTypeDraft(null);
      await load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeType = async (row) => {
    if (!window.confirm(`Delete job type “${row.name}”?`)) return;
    try {
      await api.del(`/job-types/${row.id}`);
      show('Deleted');
      await load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  if (!skills || !jobTypes) return <PageLoading />;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Wrench size={15} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Skills</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Staff pick from this list with Trainee, Competent, or Advanced. Jobs use the same list for what the work needs.
              </p>
            </div>
          </div>
          {canEdit ? (
            <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setSkillDraft({ name: '' })}>
              <Plus size={14} /> Add skill
            </button>
          ) : null}
        </div>
        <ul className="divide-y divide-slate-100">
          {skills.length === 0 && <li className="py-6 text-sm text-slate-400">No skills yet.</li>}
          {skills.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm font-medium text-slate-800">{row.name}</span>
              {canEdit ? (
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost !p-2" aria-label={`Edit ${row.name}`} onClick={() => setSkillDraft({ ...row, _existing: true })}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="btn-ghost !p-2 text-red-600" aria-label={`Delete ${row.name}`} onClick={() => removeSkill(row)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Briefcase size={15} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Job types</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Apply a type on a job to fill the required skills automatically — Re-roof, Lead valley, Extension, and so on.
              </p>
            </div>
          </div>
          {canEdit ? (
            <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setTypeDraft({ name: '', required_skills: [] })}>
              <Plus size={14} /> Add job type
            </button>
          ) : null}
        </div>
        <ul className="divide-y divide-slate-100">
          {jobTypes.length === 0 && <li className="py-6 text-sm text-slate-400">No job types yet.</li>}
          {jobTypes.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-slate-800">{row.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {(row.required_skills || []).map((req) => skillLabel(req, skills)).join(' · ') || 'No skills attached'}
                </div>
              </div>
              {canEdit ? (
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost !p-2" aria-label={`Edit ${row.name}`} onClick={() => setTypeDraft({ ...row, _existing: true })}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="btn-ghost !p-2 text-red-600" aria-label={`Delete ${row.name}`} onClick={() => removeType(row)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <SkillForm draft={skillDraft} setDraft={setSkillDraft} saving={saving} onSave={saveSkill} onClose={() => setSkillDraft(null)} />
      <JobTypeForm draft={typeDraft} setDraft={setTypeDraft} skills={skills} saving={saving} onSave={saveType} onClose={() => setTypeDraft(null)} />
      <Toast {...toast} />
    </div>
  );
}
