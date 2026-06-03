import { useState, useEffect, useRef } from 'react';
import { notifications } from '../utils/notifications.js';
import { apiFetch, getToken, removeToken } from '../utils/api.js';

function loadMammoth() {
  if (document.getElementById('mammoth-cdn')) return;
  const s = document.createElement('script');
  s.id = 'mammoth-cdn';
  s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
  document.head.appendChild(s);
}
async function readDocxText(file) {
  for (let i = 0; i < 80 && !window.mammoth; i++) await new Promise(r => setTimeout(r, 100));
  if (!window.mammoth) throw new Error('mammoth.js не загружен');
  const buf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  return result.value || '';
}


import BookReader from '../components/BookReader.jsx';

const MINIO_BG = 'http://localhost:9000/app-backgrounds/bg10.jpg';
const API = '/api/catalog/projects';
const PROJECT_API = 'http://localhost:8012/api/projects';
const PER_PAGE = 10;

const FILTER_OPTIONS = {
  chapters: [
    { label: '1–10 глав', min: 1, max: 10 },
    { label: '11–50 глав', min: 11, max: 50 },
    { label: '50+ глав', min: 51, max: null },
  ],
  genre: ['роман', 'рассказ', 'повесть', 'стихи'],
  status: ['в процессе', 'завершен', 'на паузе'],
};

function FilterDropdown({ type, activeFilters, onApply, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const labels = { chapters: 'по кол-ву глав', genre: 'по жанру', status: 'по статусу' };
  const isActive = type === 'chapters'
    ? activeFilters.chapters_min !== undefined
    : !!activeFilters[type];

  const btnLabel = isActive
    ? (type === 'chapters'
      ? FILTER_OPTIONS.chapters.find(o => o.min === activeFilters.chapters_min)?.label
      : activeFilters[type])
    : labels[type];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: '8px 16px', borderRadius: 20,
        background: isActive ? 'rgba(69,71,181,0.85)' : 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.3)',
        color: '#fff', fontSize: 13, fontFamily: 'Nunito', fontWeight: 600,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        backdropFilter: 'blur(8px)', transition: 'background .15s',
      }}>
        {btnLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          background: 'rgba(255,255,255,0.97)', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(30,32,96,0.2)', zIndex: 999,
          minWidth: 160, padding: 6, border: '1px solid rgba(69,71,181,0.15)',
        }}>
          {FILTER_OPTIONS[type].map((opt, i) => {
            const label = type === 'chapters' ? opt.label : opt;
            return (
              <button key={i} onClick={() => { onApply(type, opt); setOpen(false); }} style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', padding: '8px 14px',
                fontSize: 13, color: '#2b2c7f', cursor: 'pointer',
                fontFamily: 'Nunito', fontWeight: 500, borderRadius: 8,
                transition: 'background .1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f2fb'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >{label}</button>
            );
          })}
          <div style={{ height: 1, background: '#e8ecf8', margin: '4px 8px' }} />
          <button onClick={() => { onReset(type); setOpen(false); }} style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: 'none', border: 'none', padding: '8px 14px',
            fontSize: 12, color: '#c0392b', cursor: 'pointer',
            fontFamily: 'Nunito', borderRadius: 8,
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff0ee'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >✕ сбросить фильтр</button>
        </div>
      )}
    </div>
  );
}

function DocxImportModal({ projectId, projectTitle, onClose, onProjectsReload }) {
  const [files, setFiles]   = useState([]);
  const [step, setStep]     = useState('pick');
  const [readError, setReadError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadMammoth(); }, []);

  const addFiles = (incoming) => {
    const list = [...incoming].filter(f => /\.docx?$/i.test(f.name));
    setFiles(prev => [...prev, ...list.map(f => ({
      file: f, name: f.name.replace(/\.docx?$/i, '').trim() || f.name, status: 'ready', text: null,
    }))]);
  };
  const removeFile = (i) => setFiles(prev => prev.filter((_, xi) => xi !== i));
  const handleDrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };

  const handleExportClick = async () => {
    if (!files.length) return;
    setStep('reading');
    setReadError(null);
    const updated = [];
    for (const f of files) {
      try {
        const text = await readDocxText(f.file);
        updated.push({ ...f, status: 'ok', text });
      } catch (e) {
        updated.push({ ...f, status: 'error', text: null });
        setReadError(`Не удалось прочитать: ${f.name}`);
      }
    }
    setFiles(updated);
    const good = updated.filter(f => f.text !== null);
    if (good.length > 0) {
      setStep('confirm_gen');
    } else {
      setStep('pick');
    }
  };

  const handleChoice = (generateChars) => {
    const good = files.filter(f => f.text !== null).map(f => ({ title: f.name, text: f.text }));
    if (!good.length) { onClose(); return; }
    if (generateChars) {
      notifications.info('ИИ анализирует главы и генерирует карточки персонажей… Идёт в фоне.', 'ИИ генерирует');
    }
    onClose();
    fetch(`http://localhost:8012/api/projects/${projectId}/import-chapters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ chapters: good, generate_characters: generateChars }),
    })
      .then(res => {
        if (res.ok || res.status === 202) {
          notifications.success(`${good.length} ${good.length === 1 ? 'глава импортирована' : 'глав импортировано'}`, 'Готово');
          if (typeof onProjectsReload === 'function') onProjectsReload();
        } else {
          res.json().catch(() => ({})).then(err => {
            notifications.error(err.detail || 'Ошибка импорта', 'Ошибка');
          });
        }
      })
      .catch(() => {
        if (typeof onProjectsReload === 'function') onProjectsReload();
      });
  };

  const statusIcon = (s) => ({ ready: '📄', reading: '⏳', ok: '✅', error: '❌' }[s] || '📄');

  if (step === 'confirm_gen') {
    const goodCount = files.filter(f => f.text !== null).length;
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.6)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1010 }}
        onClick={onClose}>
        <div style={{ background:'#fff', borderRadius:20, padding:36, width:400,
          boxShadow:'0 20px 60px rgba(30,32,96,0.25)', textAlign:'center' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontSize:44, marginBottom:14 }}>🤖</div>
          <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', fontSize:18, marginBottom:8 }}>
            Сгенерировать карточки персонажей и граф отношений?
          </h3>
          <p style={{ fontFamily:'Nunito', fontSize:13, color:'#8b9cbd', marginBottom:6, lineHeight:1.5 }}>
            Подготовлено {goodCount} {goodCount === 1 ? 'глава' : 'глав'} к импорту.
          </p>
          <p style={{ fontFamily:'Nunito', fontSize:13, color:'#8b9cbd', marginBottom:24, lineHeight:1.5 }}>
            ИИ проанализирует текст и автоматически создаст карточки персонажей,
            портреты и граф отношений. Генерация идёт в фоне.
          </p>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => handleChoice(false)}
              style={{ flex:1, padding:'12px', borderRadius:12, border:'1.5px solid #d8dff0',
                background:'transparent', color:'#6b7c9e', fontFamily:'Nunito',
                fontWeight:600, cursor:'pointer', fontSize:14 }}>
              Нет, пропустить
            </button>
            <button onClick={() => handleChoice(true)}
              style={{ flex:1, padding:'12px', borderRadius:12, border:'none',
                background:'linear-gradient(135deg,#2b2c7f,#5b5fc7)', color:'#fff',
                fontFamily:'Nunito', fontWeight:700, cursor:'pointer', fontSize:14 }}>
              Да, сгенерировать
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'reading') {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.6)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1010 }}>
        <div style={{ background:'#fff', borderRadius:20, padding:36, width:360, textAlign:'center',
          boxShadow:'0 20px 60px rgba(30,32,96,0.25)' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>⏳</div>
          <p style={{ fontFamily:'Nunito', color:'#2b2c7f', fontWeight:700, fontSize:16 }}>
            Читаем файлы…
          </p>
          <p style={{ fontFamily:'Nunito', fontSize:13, color:'#8b9cbd' }}>
            Подождите несколько секунд
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1010 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, padding:32, width:520,
        maxHeight:'85vh', overflowY:'auto',
        boxShadow:'0 20px 60px rgba(30,32,96,0.25)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', fontSize:18, margin:0 }}>
            Импорт глав из DOCX
          </h3>
          <span style={{ fontFamily:'Nunito', fontSize:12, color:'#8b9cbd' }}>«{projectTitle}»</span>
        </div>

        {readError && (
          <div style={{ background:'#fff3f3', border:'1px solid #ffcccc', borderRadius:10,
            padding:'8px 14px', marginBottom:12, fontFamily:'Nunito', fontSize:13, color:'#c0392b' }}>
            ⚠️ {readError}
          </div>
        )}

        <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ border:'2px dashed #c8d9ec', borderRadius:14, padding:'28px 20px',
            textAlign:'center', cursor:'pointer', marginBottom:16, background:'#f7fbff' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
          <p style={{ fontFamily:'Nunito', fontSize:14, color:'#4a6a8a', margin:0 }}>
            Перетащите .docx файлы сюда или нажмите для выбора
          </p>
          <p style={{ fontFamily:'Nunito', fontSize:12, color:'#8b9cbd', margin:'4px 0 0' }}>
            Каждый файл = одна глава
          </p>
          <input ref={fileInputRef} type="file" accept=".doc,.docx" multiple
            style={{ display:'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {files.length > 0 && (
          <div style={{ marginBottom:14, display:'flex', flexDirection:'column', gap:6 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8,
                background:'#f0f4ff', borderRadius:10, padding:'7px 12px',
                border:'1px solid #d8dff0' }}>
                <span style={{ fontSize:16 }}>{statusIcon(f.status)}</span>
                <input value={f.name}
                  onChange={e => setFiles(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                  style={{ flex:1, border:'none', background:'transparent',
                    fontFamily:'Nunito', fontSize:13, outline:'none' }} />
                <button onClick={() => removeFile(i)}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    color:'#c0c8e0', fontSize:16, padding:'0 4px' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:'10px', borderRadius:12, border:'1.5px solid #d8dff0',
              background:'transparent', color:'#6b7c9e', fontFamily:'Nunito',
              fontWeight:600, cursor:'pointer', fontSize:14 }}>
            Отмена
          </button>
          <button onClick={handleExportClick} disabled={!files.length}
            style={{ flex:2, padding:'10px', borderRadius:12, border:'none',
              background: files.length ? 'linear-gradient(135deg,#2b2c7f,#5b5fc7)' : '#d8dff0',
              color: files.length ? '#fff' : '#8b9cbd',
              fontFamily:'Nunito', fontWeight:700,
              cursor: files.length ? 'pointer' : 'default', fontSize:14 }}>
            Экспортировать ({files.length})
          </button>
        </div>
      </div>
    </div>
  );
}

function AddProjectModal({ onClose, onCreated, onProjectsReload }) {
  const [title, setTitle]     = useState('');
  const [genre, setGenre]     = useState('');
  const [showImport, setShowImport] = useState(false);
  const [createdId, setCreatedId]   = useState(null);

  const create = async () => {
    if (!title.trim()) { notifications.warning('Введите название', 'Внимание'); return null; }
    const body = { title: title.trim() };
    if (genre) body.genre = genre;
    const res = await apiFetch(API, { method: 'POST', body: JSON.stringify(body) });
    if (!res) return null;
    if (res.status === 201) {
      const data = await res.json();
      notifications.success('Проект создан');
      onCreated();
      return data.id;
    }
    const e = await res.json().catch(() => ({}));
    notifications.error(e.detail || 'Ошибка', 'Ошибка');
    return null;
  };

  const handleCreate = async () => {
    const id = await create(); if (id) onClose();
  };

  const handleExport = async () => {
    if (!title.trim()) { notifications.warning('Введите название проекта', 'Внимание'); return; }
    let id = createdId;
    if (!id) { id = await create(); if (!id) return; setCreatedId(id); }
    setShowImport(true);
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid #d8dff0', fontSize: 14, fontFamily: 'Nunito',
    outline: 'none', marginBottom: 14, boxSizing: 'border-box',
  };

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.6)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
        onClick={onClose}>
        <div style={{ background:'#fff', borderRadius:20, padding:32, width:400,
          boxShadow:'0 20px 60px rgba(30,32,96,0.25)' }}
          onClick={e => e.stopPropagation()}>
          <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', marginBottom:20, fontSize:18 }}>Новый проект</h3>
          <label style={{ fontFamily:'Nunito', fontSize:13, color:'#6b7c9e', display:'block', marginBottom:5 }}>Название</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Название проекта" style={inputStyle} autoFocus />
          <label style={{ fontFamily:'Nunito', fontSize:13, color:'#6b7c9e', display:'block', marginBottom:5 }}>Жанр</label>
          <select value={genre} onChange={e => setGenre(e.target.value)}
            style={{ ...inputStyle, background:'#fff' }}>
            <option value="">— не выбрано —</option>
            <option value="роман">Роман</option>
            <option value="рассказ">Рассказ</option>
            <option value="повесть">Повесть</option>
            <option value="стихи">Стихи</option>
            <option value="фэнтези">Фэнтези</option>
            <option value="детектив">Детектив</option>
            <option value="фантастика">Фантастика</option>
          </select>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'11px', borderRadius:12, border:'1.5px solid #d8dff0',
                background:'transparent', color:'#6b7c9e', fontFamily:'Nunito',
                fontWeight:600, cursor:'pointer', fontSize:14 }}>Отмена</button>
            <button onClick={handleCreate}
              style={{ flex:1, padding:'11px', borderRadius:12, border:'none',
                background:'#2b2c7f', color:'#fff', fontFamily:'Nunito',
                fontWeight:700, cursor:'pointer', fontSize:14 }}>Создать</button>
          </div>
          <button onClick={handleExport}
            style={{ width:'100%', padding:'10px', borderRadius:12,
              border:'1.5px solid #5b5fc7',
              background:'linear-gradient(135deg,rgba(43,44,127,0.06),rgba(91,95,199,0.1))',
              color:'#2b2c7f', fontFamily:'Nunito', fontWeight:700, cursor:'pointer',
              fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            📤 Экспортировать из DOCX
          </button>
        </div>
      </div>

      {showImport && createdId && (
        <DocxImportModal
          projectId={createdId}
          projectTitle={title}
          onClose={() => { setShowImport(false); onClose(); }}
          onProjectsReload={onProjectsReload}
        />
      )}
    </>
  );
}

function DeleteModal({ onClose, onConfirm }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,60,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32, width: 320,
        boxShadow: '0 20px 60px rgba(30,32,96,0.25)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Nunito', color: '#2b2c7f', marginBottom: 8, fontSize: 18 }}>Переместить в корзину?</h3>
        <p style={{ fontFamily: 'Nunito', color: '#8b9cbd', fontSize: 14, marginBottom: 24 }}>Проект будет перемещён в корзину. Вы сможете восстановить его в течение 60 дней.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid #d8dff0',
            background: 'transparent', color: '#6b7c9e', fontFamily: 'Nunito', fontWeight: 600,
            cursor: 'pointer', fontSize: 14,
          }}>Отмена</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '11px', borderRadius: 12, border: 'none',
            background: '#c0392b', color: '#fff', fontFamily: 'Nunito', fontWeight: 700,
            cursor: 'pointer', fontSize: 14,
          }}>Удалить</button>
        </div>
      </div>
    </div>
  );
}


function AppealModal({ project, onClose, onDismissed }) {
  const [step, setStep] = useState('info');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleDismiss() {
    const token = localStorage.getItem('access_token');
    const r = await fetch(`/api/catalog/projects/${project.id}/dismiss`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok || r.status === 204) {
      onDismissed();
    }
  }

  async function handleAppeal() {
    if (message.trim().length < 10) return;
    setSubmitting(true);
    const token = localStorage.getItem('access_token');
    let ownerEmail = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      ownerEmail = payload.email || '';
    } catch {}
    try {
      const r = await fetch(`/api/catalog/projects/${project.id}/appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: message.trim(), owner_email: ownerEmail }),
      });
      if (r.ok || r.status === 201) {
        notifications.success('Апелляция отправлена администраторам');
        onClose();
      } else {
        const err = await r.json().catch(() => ({}));
        notifications.error(err.detail || 'Ошибка при отправке апелляции', 'Ошибка');
      }
    } catch (e) {
      notifications.error('Не удалось отправить апелляцию', 'Ошибка');
    }
    setSubmitting(false);
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900,
    backdropFilter: 'blur(4px)',
  };
  const box = {
    background: '#fff', borderRadius: 20, padding: '28px 32px',
    width: 420, boxShadow: '0 20px 60px rgba(30,32,96,0.3)',
    fontFamily: 'Nunito',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        {step === 'info' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%', background: '#e53e3e',
                color: '#fff', fontSize: 16, fontWeight: 900, flexShrink: 0,
              }}>!</span>
              <h3 style={{ margin: 0, color: '#2b2c7f', fontSize: 17, fontWeight: 800 }}>
                Проект помечен как удалённый
              </h3>
            </div>
            <p style={{ color: '#6b7c9e', fontSize: 13, marginBottom: 8 }}>
              <strong style={{ color: '#2b2c7f' }}>«{project.title}»</strong>
            </p>
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#991b1b' }}>
                Причина от администратора:
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#7f1d1d', lineHeight: 1.55 }}>
                {project.deleted_reason || 'Причина не указана'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setStep('appeal')} style={{
                padding: '11px 0', borderRadius: 12, border: 'none',
                background: '#2b2c7f', color: '#fff',
                fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                Оспорить решение
              </button>
              <button onClick={handleDismiss} style={{
                padding: '11px 0', borderRadius: 12,
                border: '1.5px solid #fecaca', background: '#fff',
                color: '#c0392b', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                Удалить у себя
              </button>
              <button onClick={onClose} style={{
                padding: '11px 0', borderRadius: 12,
                border: '1.5px solid #e2e8f0', background: '#fff',
                color: '#8b9cbd', fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>
                Закрыть
              </button>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setStep('info')} style={{
              background: 'none', border: 'none', color: '#8b9cbd',
              fontFamily: 'Nunito', fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0,
            }}>← назад</button>
            <h3 style={{ margin: '0 0 8px', color: '#2b2c7f', fontSize: 17, fontWeight: 800 }}>
              Оспорить решение
            </h3>
            <p style={{ color: '#8b9cbd', fontSize: 13, marginBottom: 16 }}>
              Объясните, почему решение об удалении проекта следует пересмотреть.
            </p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ваше обращение..."
              rows={5}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid #d8dff0', fontSize: 13, fontFamily: 'Nunito',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                color: '#2b2c7f', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: 11, borderRadius: 12,
                border: '1.5px solid #d8dff0', background: '#fff',
                color: '#6b7c9e', fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>Отмена</button>
              <button onClick={handleAppeal} disabled={submitting || message.trim().length < 10} style={{
                flex: 2, padding: 11, borderRadius: 12, border: 'none',
                background: message.trim().length >= 10 ? '#2b2c7f' : '#c5cde8',
                color: '#fff', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
                cursor: message.trim().length >= 10 ? 'pointer' : 'default',
              }}>
                {submitting ? 'Отправка...' : 'Отправить обращение'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function GeneratingOverlay({ projectId }) {
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: 'inherit',
      background: 'rgba(180,180,210,0.55)',
      backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 10, pointerEvents: 'none',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: '2.5px solid rgba(69,71,181,0.3)',
        borderTopColor: '#4547b5',
        animation: 'spin 0.9s linear infinite',
        marginBottom: 6,
      }} />
      <div style={{ fontFamily: 'Nunito', fontSize: 12, fontWeight: 700, color: '#2b2c7f', textAlign: 'center' }}>
        генерируется…
      </div>
      <div style={{ fontFamily: 'Nunito', fontSize: 11, color: '#6b7c9e', marginTop: 2 }}>
        {secs} сек
      </div>
    </div>
  );
}

function ProjectPdfExportModal({ project, onClose }) {
  const [exporting, setExporting] = React.useState(false);
  const [progress, setProgress] = React.useState('');

  const loadJsPDF = () => new Promise((res, rej) => {
    if (window.jspdf) { res(window.jspdf.jsPDF); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf.jsPDF);
    s.onerror = rej;
    document.head.appendChild(s);
  });

  const doExport = async () => {
    setExporting(true);
    try {
      setProgress('Загрузка библиотеки…');
      const JsPDF = await loadJsPDF();

      const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const PW = 210, PH = 297, ML = 25, MR = 25, MT = 30, MB = 25;
      const TW = PW - ML - MR;

      const wrapText = (text, fontSize, maxW) => {
        doc.setFontSize(fontSize);
        return doc.splitTextToSize(text, maxW);
      };

      let curY = MT;
      const ensureSpace = (need) => {
        if (curY + need > PH - MB) { doc.addPage(); curY = MT; }
      };

      const writeLine = (text, fontSize, isBold, color, lineH, indent = 0) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(...color);
        const lines = wrapText(text, fontSize, TW - indent);
        for (const line of lines) {
          ensureSpace(lineH);
          doc.text(line, ML + indent, curY);
          curY += lineH;
        }
      };

      setProgress('Создание обложки…');
      curY = PH / 2 - 20;
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(43, 44, 127);
      const titleLines = doc.splitTextToSize(project.title, TW);
      const titleH = titleLines.length * 12;
      titleLines.forEach(line => {
        doc.text(line, PW / 2, curY, { align: 'center' });
        curY += 12;
      });
      doc.setDrawColor(69, 71, 181);
      doc.setLineWidth(0.8);
      doc.line(ML + TW * 0.2, curY + 4, ML + TW * 0.8, curY + 4);
      curY += 12;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 124, 158);
      doc.text(new Date().toLocaleDateString('ru'), PW / 2, curY + 8, { align: 'center' });

      for (let ci = 0; ci < project.chapters.length; ci++) {
        const ch = project.chapters[ci];
        setProgress(`Глава ${ci + 1} из ${project.chapters.length}…`);

        doc.addPage();
        curY = MT;

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(43, 44, 127);
        const chLines = doc.splitTextToSize(ch.title || `Глава ${ci + 1}`, TW);
        chLines.forEach(line => { doc.text(line, ML, curY); curY += 8; });

        doc.setDrawColor(200, 202, 230);
        doc.setLineWidth(0.4);
        doc.line(ML, curY + 1, ML + TW, curY + 1);
        curY += 8;

        const tmp = document.createElement('div');
        tmp.innerHTML = ch.content || '';
        const plain = (tmp.textContent || tmp.innerText || '').trim();

        if (!plain) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(150, 150, 150);
          doc.text('(глава пуста)', ML, curY);
          curY += 7;
          continue;
        }

        const paras = plain.split('\n').flatMap(p => p.split('\r')).map(p => p.trim()).filter(Boolean);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(45, 63, 82);

        for (const para of paras) {
          const lines = doc.splitTextToSize(para, TW - 5);
          for (const line of lines) {
            ensureSpace(6.5);
            doc.text(line, ML + 5, curY);
            curY += 6.5;
          }
          curY += 2;
        }
      }

      setProgress('Сохранение…');
      doc.save(`${project.title.replace(/[^a-zA-Zа-яА-Я0-9 ]/g, '_')}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Ошибка при создании PDF: ' + e.message);
    }
    setExporting(false);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,60,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}
      onClick={!exporting ? onClose : undefined}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: 420,
        boxShadow: '0 24px 80px rgba(30,32,96,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Nunito', color: '#2b2c7f', fontSize: 18, margin: 0 }}>Экспорт PDF</h3>
          {!exporting && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b9cbd', fontSize: 20 }}>✕</button>}
        </div>
        <p style={{ fontFamily: 'Nunito', fontSize: 14, color: '#6b7c9e', marginBottom: 8 }}>
          Проект: <strong style={{ color: '#2b2c7f' }}>{project.title}</strong>
        </p>
        <p style={{ fontFamily: 'Nunito', fontSize: 13, color: '#8b9cbd', marginBottom: 8, lineHeight: 1.5 }}>
          Каждая глава начинается с нового листа. Название проекта — на первой странице.
        </p>
        <p style={{ fontFamily: 'Nunito', fontSize: 13, color: '#6b7c9e', marginBottom: 24 }}>
          Глав: <strong>{project.chapters.length}</strong>
        </p>
        {exporting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '10px 14px', background: '#f0f2ff', borderRadius: 10 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%',
              border: '2px solid #c0c4e8', borderTopColor: '#4547b5',
              animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Nunito', fontSize: 13, color: '#4547b5' }}>{progress}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={exporting} style={{ flex: 1, padding: '11px', borderRadius: 12,
            border: '1.5px solid #d8dff0', background: 'transparent', color: exporting ? '#ccc' : '#6b7c9e',
            fontFamily: 'Nunito', fontWeight: 600, cursor: exporting ? 'default' : 'pointer', fontSize: 14 }}>Отмена</button>
          <button onClick={doExport} disabled={exporting} style={{ flex: 1, padding: '11px', borderRadius: 12,
            border: 'none', background: exporting ? '#a0a3c8' : '#2b2c7f', color: '#fff',
            fontFamily: 'Nunito', fontWeight: 700, cursor: exporting ? 'default' : 'pointer', fontSize: 14 }}>
            {exporting ? progress || 'Генерация…' : 'Скачать PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [readerProj, setReaderProj] = useState(null);
  const [appealProject, setAppealProject] = useState(null);
  const [bgError, setBgError] = useState(false);
  const [userRole, setUserRole] = useState('user');
  const [isBlocked, setIsBlocked] = useState(false);
  const [pdfExportProject, setPdfExportProject] = useState(null);
  const searchTimer = useRef(null);

  const onUnauth = () => { removeToken(); window.location.href = 'http://localhost:8010/'; };

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const checkSession = async () => {
      try {
        const r = await fetch(`http://localhost:8010/api/auth/me?token=${getToken()}`);
        if (r.status === 401) {
          notifications.error('Сессия завершена', 'Выход');
          removeToken();
          setTimeout(() => { window.location.href = 'http://localhost:8010/'; }, 2000);
        } else if (r.ok) {
          const userData = await r.json();
          setIsBlocked(userData.is_active === false);
        }
      } catch
    };
    const interval = setInterval(checkSession, 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadProjects = async (params = {}) => {
    const url = new URL(API, window.location.origin);
    url.searchParams.set('page', 1);
    url.searchParams.set('size', 10000);
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
    const res = await apiFetch(url.toString(), {}, onUnauth);
    if (!res) return;
    const data = await res.json();
    setProjects(data.items || data || []);
    setPage(1);
  };

  useEffect(() => {
    const hasGenerating = projects.some(p => p.is_generating);
    if (!hasGenerating) return;
    const t = setInterval(() => {
      loadProjects({ search, ...buildFilterParams(activeFilters) });
    }, 3000);
    return () => clearInterval(t);
  }, [projects, search, activeFilters]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) { localStorage.setItem('access_token', token); window.history.replaceState({}, '', '/catalog'); }
    const storedToken = localStorage.getItem('access_token');
    if (!storedToken) {
      window.location.href = 'http://localhost:8010/';
      return;
    }
    try {
      const payload = JSON.parse(atob(storedToken.split('.')[1]));
      if (payload.role) setUserRole(payload.role);
      if (payload.blocked === true) setIsBlocked(true);
    } catch {}
    loadProjects();
  }, []);

  const applyFilter = (type, opt) => {
    const next = { ...activeFilters };
    if (type === 'chapters') { next.chapters_min = opt.min; next.chapters_max = opt.max; }
    else next[type] = opt;
    setActiveFilters(next);
    loadProjects({ search, ...buildFilterParams(next) });
  };

  const resetFilter = (type) => {
    const next = { ...activeFilters };
    if (type === 'chapters') { delete next.chapters_min; delete next.chapters_max; }
    else delete next[type];
    setActiveFilters(next);
    loadProjects({ search, ...buildFilterParams(next) });
  };

  const buildFilterParams = (f) => {
    const p = {};
    if (f.chapters_min != null) p.chapters_min = f.chapters_min;
    if (f.chapters_max != null) p.chapters_max = f.chapters_max;
    if (f.genre) p.genre = f.genre;
    if (f.status) p.status = f.status;
    return p;
  };

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadProjects({ search: val, ...buildFilterParams(activeFilters) });
    }, 300);
  };

  const openProject = (p) => {
    if (p.user_deleted_at || p.is_deleted) { setAppealProject(p); return; }
    if (isBlocked) { openReader(p); return; }
    if (p.is_generating) return;
    window.location.href = `http://localhost:8012/project/${p.id}?token=${getToken()}`;
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const catalogRes = await apiFetch(`${API}/${deleteId}`, { method: 'DELETE' }, onUnauth);
    if (!catalogRes) return;
    if (catalogRes.status === 204) {
      await apiFetch(`${PROJECT_API}/${deleteId}`, { method: 'DELETE' }, onUnauth);
      notifications.success('Проект перемещён в корзину');
      setDeleteId(null);
      loadProjects({ search, ...buildFilterParams(activeFilters) });
    } else notifications.error('Ошибка при удалении', 'Ошибка');
  };

  const openReader = async (project) => {
    const res = await apiFetch(`${PROJECT_API}/${project.id}/chapters_with_content`, {}, onUnauth)
      .catch(() => null);
    let chapters = [];
    if (res?.ok) {
      chapters = await res.json();
    } else {
      const r2 = await apiFetch(`${PROJECT_API}/${project.id}`, {}, onUnauth);
      if (r2?.ok) {
        const data = await r2.json();
        chapters = data.chapters || [];
      }
    }
    if (!chapters.length) {
      notifications.warning('В проекте пока нет глав');
      return;
    }
    setReaderProj({ title: project.title, chapters });
  };

  const exportProjectPdf = async (proj) => {
    const res = await apiFetch(`${PROJECT_API}/${proj.id}/chapters_with_content`, {}, onUnauth).catch(() => null);
    let chapters = [];
    if (res?.ok) {
      chapters = await res.json();
    } else {
      const r2 = await apiFetch(`${PROJECT_API}/${proj.id}`, {}, onUnauth);
      if (r2?.ok) { const d = await r2.json(); chapters = d.chapters || []; }
    }
    if (!chapters.length) { notifications.warning('В проекте пока нет глав'); return; }
    setPdfExportProject({ title: proj.title, chapters });
  };

  const totalPages = Math.ceil(projects.length / PER_PAGE);
  const visibleProjects = projects.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .catalog-bg {
          min-height: 100vh;
          background: ${bgError
          ? 'linear-gradient(135deg, #e8eaf8 0%, #c5c8e8 30%, #6b6fb5 65%, #3b3d8a 100%)'
          : `url(${MINIO_BG}) center/cover no-repeat fixed`};
          display: flex;
        }
        .catalog-sidebar {
          width: 260px; flex-shrink: 0;
          padding: 40px 28px;
          background: rgba(20,22,80,0.45);
          backdrop-filter: blur(16px);
          display: flex; flex-direction: column;
          border-right: 1px solid rgba(255,255,255,0.1);
          min-height: 100vh;
        }
        .catalog-main {
          flex: 1; padding: 40px 48px;
          overflow-y: auto;
        }
        .project-card {
          background: rgba(255,255,255,0.12);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 16px;
          padding: 18px 22px;
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
          transition: background .25s cubic-bezier(.4,0,.2,1), transform .15s;
          cursor: pointer;
        }
        .project-card:hover { background: rgba(255,255,255,0.22); transform: translateY(-1px); }
        .tag-pill {
          display: inline-block; padding: 3px 10px;
          background: rgba(255,255,255,0.15); border-radius: 20px;
          font-size: 11px; color: rgba(255,255,255,0.8);
          margin-right: 5px; font-family: Nunito;
        }
        .icon-btn {
          width: 34px; height: 34px; border-radius: 10px;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
          color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background .25s cubic-bezier(.4,0,.2,1);
        }
        .icon-btn:hover { background: rgba(255,255,255,0.25); }
        .icon-btn.red:hover { background: rgba(192,57,43,0.5); }
      `}</style>

      <img src={MINIO_BG} onError={() => setBgError(true)} style={{ display: 'none' }} alt="" />

      <div className="catalog-bg">
        <div className="catalog-sidebar">
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: 'Playfair Display', fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
              WRITERS<br />PLATFORM
            </div>
            <div style={{ fontFamily: 'Nunito', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              пространство для твоего творчества
            </div>
          </div>

          <nav style={{ flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'rgba(255,255,255,0.15)', borderRadius: 12, marginBottom: 6,
              color: '#fff', fontFamily: 'Nunito', fontSize: 14, fontWeight: 600,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              Мои проекты
            </div>
            <button onClick={() => { window.location.href = `http://localhost:8011/trash?token=${getToken()}`; }} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'none', border: 'none', borderRadius: 12, marginBottom: 6, width: '100%',
              color: 'rgba(255,255,255,0.55)', fontFamily: 'Nunito', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', transition: 'all .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Корзина
            </button>
          </nav>

          {(userRole === 'admin' || userRole === 'superadmin') && (
            <button onClick={() => { window.location.href = 'http://localhost:8010/admin'; }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 12,
              color: '#a5b4fc', fontFamily: 'Nunito', fontSize: 13,
              cursor: 'pointer', transition: 'all .15s', marginRight: 8, width: '100%', marginBottom: 6,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
            >
              Панель
            </button>
          )}
          <button onClick={() => { removeToken(); window.location.href = 'http://localhost:8010/'; }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12,
            color: 'rgba(255,255,255,0.6)', fontFamily: 'Nunito', fontSize: 13,
            cursor: 'pointer', transition: 'color .15s, border-color .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            выйти
          </button>
        </div>

        <div className="catalog-main">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 12, padding: '10px 16px',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input value={search} onChange={e => handleSearch(e.target.value)}
                placeholder="поиск по названию"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: '#fff', fontFamily: 'Nunito', fontSize: 14, flex: 1,
                  caretColor: '#fff',
                }}
              />
              <style>{`input::placeholder{color:rgba(255,255,255,0.55)!important}`}</style>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['chapters', 'genre', 'status'].map(t => (
                <FilterDropdown key={t} type={t} activeFilters={activeFilters}
                  onApply={applyFilter} onReset={resetFilter} />
              ))}
            </div>

            {!isBlocked && (
            <button onClick={() => setShowAdd(true)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', borderRadius: 12, border: 'none',
              background: 'rgba(255,255,255,0.92)', color: '#2b2c7f',
              fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(43,44,127,0.2)',
              whiteSpace: 'nowrap', transition: 'opacity .25s cubic-bezier(.4,0,.2,1)',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              новый проект
            </button>
            )}
          </div>

          {isBlocked && (
            <div style={{
              background: 'rgba(220,50,50,0.18)', border: '1px solid rgba(220,50,50,0.4)',
              borderRadius: 12, padding: '12px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 10,
              backdropFilter: 'blur(8px)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff8888" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#fca5a5', fontSize: 14 }}>Аккаунт заблокирован</div>
                <div style={{ fontFamily: 'Nunito', fontSize: 12, color: 'rgba(252,165,165,0.8)', marginTop: 2 }}>
                  Вы можете просматривать и экспортировать проекты, но не редактировать их.
                </div>
              </div>
            </div>
          )}
          {visibleProjects.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '80px 20px',
              color: 'rgba(255,255,255,0.5)', fontFamily: 'Nunito', fontSize: 16,
            }}>
              {projects.length === 0 ? 'Проектов пока нет — создайте первый!' : 'Ничего не найдено'}
            </div>
          ) : (
            visibleProjects.map(p => {
              const tags = [];
              if (p.chapter_count != null) tags.push(p.chapter_count === 0 ? 'без глав' : `глав: ${p.chapter_count}`);
              if (p.genre) tags.push(p.genre);
              if (p.status) tags.push(p.status);
              const isDeleted = !!p.user_deleted_at || !!p.is_deleted;
              const isGenerating = !!p.is_generating;
              return (
                <div
                  key={p.id}
                  className="project-card"
                  onClick={() => !isGenerating && openProject(p)}
                  style={{
                    ...(isDeleted ? {
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      opacity: 0.65,
                      cursor: 'pointer',
                    } : {}),
                    ...(isGenerating ? {
                      background: 'rgba(200,200,220,0.18)',
                      border: '1px solid rgba(150,150,200,0.3)',
                      opacity: 0.75,
                      cursor: 'default',
                      position: 'relative',
                    } : { position: 'relative' }),
                  }}
                >
                  {isGenerating && <GeneratingOverlay projectId={p.id} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'Nunito', fontWeight: 700,
                      color: isDeleted ? 'rgba(255,255,255,0.55)' : '#fff',
                      fontSize: 16, marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    }}>
                      {isDeleted && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#e53e3e', color: '#fff',
                          fontSize: 13, fontWeight: 900, flexShrink: 0, lineHeight: 1,
                        }}>!</span>
                      )}
                      <span
                        onClick={e => { e.stopPropagation(); if (!isDeleted) openReader(p); }}
                        title={isDeleted ? '' : 'Читать'}
                        style={isDeleted
                          ? { textDecoration: 'line-through', textDecorationColor: 'rgba(239,68,68,0.7)' }
                          : { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted',
                              textDecorationColor: 'rgba(255,255,255,0.4)', textUnderlineOffset: 3 }}>
                        {p.title}
                      </span>
                    </div>
                    <div>{tags.map((t, i) => (
                      <span key={i} className="tag-pill" style={isDeleted ? { opacity: 0.5 } : {}}>{t}</span>
                    ))}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {!isDeleted && !isBlocked && !isGenerating && (
                      <>
                        <button className="icon-btn" onClick={() => openProject(p)} title="Открыть редактор">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="icon-btn red" onClick={() => setDeleteId(p.id)} title="В корзину">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </>
                    )}
                    {!isDeleted && isBlocked && (
                      <>
                        <button className="icon-btn" onClick={() => openReader(p)} title="Читать">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                          </svg>
                        </button>
                        <button className="icon-btn" onClick={() => exportProjectPdf(p)} title="Экспорт PDF"
                          style={{ color: '#c0392b', borderColor: 'rgba(192,57,43,0.4)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
                          </svg>
                        </button>
                      </>
                    )}
                    {isDeleted && (
                      <button
                        className="icon-btn"
                        onClick={() => openProject(p)}
                        title="Посмотреть решение"
                        style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: p === page ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: p === page ? '#2b2c7f' : '#fff',
                  fontFamily: 'Nunito', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', transition: 'background .15s',
                }}>{p}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} onCreated={() => loadProjects({ search, ...buildFilterParams(activeFilters) })} onProjectsReload={() => loadProjects({ search, ...buildFilterParams(activeFilters) })} />}
      {deleteId && <DeleteModal onClose={() => setDeleteId(null)} onConfirm={confirmDelete} />}
      {appealProject && (
        <AppealModal
          project={appealProject}
          onClose={() => setAppealProject(null)}
          onDismissed={() => { setAppealProject(null); loadProjects({ search, ...buildFilterParams(activeFilters) }); }}
        />
      )}
      {readerProj && (
        <BookReader
          chapters={readerProj.chapters}
          bookTitle={readerProj.title}
          onClose={() => setReaderProj(null)}
        />
      )}

      {pdfExportProject && (
        <ProjectPdfExportModal
          project={pdfExportProject}
          onClose={() => setPdfExportProject(null)}
        />
      )}
    </>
  );
}