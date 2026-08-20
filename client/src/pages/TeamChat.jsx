import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api, fmtDateTime } from '../lib/api';
import { Avatar, PageLoading } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function TeamChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const bottomRef = useRef(null);

  const load = () => api.get('/chat').then((d) => setMessages(d.messages));
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBody('');
    await api.post('/chat', { body });
    load();
  };

  if (!messages) return <PageLoading />;

  return (
    <div className="space-y-5 flex flex-col h-[calc(100vh-64px)]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team Chat</h1>
        <p className="text-slate-500 text-sm mt-0.5">All-staff channel — general announcements. Job-specific chat lives on each job.</p>
      </div>
      <div className="card p-4 flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-2.5 ${m.user_id === user.id ? 'flex-row-reverse' : ''}`}>
              <Avatar name={m.user_name} color={m.color} size={7} />
              <div className={`max-w-[70%] ${m.user_id === user.id ? 'items-end' : ''} flex flex-col`}>
                <div className="text-[11px] text-slate-400 mb-0.5">{m.user_name} · {fmtDateTime(m.created_at)}</div>
                <div className={`rounded-xl px-3.5 py-2 text-sm ${m.user_id === user.id ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}`}>{m.body}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
          <input className="input flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the team…" />
          <button className="btn-primary"><Send size={16} /></button>
        </form>
      </div>
    </div>
  );
}
