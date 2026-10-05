import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Mail, MessageSquare, ClipboardList } from 'lucide-react';
import { api } from '../lib/api';
import { PageLoading, LoadError, useToast, Toast } from './ui.jsx';

const CORE_FIELDS = [
  { key: 'quote_sent_whatsapp', label: 'Quote sent (WhatsApp)' },
  { key: 'quote_email_subject', label: 'Quote email subject' },
  { key: 'quote_email_body', label: 'Quote email body' },
  { key: 'invoice_email_subject', label: 'Invoice email subject' },
  { key: 'invoice_email_body', label: 'Invoice email body' },
];

const TOKENS = ['{name}', '{ref}', '{title}', '{total}', '{valid_until}', '{due_date}'];

function isMultiline(key) {
  return key.includes('body') || key.includes('whatsapp');
}

function Section({ title, hint, icon: Icon, children, as = 'h3' }) {
  const Heading = as;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon size={15} />
          </div>
        ) : null}
        <div className="min-w-0">
          <Heading className="text-[15px] font-semibold text-slate-900">{title}</Heading>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function TemplateField({ field, value, onChange, canEdit }) {
  const multiline = isMultiline(field.key);
  const shared = {
    id: `tpl-${field.key}`,
    className: `input ${multiline ? 'min-h-[7rem]' : ''}`,
    disabled: !canEdit,
    value: value || '',
    onChange,
  };
  return (
    <div>
      <label className="label" htmlFor={shared.id}>{field.label}</label>
      {multiline ? <textarea {...shared} rows={4} /> : <input {...shared} />}
    </div>
  );
}

/**
 * Message bodies + job checklist templates (requirement 17.2).
 * Follow-up sequence stays on Company (12.1). Extra named templates can be
 * picked on the customer conversation composer.
 */
export default function TemplateSettings({ canEdit }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newChecklistLabel, setNewChecklistLabel] = useState('');
  const [newChecklistItems, setNewChecklistItems] = useState('');
  const { toast, show } = useToast();

  useEffect(() => {
    let cancelled = false;
    api.get('/settings').then((d) => {
      if (cancelled) return;
      const t = d.settings?.templates || {};
      setSettings({
        templates: { ...t, custom: Array.isArray(t.custom) ? t.custom : [] },
        checklist_templates: Array.isArray(d.settings?.checklist_templates) ? d.settings.checklist_templates : [],
      });
    }).catch((err) => {
      if (!cancelled) {
        show(err.message, 'error');
        setLoadError(err.message || 'Could not load templates');
      }
    });
    return () => { cancelled = true; };
  }, [show]);

  if (loadError && !settings) return <LoadError message={loadError} />;
  if (!settings) return <PageLoading />;

  const setCore = (key) => (e) => setSettings({
    ...settings,
    templates: { ...settings.templates, [key]: e.target.value },
  });

  const custom = settings.templates.custom || [];
  const setCustomAt = (i, patch) => {
    setSettings({
      ...settings,
      templates: {
        ...settings.templates,
        custom: custom.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
      },
    });
  };

  const addCustom = () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
    if (!key || !newBody.trim()) {
      show('Key and body are required', 'error');
      return;
    }
    if (custom.some((row) => row.key === key) || CORE_FIELDS.some((f) => f.key === key)) {
      show('That key is already used', 'error');
      return;
    }
    setSettings({
      ...settings,
      templates: { ...settings.templates, custom: [...custom, { key, body: newBody }] },
    });
    setNewKey('');
    setNewBody('');
  };

  const patchChecklist = (id, patch) => {
    setSettings({
      ...settings,
      checklist_templates: settings.checklist_templates.map((tpl) => (tpl.id === id ? { ...tpl, ...patch } : tpl)),
    });
  };

  const slugChecklistId = (label) => String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

  const uniqueChecklistId = (label) => {
    const base = slugChecklistId(label) || 'checklist';
    const ids = new Set(settings.checklist_templates.map((tpl) => tpl.id));
    if (!ids.has(base)) return base;
    for (let n = 2; n < 100; n += 1) {
      const id = `${base}_${n}`.slice(0, 40);
      if (!ids.has(id)) return id;
    }
    return `${base}_${Date.now().toString(36)}`.slice(0, 40);
  };

  const addChecklist = () => {
    const label = newChecklistLabel.trim();
    const items = newChecklistItems.split('\n').map((row) => row.trim()).filter(Boolean);
    if (!label || !items.length) {
      show('Label and at least one item are required', 'error');
      return;
    }
    const id = uniqueChecklistId(label);
    setSettings({
      ...settings,
      checklist_templates: [...settings.checklist_templates, { id, label, items }],
    });
    setNewChecklistLabel('');
    setNewChecklistItems('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings', {
        templates: settings.templates,
        checklist_templates: settings.checklist_templates,
      });
      show('Saved');
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => CORE_FIELDS.find((f) => f.key === key);

  return (
    <div>
      {canEdit && (
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <p className="min-w-0 truncate text-sm text-slate-500">Used on quotes, invoices, messages, and job checklists.</p>
          <button type="button" onClick={save} disabled={saving} className="btn-primary shrink-0">
            {saving ? 'Saving…' : 'Save templates'}
          </button>
        </div>
      )}

      <div className="space-y-5">
        <Section
          icon={Mail}
          title="Message templates"
          hint="Quote follow-up steps stay on the Company tab."
        >
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tokens</span>
            {TOKENS.map((token) => (
              <code key={token} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                {token}
              </code>
            ))}
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Quote</p>
              <div className="grid gap-3 lg:grid-cols-2">
                <TemplateField field={field('quote_sent_whatsapp')} value={settings.templates.quote_sent_whatsapp} onChange={setCore('quote_sent_whatsapp')} canEdit={canEdit} />
                <TemplateField field={field('quote_email_subject')} value={settings.templates.quote_email_subject} onChange={setCore('quote_email_subject')} canEdit={canEdit} />
                <div className="lg:col-span-2">
                  <TemplateField field={field('quote_email_body')} value={settings.templates.quote_email_body} onChange={setCore('quote_email_body')} canEdit={canEdit} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice</p>
              <div className="grid gap-3 lg:grid-cols-2">
                <TemplateField field={field('invoice_email_subject')} value={settings.templates.invoice_email_subject} onChange={setCore('invoice_email_subject')} canEdit={canEdit} />
                <div className="lg:col-span-2">
                  <TemplateField field={field('invoice_email_body')} value={settings.templates.invoice_email_body} onChange={setCore('invoice_email_body')} canEdit={canEdit} />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          as="h4"
          icon={MessageSquare}
          title="Named templates"
          hint="Extra key/body pairs. Pick them when writing to a customer."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {custom.map((row, i) => (
              <div key={row.key} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{row.key}</code>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 text-xs inline-flex items-center gap-1"
                      onClick={() => setSettings({
                        ...settings,
                        templates: { ...settings.templates, custom: custom.filter((_, idx) => idx !== i) },
                      })}
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor={`custom-body-${row.key}`}>Body</label>
                  <textarea
                    id={`custom-body-${row.key}`}
                    className="input min-h-[5.5rem]"
                    rows={3}
                    disabled={!canEdit}
                    value={row.body}
                    onChange={(e) => setCustomAt(i, { body: e.target.value })}
                  />
                </div>
              </div>
            ))}
            {canEdit && (
              <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
                <div>
                  <label className="label" htmlFor="custom-tpl-key">New template key</label>
                  <input id="custom-tpl-key" className="input" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="site_visit_confirm" />
                </div>
                <div>
                  <label className="label" htmlFor="custom-tpl-body">New template body</label>
                  <textarea id="custom-tpl-body" className="input min-h-[4.5rem]" rows={3} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
                </div>
                <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1" onClick={addCustom}>
                  <Plus size={14} /> Add named template
                </button>
              </div>
            )}
          </div>
        </Section>

        <Section
          icon={ClipboardList}
          title="Job checklist templates"
          hint="Add, edit, or delete lists. Applying a template on a job copies the items; existing job checklists stay as copied."
        >
          {settings.checklist_templates.length === 0 && (
            <p className="text-sm text-slate-400">No checklist templates yet. Add one below.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {settings.checklist_templates.map((tpl) => (
              <div key={tpl.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{tpl.label || tpl.id}</p>
                    <code className="text-[11px] text-slate-400">{tpl.id}</code>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-ghost !px-2 !py-1 text-xs inline-flex items-center gap-1 shrink-0"
                      onClick={() => setSettings({
                        ...settings,
                        checklist_templates: settings.checklist_templates.filter((t) => t.id !== tpl.id),
                      })}
                    >
                      <Trash2 size={12} /> Delete template
                    </button>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor={`chk-label-${tpl.id}`}>Label</label>
                  <input
                    id={`chk-label-${tpl.id}`}
                    className="input"
                    disabled={!canEdit}
                    value={tpl.label}
                    onChange={(e) => patchChecklist(tpl.id, { label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`chk-items-${tpl.id}`}>Items (one per line)</label>
                  <textarea
                    id={`chk-items-${tpl.id}`}
                    className="input min-h-[8rem]"
                    rows={6}
                    disabled={!canEdit}
                    value={(tpl.items || []).join('\n')}
                    onChange={(e) => patchChecklist(tpl.id, { items: e.target.value.split('\n') })}
                  />
                </div>
              </div>
            ))}
            {canEdit && (
              <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
                <p className="text-sm font-semibold text-slate-900">New checklist template</p>
                <div>
                  <label className="label" htmlFor="chk-new-label">New checklist label</label>
                  <input
                    id="chk-new-label"
                    className="input"
                    value={newChecklistLabel}
                    onChange={(e) => setNewChecklistLabel(e.target.value)}
                    placeholder="Chimney"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="chk-new-items">New checklist items (one per line)</label>
                  <textarea
                    id="chk-new-items"
                    className="input min-h-[8rem]"
                    rows={6}
                    value={newChecklistItems}
                    onChange={(e) => setNewChecklistItems(e.target.value)}
                    placeholder={'Scaffold check\nProtect garden'}
                  />
                </div>
                <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm inline-flex items-center gap-1" onClick={addChecklist}>
                  <Plus size={14} /> Add checklist template
                </button>
              </div>
            )}
          </div>
        </Section>
      </div>
      <Toast {...toast} />
    </div>
  );
}
