import React, { useEffect, useState } from 'react';
import api from '../api';
import { useI18n } from '../i18n';

type Note = { id: number; user_id: number; content: string; created_at: string };

const NotesPage: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { t } = useI18n();

  async function load() {
    const res = await api.get('/api/notes');
    setNotes(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/api/notes', { content: content.trim() });
      setNotes((prev) => [res.data, ...prev]);
      setContent('');
    } finally {
      setSubmitting(false);
    }
  }

  async function delNote(id: number) {
    await api.delete(`/api/notes/${id}`);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="container page-animate">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 className="page-title">{t('notes.title')}</h2>
            <p className="page-subtitle">{t('notes.subtitle')}</p>
          </div>
          <div className="section-meta">
            <div className="pill">
              <span className="pill-dot" />
              {t('notes.pillTime')}
            </div>
            <div className="pill">
              <span className="pill-dot accent" />
              {t('notes.pillUser')}
            </div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={addNote} className="row">
          <input
            placeholder={t('notes.placeholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="primary" disabled={submitting || !content.trim()}>{t('notes.add')}</button>
        </form>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {notes.map((n) => (
          <div key={n.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div>{n.content}</div>
              <div className="muted" style={{ fontSize: 12 }}>{new Date(n.created_at).toLocaleString()}</div>
            </div>
            <div>
              <button onClick={() => delNote(n.id)}>{t('notes.delete')}</button>
            </div>
          </div>
        ))}
        {notes.length === 0 && <div className="muted">{t('notes.empty')}</div>}
      </div>
    </div>
  );
};

export default NotesPage;
