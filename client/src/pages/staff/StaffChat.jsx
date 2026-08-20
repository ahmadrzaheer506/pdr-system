import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api, fmtDateTime } from '../../lib/api';
import { Avatar, PageLoading } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';

export default function StaffChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const bottomRef = useRef(null);

  const load = () => api.get('/chat').then((d) => setMessages(d.messages));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBody('');
    await api.post('/chat', { body });
    load();
  };

  if (!messages) return <PageLoading />;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      <h1 className="text-xl font-bold text-slate-900 mb-3">Team Chat</h1>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.user_id === user.id ? 'flex-row-reverse' : ''}`}>
            <Avatar name={m.user_name} color={m.color} size={6} />
            <div className={`max-w-[75%] flex flex-col ${m.user_id === user.id ? 'items-end' : ''}`}>
              <div className="text-[10px] text-slate-400 mb-0.5">{m.user_name.split(' ')[0]} · {fmtDateTime(m.created_at)}</div>
              <div className={`rounded-xl px-3 py-1.5 text-sm ${m.user_id === user.id ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}`}>{m.body}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
        <input className="input flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the team…" />
        <button className="btn-primary"><Send size={16} /></button>
      </form>
    </div>
  );
}
