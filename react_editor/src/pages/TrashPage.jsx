import { useState, useEffect } from 'react';
import { notifications } from '../utils/notifications.js';
import { apiFetch, getToken, removeToken } from '../utils/api.js';

const API = 'http://localhost:8012/api/projects';
const MINIO_BG = 'http://localhost:9000/app-backgrounds/bg10.jpg';
const MINIO_BG_ALT = 'http://localhost:9000/app-backgrounds/bg9.jpg';

function daysLeft(expiresAt) {
  if (!expiresAt) return 60;
  const diff = new Date(expiresAt) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function DaysLeftBadge({ days }) {
  const color = days <= 7 ? '#e53e3e' : days <= 14 ? '#d69e2e' : '#8b9cbd';
  const bg    = days <= 7 ? 'rgba(229,62,62,0.12)' : days <= 14 ? 'rgba(214,158,46,0.12)' : 'rgba(139,156,189,0.1)';
  return (
    <span style={{ background: bg, color, fontFamily: 'Nunito', fontSize: 11, fontWeight: 700,
      padding: '3px 10px', borderRadius: 20, border: `1px solid ${color}30`, whiteSpace: 'nowrap' }}>
      {days === 0 ? 'Удаляется...' : `${days} дн.`}
    </span>
  );
}

export default function TrashPage() {
  const [tab,      setTab]      = useState('projects');
  const [projects, setProjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [bgError,  setBgError]  = useState(false);

  const onUnauth = () => { removeToken(); window.location.href = 'http://localhost:8010/'; };

  const bgCss = bgError
    ? 'linear-gradient(135deg, #e8eaf8 0%, #c5c8e8 30%, #6b6fb5 65%, #3b3d8a 100%)'
    : `url(${MINIO_BG}) center/cover no-repeat fixed`;

  useEffect(() => {
    const tok = new URLSearchParams(window.location.search).get('token');
    if (tok) { localStorage.setItem('access_token', tok); window.history.replaceState({}, '', window.location.pathname); }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch(`${API}/trash/items`, {}, onUnauth);
    if (!res || !res.ok) { notifications.error('Не удалось загрузить корзину'); setLoading(false); return; }
    const data = await res.json();
    setProjects(data.projects || []);
    setChapters(data.chapters || []);
    setLoading(false);
  };

  const restoreProject = async (id) => {
    const res = await apiFetch(`${API}/${id}/restore`, { method: 'POST' }, onUnauth);
    if (res?.ok) {
      await fetch(`http://localhost:8011/api/catalog/projects/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      }).catch(() => {});
      notifications.success('Проект восстановлен');
      load();
    }
    else notifications.error('Не удалось восстановить');
  };

  const purgeProject = async (id) => {
    if (!confirm('Удалить проект навсегда? Это действие нельзя отменить.')) return;
    const res = await apiFetch(`${API}/${id}/purge`, { method: 'DELETE' }, onUnauth);
    if (res?.ok || res?.status === 204) { notifications.success('Проект удалён'); load(); }
    else notifications.error('Ошибка при удалении');
  };

  const restoreChapter = async (projectId, chapterId) => {
    const res = await apiFetch(`${API}/${projectId}/chapters/${chapterId}/restore`, { method: 'POST' }, onUnauth);
    if (res?.ok) { notifications.success('Глава восстановлена'); load(); }
    else notifications.error('Не удалось восстановить');
  };

  const purgeChapter = async (projectId, chapterId) => {
    if (!confirm('Удалить главу навсегда?')) return;
    const res = await apiFetch(`${API}/${projectId}/chapters/${chapterId}/purge`, { method: 'DELETE' }, onUnauth);
    if (res?.ok || res?.status === 204) { notifications.success('Глава удалена'); load(); }
    else notifications.error('Ошибка при удалении');
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.92)', borderRadius: 16,
    padding: '18px 22px', display: 'flex', alignItems: 'center',
    gap: 16, boxShadow: '0 2px 12px rgba(43,44,127,0.08)',
    border: '1px solid rgba(43,44,127,0.08)',
  };
  const btnStyle = (danger) => ({
    padding: '7px 16px', borderRadius: 9, border: '1.5px solid',
    borderColor: danger ? 'rgba(229,62,62,0.35)' : 'rgba(43,44,127,0.25)',
    background: danger ? 'rgba(229,62,62,0.07)' : 'rgba(43,44,127,0.07)',
    color: danger ? '#c0392b' : '#2b2c7f',
    fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100vh', background: bgCss, position: 'relative' }}>
      <style>{`* { margin: 0; padding: 0; box-sizing: border-box; } html, body { height: 100%; }`}</style>
      <img src={MINIO_BG} style={{ display: 'none' }} onError={() => setBgError(true)} alt="" />
      <div style={{ minHeight: '100vh', background: 'rgba(30,32,90,0.45)', backdropFilter: 'blur(2px)' }}>

        {/* Header */}
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontFamily: 'Nunito', fontWeight: 900, fontSize: 28, color: '#fff', margin: 0 }}>
                Корзина
              </h1>
              <p style={{ fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '6px 0 0' }}>
                Элементы автоматически удаляются через 60 дней
              </p>
            </div>
            <button
              onClick={() => { window.location.href = 'http://localhost:8011/catalog'; }}
              style={{ ...btnStyle(false), background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              К каталогу
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[
              { id: 'projects', label: `Проекты (${projects.length})` },
              { id: 'chapters', label: `Главы (${chapters.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '9px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: tab === t.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.18)',
                color: tab === t.id ? '#2b2c7f' : '#fff',
                fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
              }}>{t.label}</button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.5)', fontFamily: 'Nunito', fontSize: 15 }}>
              Загрузка...
            </div>
          ) : tab === 'projects' ? (
            projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)', fontFamily: 'Nunito', fontSize: 15 }}>
                Корзина пуста
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {projects.map(p => {
                  const days = daysLeft(p.expires_at);
                  return (
                    <div key={p.id} style={cardStyle}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 16, color: '#2b2c7f',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </div>
                        <div style={{ fontFamily: 'Nunito', fontSize: 12, color: '#8b9cbd', marginTop: 3 }}>
                          {p.genre && `${p.genre} · `}{p.status} · удалён {formatDate(p.user_deleted_at)}
                        </div>
                      </div>
                      <DaysLeftBadge days={days} />
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => restoreProject(p.id)} style={btnStyle(false)}>Восстановить</button>
                        <button onClick={() => purgeProject(p.id)}   style={btnStyle(true)}>Удалить</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            chapters.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)', fontFamily: 'Nunito', fontSize: 15 }}>
                Корзина пуста
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {chapters.map(ch => {
                  const days = daysLeft(ch.expires_at);
                  return (
                    <div key={ch.id} style={cardStyle}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, color: '#2b2c7f',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.title}
                        </div>
                        <div style={{ fontFamily: 'Nunito', fontSize: 12, color: '#8b9cbd', marginTop: 3 }}>
                          Проект: «{ch.project_title}» · {ch.char_count || 0} симв. · удалена {formatDate(ch.user_deleted_at)}
                        </div>
                      </div>
                      <DaysLeftBadge days={days} />
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => restoreChapter(ch.project_id, ch.id)} style={btnStyle(false)}>Восстановить</button>
                        <button onClick={() => purgeChapter(ch.project_id, ch.id)}   style={btnStyle(true)}>Удалить</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}