import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileText, StickyNote, Trash2, Download } from 'lucide-react';
import { api, fmtDateTime } from '../lib/api';
import { PHOTO_STAGES, PHOTO_STAGE_LABELS, filesForStage, documentFiles } from '../lib/jobFiles';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const PDF_ACCEPT = 'application/pdf,.pdf';

function fmtBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileUrl(apiBase, jobId, fileId, download) {
  return `/api${apiBase}/${jobId}/files/${fileId}${download ? '?download=1' : ''}`;
}

/**
 * Before/during/after photos, PDF documents, and a single progress-notes field.
 * Shared by the office job modal and the staff job screen (requirement 7.4).
 */
export default function JobFiles({
  jobId,
  apiBase,
  files = [],
  notes,
  onChanged,
  onError,
}) {
  const [note, setNote] = useState(notes || '');
  const [saving, setSaving] = useState(false);
  const beforeRef = useRef(null);
  const duringRef = useRef(null);
  const afterRef = useRef(null);
  const docRef = useRef(null);
  const photoRefs = { before: beforeRef, during: duringRef, after: afterRef };

  useEffect(() => {
    setNote(notes || '');
  }, [notes]);

  const run = async (fn) => {
    setSaving(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const upload = (file, stage) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    if (stage) fd.append('stage', stage);
    return run(() => api.upload(`${apiBase}/${jobId}/files`, fd));
  };

  const retag = (file, stage) => run(() => api.put(`${apiBase}/${jobId}/files/${file.id}`, { stage }));
  const remove = (file) => run(() => api.del(`${apiBase}/${jobId}/files/${file.id}`));

  const saveNotes = () => run(() => api.put(`${apiBase}/${jobId}`, { notes: note }));

  const docs = documentFiles(files);

  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-2 flex items-center gap-1.5"><Camera size={13} /> Site photos</div>
        <p className="text-xs text-slate-400 mb-2">JPEG, PNG or WebP · max 10MB · tag before, during or after. Stays on this job, never sent to the customer.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PHOTO_STAGES.map((stage) => {
            const group = filesForStage(files, stage);
            return (
              <div key={stage} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{PHOTO_STAGE_LABELS[stage]}</div>
                  <label className="btn-secondary relative overflow-hidden !py-1 !px-2 text-[10px] cursor-pointer">
                    {saving ? '…' : 'Upload'}
                    <input
                      ref={photoRefs[stage]}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      capture="environment"
                      className="sr-only"
                      disabled={saving}
                      aria-label={`Upload ${stage} photo`}
                      onChange={(e) => {
                        upload(e.target.files?.[0], stage);
                        if (photoRefs[stage].current) photoRefs[stage].current.value = '';
                      }}
                    />
                  </label>
                </div>
                {group.length === 0 && <p className="text-xs text-slate-400">No {stage} photos yet.</p>}
                <ul className="space-y-2">
                  {group.map((f) => (
                    <li key={f.id} className="space-y-1">
                      <img src={fileUrl(apiBase, jobId, f.id)} alt={f.original_name} className="w-full h-20 object-cover rounded-md bg-slate-50" />
                      <div className="text-[11px] text-slate-600 truncate">{f.original_name}</div>
                      <div className="flex flex-wrap gap-1">
                        {PHOTO_STAGES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={saving}
                            onClick={() => retag(f, s)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                              f.stage === s ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                        <a href={fileUrl(apiBase, jobId, f.id, true)} className="p-0.5 text-slate-400 hover:text-slate-700" aria-label={`Download ${f.original_name}`}>
                          <Download size={12} />
                        </a>
                        <button type="button" disabled={saving} onClick={() => remove(f)} className="p-0.5 text-slate-400 hover:text-rose-600" aria-label={`Delete ${f.original_name}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="label mb-2 flex items-center gap-1.5"><FileText size={13} /> Documents</div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs text-slate-400">PDF · max 10MB · no photo stage.</p>
          <label className="btn-secondary relative overflow-hidden !py-1 !px-3 text-xs cursor-pointer">
            {saving ? 'Uploading…' : 'Upload'}
            <input
              ref={docRef}
              type="file"
              accept={PDF_ACCEPT}
              className="sr-only"
              disabled={saving}
              aria-label="Upload document"
              onChange={(e) => {
                upload(e.target.files?.[0], null);
                if (docRef.current) docRef.current.value = '';
              }}
            />
          </label>
        </div>
        {docs.length === 0 && <p className="text-xs text-slate-400">No documents yet.</p>}
        <ul className="space-y-2">
          {docs.map((f) => (
            <li key={f.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 flex gap-2 items-start">
              <div className="h-10 w-10 rounded-md bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{f.original_name}</div>
                <div className="text-[11px] text-slate-400">
                  {fmtBytes(f.size_bytes)} · {fmtDateTime(f.created_at)}
                  {f.user_name ? ` · ${f.user_name}` : ''}
                </div>
              </div>
              <a href={fileUrl(apiBase, jobId, f.id, true)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label={`Download ${f.original_name}`}>
                <Download size={14} />
              </a>
              <button type="button" disabled={saving} onClick={() => remove(f)} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label={`Delete ${f.original_name}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="label mb-2 flex items-center gap-1.5"><StickyNote size={13} /> Progress notes</div>
        <textarea
          className="input !py-2"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Site progress, access, weather…"
          aria-label="Progress notes"
        />
        <button
          type="button"
          disabled={saving || note === (notes || '')}
          onClick={saveNotes}
          className="btn-secondary !py-1 !px-3 text-xs mt-2"
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}
