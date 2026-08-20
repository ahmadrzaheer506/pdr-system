import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money, fmtTimeAgo, api } from '../lib/api';
import { PageLoading } from '../components/ui.jsx';

const COL_META = {
  ENQUIRY: { color: '#64748b' }, SITE_VISIT_BOOKED: { color: '#0284c7' }, QUOTE_PENDING: { color: '#d97706' },
  QUOTED: { color: '#4f46e5' }, FOLLOW_UP: { color: '#9333ea' }, WON: { color: '#059669' }, LOST: { color: '#e11d48' },
  SCHEDULED: { color: '#0891b2' }, IN_PROGRESS: { color: '#2563eb' }, COMPLETED: { color: '#0d9488' },
  INVOICED: { color: '#ea580c' }, PAID: { color: '#16a34a' },
};

export default function Pipeline() {
  const [data, setData] = useState(null);
  const [dragCard, setDragCard] = useState(null);

  const load = () => api.get('/customers/pipeline/board').then(setData);
  useEffect(() => { load(); }, []);

  const moveStage = async (customerId, toStage) => {
    setData((d) => {
      const next = { ...d, board: { ...d.board } };
      let card = null;
      for (const s of d.stages) {
        const idx = next.board[s].findIndex((c) => c.id === customerId);
        if (idx > -1) { card = next.board[s][idx]; next.board[s] = next.board[s].filter((c) => c.id !== customerId); break; }
      }
      if (card) next.board[toStage] = [{ ...card, stage: toStage }, ...next.board[toStage]];
      return next;
    });
    try { await api.put(`/customers/${customerId}/stage`, { stage: toStage }); } catch { load(); }
  };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-slate-500 text-sm mt-0.5">Drag a card to move a customer's stage, or open a card for full detail.</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {data.stages.map((stage) => (
          <div
            key={stage}
            className="flex-shrink-0 w-72"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragCard && moveStage(dragCard, stage)}
          >
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="w-2 h-2 rounded-full" style={{ background: COL_META[stage]?.color }} />
              <h3 className="font-semibold text-sm text-slate-700">{data.labels[stage]}</h3>
              <span className="text-xs text-slate-400 ml-auto">{data.board[stage].length}</span>
            </div>
            <div className="kanban-col space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {data.board[stage].map((c) => (
                <Link
                  to={`/customers/${c.id}`}
                  key={c.id}
                  draggable
                  onDragStart={() => setDragCard(c.id)}
                  className="card p-3 block hover:shadow-md hover:border-brand-300 transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="font-medium text-sm text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{c.address}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs capitalize text-slate-400">{c.source?.replace('_', ' ')}</span>
                    {c.latest_quote_total ? <span className="text-xs font-semibold text-slate-700">{money(c.latest_quote_total)}</span> : null}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-slate-400">{fmtTimeAgo(c.updated_at)}</span>
                    {c.open_tasks > 0 && <span className="badge bg-amber-100 text-amber-700 !text-[10px] !px-1.5">{c.open_tasks} task{c.open_tasks > 1 ? 's' : ''}</span>}
                  </div>
                </Link>
              ))}
              {data.board[stage].length === 0 && <div className="text-xs text-slate-300 text-center py-6 border border-dashed border-slate-200 rounded-lg">Empty</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
