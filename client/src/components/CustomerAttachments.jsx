import React, { useRef, useState } from 'react';
import { Paperclip, Trash2, Download, FileText } from 'lucide-react';
import { api, fmtDateTime } from '../lib/api';
import ScrollableLeadList from './ScrollableLeadList.jsx';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

function fmtBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileUrl(customerId, fileId, download) {
  return `/api/customers/${customerId}/files/${fileId}${download ? '?download=1' : ''}`;
}

/**
 * Customer-only photo/PDF attachments (requirement 2.4).
 * Stored on the server under data/files; never sent to the customer.
 */
export default function CustomerAttachments({ customerId, files, onChanged, onError }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload(`/customers/${customerId}/files`, fd);
      onChanged();
    } catch (err) {
      onError(err.message || 'Could not upload the file');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (fileId) => {
    try {
      await api.del(`/customers/${customerId}/files/${fileId}`);
      onChanged();
    } catch (err) {
      onError(err.message || 'Could not delete the file');
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="attachments-heading" className="font-semibold text-slate-800 flex items-center gap-2">
          <Paperclip size={16} /> Attachments
        </h3>
        <label className="btn-secondary relative overflow-hidden !py-1.5 !px-3 text-xs cursor-pointer">
          {uploading ? 'Uploading…' : 'Upload'}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={uploading}
            aria-label="Upload attachment"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="text-xs text-slate-400 mb-3">JPEG, PNG, WebP or PDF · max 10MB · office only, never sent to the customer.</p>
      {(!files || files.length === 0) && <p className="text-sm text-slate-400">No attachments yet.</p>}
      {files?.length > 0 && (
        <ScrollableLeadList
          labelledBy="attachments-heading"
          count={files.length}
          limit={3}
          fallbackClass="max-h-[20rem]"
        >
          {files.map((f) => {
            const isImage = (f.mime || '').startsWith('image/');
            return (
              <div key={f.id} role="listitem" className="border border-slate-100 rounded-lg p-3 flex gap-3 items-start">
                {isImage ? (
                  <img src={fileUrl(customerId, f.id)} alt={f.original_name} className="h-14 w-14 object-cover rounded-md bg-slate-50" />
                ) : (
                  <div className="h-14 w-14 rounded-md bg-slate-50 text-slate-400 flex items-center justify-center">
                    <FileText size={22} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{f.original_name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {fmtBytes(f.size_bytes)} · {fmtDateTime(f.created_at)}
                    {f.user_name ? ` · ${f.user_name}` : ''}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <a href={fileUrl(customerId, f.id, true)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label={`Download ${f.original_name}`}>
                    <Download size={14} />
                  </a>
                  <button type="button" className="p-1.5 text-slate-400 hover:text-rose-600" onClick={() => remove(f.id)} aria-label={`Delete ${f.original_name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </ScrollableLeadList>
      )}
    </div>
  );
}
