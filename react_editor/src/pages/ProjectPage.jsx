import { useState, useEffect, useRef, useCallback } from 'react';
import { notifications } from '../utils/notifications.js';
import { apiFetch, getToken, removeToken } from '../utils/api.js';
import BookReader from '../components/BookReader.jsx';

const MINIO_BG     = 'http://localhost:9000/app-backgrounds/bg9.jpg';
const MINIO_PHOTOS = 'http://localhost:9000/character-photos';
const AI_API       = 'http://localhost:8012/api/ai';

const PROJECT_ID = (() => {
  const m = window.location.pathname.match(/\/project\/(\d+)/);
  return m ? +m[1] : null;
})();
const API = `http://localhost:8012/api/projects/${PROJECT_ID}`;

function photoUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${MINIO_PHOTOS}/${path}`;
}

const RELATION_TYPES  = ['женаты','пара','друзья','враги','знакомые','нейтральные'];
const RELATION_COLORS = {
  'женаты':      '#c9860a',
  'пара':        '#c0392b',
  'друзья':      '#1e8449',
  'враги':       '#2c3e50',
  'знакомые':    '#2471a3',
  'нейтральные': '#7f8c8d',
};

function edgePath(x1, y1, x2, y2, idx) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const px = -dy / dist, py = dx / dist;
  const dir  = idx % 2 === 0 ? 1 : -1;
  const bend = Math.min(dist * 0.18, 70) * dir;
  const cx1 = x1 + dx/3 + px*bend, cy1 = y1 + dy/3 + py*bend;
  const cx2 = x2 - dx/3 + px*bend, cy2 = y2 - dy/3 + py*bend;
  return `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;
}

function bezierMid(x1, y1, x2, y2, idx) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const px = -dy / dist, py = dx / dist;
  const dir  = idx % 2 === 0 ? 1 : -1;
  const bend = Math.min(dist * 0.18, 70) * dir;
  const cx1 = x1 + dx/3 + px*bend, cy1 = y1 + dy/3 + py*bend;
  const cx2 = x2 - dx/3 + px*bend, cy2 = y2 - dy/3 + py*bend;
  return {
    x: 0.125*x1 + 0.375*cx1 + 0.375*cx2 + 0.125*x2,
    y: 0.125*y1 + 0.375*cy1 + 0.375*cy2 + 0.125*y2,
  };
}

function CropModal({ onClose, onApply }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [imgState, setImgState] = useState(null);
  const dragging = useRef(false);
  const dragStart = useRef({ sx: 0, sy: 0, ox: 0, oy: 0 });

  const loadFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const cont = containerRef.current;
        const cw = cont.clientWidth, ch = cont.clientHeight;
        const scale = Math.max(cw / img.width, ch / img.height);
        setImgState({ img, scale, x: (cw - img.width * scale) / 2, y: (ch - img.height * scale) / 2 });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!imgState) return;
    const { img, scale, x, y } = imgState;
    const canvas = canvasRef.current;
    const cont = containerRef.current;
    canvas.width = cont.clientWidth;
    canvas.height = cont.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
  }, [imgState]);

  const handleMouseDown = (e) => {
    if (!imgState) return;
    dragging.current = true;
    dragStart.current = { sx: e.clientX, sy: e.clientY, ox: imgState.x, oy: imgState.y };
  };
  const handleMouseMove = (e) => {
    if (!dragging.current || !imgState) return;
    const { sx, sy, ox, oy } = dragStart.current;
    setImgState(s => ({ ...s, x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) }));
  };
  const handleMouseUp = () => { dragging.current = false; };
  const handleWheel = (e) => {
    if (!imgState) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.1, imgState.scale * factor);
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    setImgState(s => ({
      ...s, scale: newScale,
      x: cx - (cx - s.x) * (newScale / s.scale),
      y: cy - (cy - s.y) * (newScale / s.scale),
    }));
  };

  const handleApply = () => {
    if (!imgState) return;
    const { img, scale, x, y } = imgState;
    const cont = containerRef.current;
    const cw = cont.clientWidth, ch = cont.clientHeight;
    const FRAME_RATIO = 0.72;
    const frameSz = Math.min(cw, ch) * FRAME_RATIO;
    const frameLeft = (cw - frameSz) / 2;
    const frameTop  = (ch - frameSz) / 2;
    const srcX = (frameLeft - x) / scale;
    const srcY = (frameTop  - y) / scale;
    const srcW = frameSz / scale;
    const THUMB = 400;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = THUMB; thumbCanvas.height = THUMB;
    thumbCanvas.getContext('2d').drawImage(img, srcX, srcY, srcW, srcW, 0, 0, THUMB, THUMB);
    const thumbData = thumbCanvas.toDataURL('image/jpeg', 0.92);
    let fw = img.width, fh = img.height;
    const maxSize = 2000;
    if (fw > maxSize || fh > maxSize) { const r = Math.min(maxSize/fw, maxSize/fh); fw=Math.round(fw*r); fh=Math.round(fh*r); }
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fw; fullCanvas.height = fh;
    fullCanvas.getContext('2d').drawImage(img, 0, 0, fw, fh);
    const fullData = fullCanvas.toDataURL('image/jpeg', 0.90);
    onApply(thumbData, fullData);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, width:460, boxShadow:'0 20px 60px rgba(30,32,96,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', fontSize:17 }}>Обрезать фото</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#8b9cbd', fontSize:20 }}>✕</button>
        </div>
        <div ref={containerRef} style={{ width:'100%', height:280, background:'#f0f2fb', borderRadius:12, position:'relative', overflow:'hidden', cursor: imgState ? 'grab' : 'default' }}
          onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}>
          {!imgState && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#8b9cbd', fontFamily:'Nunito', fontSize:14 }}>Выберите файл для загрузки</div>}
          <canvas ref={canvasRef} style={{ display: imgState ? 'block' : 'none', userSelect:'none' }} onMouseDown={handleMouseDown} />
          {imgState && (() => {
            const sz = Math.min(containerRef.current?.clientWidth || 280, 280) * 0.72;
            const left = ((containerRef.current?.clientWidth || 280) - sz) / 2;
            const top  = (280 - sz) / 2;
            return (
              <div style={{ position:'absolute', left, top, width:sz, height:sz, border:'2px solid rgba(255,255,255,0.9)', boxShadow:'0 0 0 2000px rgba(0,0,0,0.42)', borderRadius:6, pointerEvents:'none', zIndex:10 }}>
                {[[0,0],[0,1],[1,0],[1,1]].map(([x,y],i) => (
                  <div key={i} style={{ position:'absolute', width:16, height:16, borderTop:y===0?'3px solid #fff':'none', borderBottom:y===1?'3px solid #fff':'none', borderLeft:x===0?'3px solid #fff':'none', borderRight:x===1?'3px solid #fff':'none', top:y===0?-2:'auto', bottom:y===1?-2:'auto', left:x===0?-2:'auto', right:x===1?-2:'auto' }} />
                ))}
              </div>
            );
          })()}
        </div>
        <p style={{ fontFamily:'Nunito', fontSize:12, color:'#8b9cbd', textAlign:'center', margin:'8px 0 16px' }}>Перемещайте мышью · колёсико — масштаб</p>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => document.getElementById('cropFileInput').click()} style={{ flex:1, padding:'10px', borderRadius:12, border:'1.5px solid #d8dff0', background:'transparent', color:'#6b7c9e', fontFamily:'Nunito', fontWeight:600, cursor:'pointer', fontSize:14 }}>Выбрать файл</button>
          <button onClick={handleApply} disabled={!imgState} style={{ flex:1, padding:'10px', borderRadius:12, border:'none', background: imgState ? '#2b2c7f' : '#d8dff0', color:'#fff', fontFamily:'Nunito', fontWeight:700, cursor: imgState ? 'pointer' : 'default', fontSize:14 }}>Применить</button>
        </div>
        <input id="cropFileInput" type="file" accept="image/*" style={{ display:'none' }} onChange={e => { if (e.target.files[0]) loadFile(e.target.files[0]); }} />
      </div>
    </div>
  );
}

function AiImageOverlay({ charFields, onApply, onDismiss }) {
  const [images, setImages]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState(null);
  const [error, setError]         = useState('');

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    setImages([]);
    setSelected(null);
    try {
      const res = await apiFetch(`${AI_API}/generate-character-images`, {
        method: 'POST',
        body: JSON.stringify(charFields),
      });
      if (!res) { setError('Ошибка соединения'); setLoading(false); return; }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.detail || 'Ошибка генерации');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setImages(data.images || []);
    } catch (ex) {
      setError('Ошибка: ' + ex.message);
    } finally {
      setLoading(false);
    }
  }, [charFields]);

  useEffect(() => { generate(); }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,10,40,0.80)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 2500,
    }}>
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <h3 style={{ fontFamily: 'Nunito', color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>
          Генерация портрета персонажа
        </h3>
        <p style={{ fontFamily: 'Nunito', color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 6 }}>
          {loading ? 'Генерирую изображения, это займёт до 2 минут...' : 'Нажмите на изображение, чтобы выбрать его'}
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 200, height: 200, borderRadius: 16,
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                width: 36, height: 36, border: '3px solid rgba(255,255,255,0.2)',
                borderTopColor: '#7b7de8',
                borderRadius: '50%',
                display: 'block',
                animation: 'spin 0.9s linear infinite',
              }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{
          background: 'rgba(255,80,80,0.15)', border: '1px solid rgba(255,80,80,0.3)',
          borderRadius: 12, padding: '16px 24px', marginBottom: 24,
          fontFamily: 'Nunito', color: '#ff8888', fontSize: 14,
        }}>
          {error}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          {images.map((src, i) => (
            <div key={i}
              style={{
                position: 'relative', width: 200, height: 200, borderRadius: 16,
                overflow: 'hidden', cursor: 'pointer',
                border: selected === i ? '3px solid #7b7de8' : '3px solid transparent',
                transition: 'border-color 0.15s, transform 0.15s',
                transform: selected === i ? 'scale(1.03)' : 'scale(1)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
              onClick={() => setSelected(i === selected ? null : i)}
            >
              <img src={src} alt={`вариант ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{
                position: 'absolute', inset: 0,
                background: selected === i ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}>
                {selected === i && (
                  <button
                    onClick={e => { e.stopPropagation(); onApply(src); }}
                    style={{
                      padding: '10px 22px', borderRadius: 12,
                      border: 'none', background: '#fff',
                      color: '#2b2c7f', fontFamily: 'Nunito',
                      fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    }}
                  >
                    Применить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onDismiss} style={{
          padding: '10px 28px', borderRadius: 12,
          border: '1.5px solid rgba(255,255,255,0.25)',
          background: 'transparent', color: '#fff',
          fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }}>
          Отклонить
        </button>
        {!loading && (
          <button onClick={generate} style={{
            padding: '10px 28px', borderRadius: 12,
            border: 'none', background: '#4547b5',
            color: '#fff', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            ✦ Перегенерить
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function CharViewModal({ char, onClose, onEdit }) {
  const [fullscreen, setFullscreen] = useState(false);
  const thumb = photoUrl(char.photo_url || char.photo);
  const full  = photoUrl(char.photo_full_url || char.photo_url || char.photo);

  const fields = [
    ['Роль', char.role], ['Пол', char.gender === 'другое' ? char.gender_other : char.gender],
    ['Дата рождения', char.birthdate], ['Возраст', char.age],
    ['Статус', char.char_status], ['Локация', char.location],
    ['Черты', char.features],
  ].filter(([, v]) => v);

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500 }} onClick={onClose}>
        <div style={{ background:'#fff', borderRadius:20, padding:28, width:560, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(30,32,96,0.3)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', fontSize:20 }}>{char.name}</h3>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={onEdit} style={{ padding:'7px 16px', borderRadius:10, background:'#f0f2fb', border:'none', color:'#2b2c7f', fontFamily:'Nunito', fontWeight:600, cursor:'pointer', fontSize:13 }}>Редактировать</button>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#8b9cbd', fontSize:20 }}>✕</button>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            <div style={{ width:120, height:160, borderRadius:12, background:'#f0f2fb', flexShrink:0, overflow:'hidden', cursor: full ? 'zoom-in' : 'default', position:'relative' }} onClick={() => full && setFullscreen(true)}>
              {thumb ? <img src={thumb} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#8b9cbd', fontSize:12, fontFamily:'Nunito' }}>нет фото</div>}
              {full && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.3)', opacity:0, transition:'opacity .2s' }} onMouseEnter={e => e.currentTarget.style.opacity=1} onMouseLeave={e => e.currentTarget.style.opacity=0}><span style={{ fontSize:24, color:'#fff' }}>⌕</span></div>}
            </div>
            <div style={{ flex:1 }}>
              {char.short_desc && <p style={{ fontFamily:'Nunito', color:'#6b7c9e', fontSize:14, marginBottom:12 }}>{char.short_desc}</p>}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px' }}>
                {fields.map(([k, v]) => (
                  <div key={k}>
                    <span style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd', display:'block' }}>{k}</span>
                    <span style={{ fontFamily:'Nunito', fontSize:13, color:'#2b2c7f', fontWeight:600 }}>{v}</span>
                  </div>
                ))}
              </div>
              {char.personality && <div style={{ marginTop:12 }}><span style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd' }}>Характер</span><p style={{ fontFamily:'Nunito', fontSize:13, color:'#3b3d8a', marginTop:2 }}>{char.personality}</p></div>}
              {char.desc_full   && <div style={{ marginTop:8 }}><span style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd' }}>Описание</span><p style={{ fontFamily:'Nunito', fontSize:13, color:'#3b3d8a', marginTop:2 }}>{char.desc_full}</p></div>}
              {char.custom_labels?.length > 0 && <div style={{ marginTop:10 }}>{char.custom_labels.map((lb, i) => <span key={i} style={{ display:'inline-block', padding:'3px 10px', background:'#f0f2fb', borderRadius:20, fontSize:12, color:'#4547b5', marginRight:5, fontFamily:'Nunito' }}>{lb.key}: {lb.value}</span>)}</div>}
            </div>
          </div>
        </div>
      </div>
      {fullscreen && full && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000, cursor:'zoom-out' }} onClick={() => setFullscreen(false)}>
          <button style={{ position:'absolute', top:20, right:20, background:'none', border:'none', color:'#fff', fontSize:28, cursor:'pointer' }} onClick={() => setFullscreen(false)}>✕</button>
          <img src={full} alt="" style={{ maxWidth:'90vw', maxHeight:'90vh', objectFit:'contain', borderRadius:8 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function BirthInput({ id, defaultValue }) {
  const [val, setVal] = useState(defaultValue || '');
  const format = (raw) => {
    const d = raw.replace(/\D/g, '').slice(0, 8);
    let r = d;
    if (d.length > 4) r = d.slice(0,2) + '.' + d.slice(2,4) + '.' + d.slice(4);
    else if (d.length > 2) r = d.slice(0,2) + '.' + d.slice(2);
    return r;
  };
  return (
    <input id={id} value={val} onChange={e => setVal(format(e.target.value))} placeholder="ДД.ММ.ГГГГ" maxLength={10}
      style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #d8dff0', fontSize:13, fontFamily:'Nunito', outline:'none', boxSizing:'border-box' }}
      onFocus={e => e.target.style.borderColor='#4547b5'} onBlur={e => e.target.style.borderColor='#d8dff0'} />
  );
}

function CharEditModal({ char, onClose, onSaved }) {
  const [cropOpen,       setCropOpen]       = useState(false);
  const [thumbData,      setThumbData]      = useState(char?.photo_url || null);
  const [fullData,       setFullData]       = useState(char?.photo_full_url || null);
  const [customLabels,   setCustomLabels]   = useState(char?.custom_labels || []);
  const [genderOther,    setGenderOther]    = useState(char?.gender === 'другое');
  const [aiOverlayOpen,  setAiOverlayOpen]  = useState(false);

  const collectFields = () => ({
    name:        document.getElementById('ce-name')?.value.trim()  || char?.name || null,
    gender:      document.getElementById('ce-gender')?.value       || char?.gender || null,
    age:         parseInt(document.getElementById('ce-age')?.value) || char?.age || null,
    features:    document.getElementById('ce-feat')?.value.trim()  || char?.features || null,
    personality: document.getElementById('ce-pers')?.value.trim()  || char?.personality || null,
    desc_full:   document.getElementById('ce-desc')?.value.trim()  || char?.desc_full || null,
    short_desc:  document.getElementById('ce-short')?.value.trim() || char?.short_desc || null,
    role:        document.getElementById('ce-role')?.value         || char?.role || null,
  });

  const handleSave = async () => {
    const name = document.getElementById('ce-name').value.trim();
    if (!name) { document.getElementById('ce-name').focus(); return; }
    const gender = document.getElementById('ce-gender').value;
    const body = {
      name,
      short_desc:   document.getElementById('ce-short').value.trim()   || null,
      role:         document.getElementById('ce-role').value            || null,
      gender:       gender                                               || null,
      gender_other: gender === 'другое' ? document.getElementById('ce-gender-other').value.trim() : null,
      birthdate:    document.getElementById('ce-birth').value.trim()    || null,
      age:          parseInt(document.getElementById('ce-age').value)   || null,
      char_status:  document.getElementById('ce-status').value          || null,
      location:     document.getElementById('ce-loc').value.trim()      || null,
      features:     document.getElementById('ce-feat').value.trim()     || null,
      personality:  document.getElementById('ce-pers').value.trim()     || null,
      desc_full:    document.getElementById('ce-desc').value.trim()     || null,
      custom_labels: customLabels.filter(l => l.key || l.value),
    };
    if (thumbData && thumbData.startsWith('data:')) body.photo      = thumbData;
    if (fullData  && fullData.startsWith('data:'))  body.photo_full = fullData;

    const url    = char ? `${API}/characters/${char.id}` : `${API}/characters`;
    const method = char ? 'PATCH' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(body) });
    if (!res) return;
    if (res.ok || res.status === 201) {
      const saved = await res.json();
      notifications.success(char ? 'Персонаж обновлён' : 'Персонаж добавлен');
      onSaved(saved);
      onClose();
    } else {
      const e = await res.json().catch(() => ({}));
      notifications.error(e.detail || 'Ошибка');
    }
  };

  const handleDelete = async () => {
    if (!char) return;
    const res = await apiFetch(`${API}/characters/${char.id}`, { method: 'DELETE' });
    if (res?.status === 204) { notifications.success('Персонаж удалён'); onSaved(null, char.id); onClose(); }
    else notifications.error('Ошибка при удалении');
  };

  const handleAiImageApply = (dataUrl) => {
    setThumbData(dataUrl);
    setFullData(dataUrl);
    setAiOverlayOpen(false);
  };

  const fi  = (id, opts = {}) => (
    <input id={id} type={opts.type || 'text'} defaultValue={opts.val || ''} placeholder={opts.ph || ''} min={opts.min}
      style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #d8dff0', fontSize:13, fontFamily:'Nunito', outline:'none', boxSizing:'border-box' }}
      onFocus={e => e.target.style.borderColor='#4547b5'} onBlur={e => e.target.style.borderColor='#d8dff0'} />
  );
  const sel = (id, opts = {}) => (
    <select id={id} defaultValue={opts.val || ''} onChange={opts.onChange}
      style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #d8dff0', fontSize:13, fontFamily:'Nunito', outline:'none', boxSizing:'border-box', background:'#fff' }}>
      {opts.children}
    </select>
  );
  const lbl = (text) => <label style={{ fontFamily:'Nunito', fontSize:12, color:'#6b7c9e', display:'block', marginBottom:4 }}>{text}</label>;

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(20,20,60,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500 }} onClick={onClose}>
        <div style={{ background:'#fff', borderRadius:20, padding:28, width:600, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(30,32,96,0.3)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', fontSize:18 }}>{char ? 'Редактировать персонажа' : 'Новый персонаж'}</h3>
            <div style={{ display:'flex', gap:8 }}>
              {char && <button onClick={handleDelete} style={{ padding:'6px 14px', borderRadius:10, background:'#fff0ee', border:'1px solid #f0c0bc', color:'#c0392b', fontFamily:'Nunito', fontWeight:600, cursor:'pointer', fontSize:13 }}>Удалить</button>}
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#8b9cbd', fontSize:20 }}>✕</button>
            </div>
          </div>

          <div style={{ display:'flex', gap:20, marginBottom:16 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ width:100, height:130, borderRadius:12, background:'#f0f2fb', overflow:'hidden', cursor:'pointer' }} onClick={() => setCropOpen(true)}>
                {thumbData
                  ? <img src={thumbData} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#8b9cbd', fontSize:11, fontFamily:'Nunito', textAlign:'center', padding:8 }}>нажмите для фото</div>
                }
              </div>
              <button onClick={() => setCropOpen(true)} style={{ width:100, padding:'4px', borderRadius:8, border:'1px solid #d8dff0', background:'transparent', color:'#4547b5', fontSize:11, fontFamily:'Nunito', cursor:'pointer' }}>
                ✏ изменить
              </button>
              <button
                onClick={() => setAiOverlayOpen(true)}
                title="Сгенерировать портрет по описанию"
                style={{
                  width: 100, padding: '4px 0', borderRadius: 8,
                  border: '1px solid #c5c0f0',
                  background: 'linear-gradient(135deg,#e8e6ff,#f3f0ff)',
                  color: '#4547b5', fontSize: 11, fontFamily: 'Nunito',
                  fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}
              >
                <span>✦</span> ИИ-портрет
              </button>
            </div>

            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
              <div>{lbl('Имя *')}{fi('ce-name',  { val: char?.name       || '' })}</div>
              <div>{lbl('Короткое описание')}{fi('ce-short', { val: char?.short_desc || '', ph:'До 50 символов...' })}</div>
              <div>{lbl('Роль')}{sel('ce-role', { val: char?.role || '', children: (
                <><option value="">— не выбрано —</option><option value="протагонист">Протагонист</option><option value="антагонист">Антагонист</option><option value="ментор">Ментор</option><option value="второстепенный">Второстепенный</option></>
              ) })}</div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 16px', marginBottom:12 }}>
            <div>{lbl('Пол')}{sel('ce-gender', { val: char?.gender || '', onChange: e => setGenderOther(e.target.value === 'другое'), children: (
              <><option value="">— не выбрано —</option><option value="женский">Женский</option><option value="мужской">Мужской</option><option value="другое">Другое</option></>
            ) })}</div>
            {genderOther && <div>{lbl('Уточните')}{fi('ce-gender-other', { val: char?.gender_other || '' })}</div>}
            <div>{lbl('Дата рождения')}<BirthInput id="ce-birth" defaultValue={char?.birthdate || ''} /></div>
            <div>{lbl('Возраст')}{fi('ce-age', { type:'number', val: char?.age || '', ph:'0', min:0 })}</div>
            <div>{lbl('Статус')}{sel('ce-status', { val: char?.char_status || '', children: (
              <><option value="">— не выбрано —</option><option value="жив">Жив</option><option value="мертв">Мёртв</option><option value="пропал">Пропал</option><option value="неизвестен">Неизвестен</option></>
            ) })}</div>
            <div>{lbl('Локация')}{fi('ce-loc', { val: char?.location || '' })}</div>
          </div>
          <div style={{ marginBottom:10 }}>{lbl('Отличительные черты')}{fi('ce-feat', { val: char?.features || '' })}</div>
          <div style={{ marginBottom:10 }}>{lbl('Характер')}<textarea id="ce-pers" defaultValue={char?.personality || ''} placeholder="Характер персонажа..." style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #d8dff0', fontSize:13, fontFamily:'Nunito', resize:'none', minHeight:60, boxSizing:'border-box', outline:'none' }} onFocus={e => e.target.style.borderColor='#4547b5'} onBlur={e => e.target.style.borderColor='#d8dff0'} /></div>
          <div style={{ marginBottom:12 }}>{lbl('Подробное описание')}<textarea id="ce-desc" defaultValue={char?.desc_full || ''} placeholder="Внешность, биография..." style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid #d8dff0', fontSize:13, fontFamily:'Nunito', resize:'none', minHeight:70, boxSizing:'border-box', outline:'none' }} onFocus={e => e.target.style.borderColor='#4547b5'} onBlur={e => e.target.style.borderColor='#d8dff0'} /></div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontFamily:'Nunito', fontSize:13, fontWeight:600, color:'#2b2c7f' }}>Дополнительные метки</span>
            <button onClick={() => setCustomLabels(l => [...l, { key:'', value:'' }])} style={{ padding:'4px 12px', borderRadius:8, background:'#f0f2fb', border:'none', color:'#4547b5', fontFamily:'Nunito', fontWeight:600, cursor:'pointer', fontSize:12 }}>+ добавить</button>
          </div>
          {customLabels.map((lb, i) => (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}>
              <input value={lb.key}   onChange={e => setCustomLabels(l => l.map((x,j) => j===i ? {...x, key:e.target.value} : x))} placeholder="Название" style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1.5px solid #d8dff0', fontSize:12, fontFamily:'Nunito', outline:'none' }} />
              <input value={lb.value} onChange={e => setCustomLabels(l => l.map((x,j) => j===i ? {...x, value:e.target.value} : x))} placeholder="Значение" style={{ flex:1, padding:'7px 10px', borderRadius:8, border:'1.5px solid #d8dff0', fontSize:12, fontFamily:'Nunito', outline:'none' }} />
              <button onClick={() => setCustomLabels(l => l.filter((_,j) => j!==i))} style={{ width:28, borderRadius:8, background:'#fff0ee', border:'none', color:'#c0392b', cursor:'pointer', fontSize:14 }}>×</button>
            </div>
          ))}

          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:12, border:'1.5px solid #d8dff0', background:'transparent', color:'#6b7c9e', fontFamily:'Nunito', fontWeight:600, cursor:'pointer', fontSize:14 }}>Отмена</button>
            <button onClick={handleSave} style={{ flex:1, padding:'11px', borderRadius:12, border:'none', background:'#2b2c7f', color:'#fff', fontFamily:'Nunito', fontWeight:700, cursor:'pointer', fontSize:14 }}>Сохранить</button>
          </div>
        </div>
      </div>

      {cropOpen && (
        <CropModal onClose={() => setCropOpen(false)} onApply={(thumb, full) => { setThumbData(thumb); setFullData(full); setCropOpen(false); }} />
      )}

      {aiOverlayOpen && (
        <AiImageOverlay
          charFields={collectFields()}
          onApply={handleAiImageApply}
          onDismiss={() => setAiOverlayOpen(false)}
        />
      )}
    </>
  );
}

function MiniGraph({ characters, onView }) {
  const [nodes, setN] = useState({});
  const [edges, setE] = useState([]);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [r1, r2] = await Promise.all([apiFetch(`${API}/relationships`), apiFetch(`${API}/graph-layout`)]);
        if (r1?.ok) setE(await r1.json());
        if (r2?.ok) { const d = await r2.json(); setN(d.nodes || {}); }
      } catch (e) {}
      setOk(true);
    })();
  }, []);

  if (!ok) return null;
  const cm = {}; characters.forEach(c => { cm[c.id] = c; });
  const ents = Object.entries(nodes);
  if (!ents.length) return null;

  const PW = 268, PH = 150, NW = 90, NH = 110;
  const xs = ents.map(([, p]) => p.x), ys = ents.map(([, p]) => p.y);
  const mnX = Math.min(...xs), mxX = Math.max(...xs), mnY = Math.min(...ys), mxY = Math.max(...ys);
  const rX = mxX - mnX + NW || 1, rY = mxY - mnY + NH || 1;
  const sc = Math.min((PW - 16) / rX, (PH - 16) / rY) * 0.9;
  const ox = (PW - rX * sc) / 2 - mnX * sc, oy = (PH - rY * sc) / 2 - mnY * sc;
  const sv = (wx, wy) => ({ x: wx * sc + ox, y: wy * sc + oy });

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontFamily: 'Nunito', fontSize: 12, color: '#6b7c9e' }}>Граф отношений</label>
        <span style={{ fontFamily: 'Nunito', fontSize: 10, color: '#4547b5', cursor: 'pointer' }} onClick={onView}>открыть →</span>
      </div>
      <div onClick={onView} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(69,71,181,0.2)', background: 'linear-gradient(135deg,#f4f6ff,#eef0ff)', cursor: 'pointer', transition: 'box-shadow .2s' }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(69,71,181,0.15)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
        <svg width={PW} height={PH} style={{ display: 'block' }}>
          <defs><pattern id="mDots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(69,71,181,0.08)" /></pattern></defs>
          <rect width={PW} height={PH} fill="url(#mDots)" />
          {edges.map((edge, i) => {
            const n1 = nodes[edge.char1_id], n2 = nodes[edge.char2_id];
            if (!n1 || !n2) return null;
            const p1 = sv(n1.x + NW / 2, n1.y + NH / 2), p2 = sv(n2.x + NW / 2, n2.y + NH / 2);
            const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const px = -dy / dist, py = dx / dist, dir = i % 2 === 0 ? 1 : -1, bend = Math.min(dist * 0.18, 12) * dir;
            const cx1 = p1.x + dx / 3 + px * bend, cy1 = p1.y + dy / 3 + py * bend, cx2 = p2.x - dx / 3 + px * bend, cy2 = p2.y - dy / 3 + py * bend;
            return <path key={i} d={`M ${p1.x} ${p1.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${p2.x} ${p2.y}`} stroke={RELATION_COLORS[edge.relation_type] || '#aaa'} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.8} />;
          })}
          {ents.map(([cid, pos]) => {
            const c = cm[+cid]; const p = sv(pos.x + NW / 2, pos.y + NH / 2);
            return (<g key={cid}><circle cx={p.x} cy={p.y} r={6} fill="#4547b5" opacity={0.85} /><circle cx={p.x} cy={p.y} r={6} fill="none" stroke="white" strokeWidth={1.5} />{c && <text x={p.x} y={p.y + 15} textAnchor="middle" fontSize={8} fill="#2b2c7f" fontFamily="Nunito" fontWeight="600">{c.name.length > 11 ? c.name.slice(0, 10) + '…' : c.name}</text>}</g>);
          })}
        </svg>
        <div style={{ padding: '4px 10px 6px', display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Nunito', fontSize: 10, color: '#8b9cbd' }}>нажмите, чтобы просмотреть</span>
        </div>
      </div>
    </div>
  );
}

function RelationPicker({ x, y, onSelect, onDelete, isEdit }) {
  const sx = Math.min(x, window.innerWidth - 210), sy = Math.min(y, window.innerHeight - 260);
  return (
    <div style={{ position: 'fixed', left: sx, top: sy, zIndex: 5000, background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(30,32,96,0.22)', padding: 8, minWidth: 188, border: '1px solid #e0e4f0' }} onClick={e => e.stopPropagation()}>
      <div style={{ fontFamily: 'Nunito', fontSize: 11, color: '#8b9cbd', padding: '4px 8px 6px', fontWeight: 600 }}>Тип отношений</div>
      {RELATION_TYPES.map(t => (
        <div key={t} onClick={() => onSelect(t)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Nunito', fontSize: 13, color: '#2b2c7f' }}
          onMouseEnter={e => e.currentTarget.style.background = '#f0f2fb'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: RELATION_COLORS[t], flexShrink: 0, display: 'inline-block' }} />
          {t}
        </div>
      ))}
      {isEdit && <div onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Nunito', fontSize: 13, color: '#c0392b', marginTop: 4, borderTop: '1px solid #f0e0e0' }}
        onMouseEnter={e => e.currentTarget.style.background = '#fff0ee'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        Удалить связь
      </div>}
    </div>
  );
}

function GraphViewModal({ characters, bgUrl, onClose }) {
  const [nodes, setN] = useState({}); const [edges, setE] = useState([]);
  const [scale, setSc] = useState(1); const [off, setOff] = useState({ x: 60, y: 60 });
  const ref = useRef(null); const drag = useRef(null);

  useEffect(() => {
    (async () => {
      const [r1, r2] = await Promise.all([apiFetch(`${API}/relationships`), apiFetch(`${API}/graph-layout`)]);
      if (r1?.ok) setE(await r1.json());
      if (r2?.ok) { const d = await r2.json(); setN(d.nodes || {}); }
    })();
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fn = e => { e.preventDefault(); const ns = Math.max(0.2, Math.min(4, scale * (e.deltaY < 0 ? 1.1 : 0.9))); const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; setOff(o => ({ x: mx - (mx - o.x) * (ns / scale), y: my - (my - o.y) * (ns / scale) })); setSc(ns); };
    el.addEventListener('wheel', fn, { passive: false }); return () => el.removeEventListener('wheel', fn);
  }, [scale, off]);

  const cm = {}; characters.forEach(c => { cm[c.id] = c; });
  const NW = 90, NH = 110;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 52, background: 'rgba(20,22,80,0.55)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, zIndex: 1 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '7px 14px', color: '#fff', fontFamily: 'Nunito', fontSize: 13, cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>закрыть
        </button>
        <span style={{ fontFamily: 'Playfair Display', fontWeight: 700, color: '#fff', fontSize: 16, flex: 1, textAlign: 'center' }}>Граф отношений</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {RELATION_TYPES.map(t => <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Nunito', fontSize: 11, color: 'rgba(255,255,255,0.8)' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: RELATION_COLORS[t], display: 'inline-block' }} />{t}</span>)}
        </div>
      </div>
      <div ref={ref} style={{ flex: 1, overflow: 'hidden', position: 'relative', background: bgUrl, cursor: 'grab' }}
        onMouseDown={e => { drag.current = { ox: off.x, oy: off.y, sx: e.clientX, sy: e.clientY }; }}
        onMouseMove={e => { if (!drag.current) return; setOff({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy }); }}
        onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,22,80,0.18)', pointerEvents: 'none' }} />
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.07, pointerEvents: 'none' }}>
          <defs><pattern id="vGrid" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="white" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#vGrid)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${off.x}px,${off.y}px) scale(${scale})`, overflow: 'visible' }}>
          <svg style={{ position: 'absolute', left: 0, top: 0, width: 8000, height: 8000, overflow: 'visible' }}>
            {edges.map((edge, i) => {
              const n1 = nodes[edge.char1_id], n2 = nodes[edge.char2_id]; if (!n1 || !n2) return null;
              const x1 = n1.x + NW / 2, y1 = n1.y + NH / 2, x2 = n2.x + NW / 2, y2 = n2.y + NH / 2;
              const color = RELATION_COLORS[edge.relation_type] || '#aaa';
              const mid = bezierMid(x1, y1, x2, y2, i);
              return (<g key={edge.id || i}>
                <path d={edgePath(x1, y1, x2, y2, i)} stroke={color} strokeWidth={2.5 / scale} fill="none" strokeLinecap="round" opacity={0.9} />
                <circle cx={x1} cy={y1} r={4 / scale} fill={color} /><circle cx={x2} cy={y2} r={4 / scale} fill={color} />
                <text x={mid.x} y={mid.y - 8 / scale} textAnchor="middle" fontSize={10 / scale} fill={color} fontFamily="Nunito" fontWeight="700" opacity={0.9}>{edge.relation_type}</text>
              </g>);
            })}
          </svg>
          {Object.entries(nodes).map(([cid, pos]) => {
            const char = cm[+cid]; if (!char) return null;
            const th = photoUrl(char.photo_url || char.photo);
            return (<div key={cid} style={{ position: 'absolute', left: pos.x, top: pos.y, width: NW, height: NH, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px 8px', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 14, userSelect: 'none' }}>
              <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.2)', marginBottom: 6, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.4)' }}>{th ? <img src={th} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: 0.4 }}>👤</div>}</div>
              <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#fff', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap', padding: '0 4px' }}>{char.name}</div>
              {char.role && <div style={{ fontFamily: 'Nunito', fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{char.role}</div>}
            </div>);
          })}
        </div>
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,22,80,0.5)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 14px', color: 'rgba(255,255,255,0.7)', fontFamily: 'Nunito', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          прокрутка — масштаб · перетаскивание — перемещение
        </div>
      </div>
    </div>
  );
}

const NW = 90, NH = 118, DR = 7;

function RelationshipGraph({ characters, bgUrl, onClose, onSaved }) {
  const [nodes, setNodes] = useState({});
  const [edges, setEdges] = useState([]);
  const [selId, setSelId] = useState(null);
  const [picker, setPicker] = useState(null);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 80, y: 80 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eDrag, setEDrag] = useState(null);
  const [ghost, setGhost] = useState(null);

  const cvRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [r1, r2] = await Promise.all([apiFetch(`${API}/relationships`), apiFetch(`${API}/graph-layout`)]);
        if (r1?.ok) setEdges((await r1.json()).map((e, i) => ({ ...e, id: e.id || i })));
        if (r2?.ok) { const d = await r2.json(); setNodes(d.nodes || {}); }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const el = cvRef.current; if (!el) return;
    const fn = e => {
      e.preventDefault();
      const ns = Math.max(0.2, Math.min(4, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      setOff(o => ({ x: mx - (mx - o.x) * (ns / scale), y: my - (my - o.y) * (ns / scale) })); setScale(ns);
    };
    el.addEventListener('wheel', fn, { passive: false }); return () => el.removeEventListener('wheel', fn);
  }, [scale, off]);

  useEffect(() => {
    const mv = e => {
      const d = drag.current; if (!d) return;
      const r = cvRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      if (d.type === 'node') { const wx = (e.clientX - r.left - off.x) / scale, wy = (e.clientY - r.top - off.y) / scale; setNodes(n => ({ ...n, [d.id]: { x: wx - d.ox, y: wy - d.oy } })); }
      else if (d.type === 'pan') { setOff({ x: d.sox + e.clientX - d.smx, y: d.soy + e.clientY - d.smy }); }
      else if (d.type === 'sb') { setGhost({ x: e.clientX, y: e.clientY, cid: d.cid }); }
      else if (d.type === 'edge') { setEDrag(v => v ? { ...v, x2: e.clientX - r.left, y2: e.clientY - r.top } : null); }
    };
    const mu = e => {
      const d = drag.current; if (!d) { return; } drag.current = null;
      if (d.type === 'sb') {
        const r = cvRef.current?.getBoundingClientRect();
        if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const wx = (e.clientX - r.left - off.x) / scale, wy = (e.clientY - r.top - off.y) / scale;
          setNodes(n => ({ ...n, [d.cid]: { x: wx - NW / 2, y: wy - NH / 2 } }));
        }
        setGhost(null);
      } else if (d.type === 'edge') {
        setEDrag(null);
        const r = cvRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const wx = (e.clientX - r.left - off.x) / scale, wy = (e.clientY - r.top - off.y) / scale;
        let tid = null;
        for (const [cid, pos] of Object.entries(nodes)) { if (+cid !== d.fid && wx >= pos.x && wx <= pos.x + NW && wy >= pos.y && wy <= pos.y + NH) { tid = +cid; break; } }
        if (tid !== null) {
          const ex = edges.find(e => (e.char1_id === d.fid && e.char2_id === tid) || (e.char1_id === tid && e.char2_id === d.fid));
          if (!ex) setPicker({ c1: d.fid, c2: tid, x: e.clientX, y: e.clientY });
        }
      }
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', mu);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', mu); };
  }, [scale, off, nodes, edges]);

  const startDot = (e, cid, dwx, dwy) => {
    e.stopPropagation(); e.preventDefault();
    const r = cvRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    drag.current = { type: 'edge', fid: cid };
    setEDrag({ x1: dwx * scale + off.x, y1: dwy * scale + off.y, x2: e.clientX - r.left, y2: e.clientY - r.top });
    setSelId(null);
  };

  const removeNode = cid => { setNodes(n => { const { [cid]: _, ...r } = n; return r; }); setEdges(e => e.filter(x => x.char1_id !== +cid && x.char2_id !== +cid)); setSelId(null); };

  const pickRel = type => {
    if (!picker) return;
    if (picker.eid !== undefined) { setEdges(e => e.map(x => x.id === picker.eid ? { ...x, relation_type: type } : x)); }
    else { const [c1, c2] = [Math.min(picker.c1, picker.c2), Math.max(picker.c1, picker.c2)]; setEdges(e => [...e, { id: Date.now(), char1_id: c1, char2_id: c2, relation_type: type }]); }
    setPicker(null);
  };
  const delRel = () => { if (picker?.eid !== undefined) setEdges(e => e.filter(x => x.id !== picker.eid)); setPicker(null); };

  const save = async () => {
    setSaving(true);
    try {
      const [r1, r2] = await Promise.all([
        apiFetch(`${API}/relationships`, { method: 'PUT', body: JSON.stringify({ relationships: edges.map(e => ({ char1_id: e.char1_id, char2_id: e.char2_id, relation_type: e.relation_type })) }) }),
        apiFetch(`${API}/graph-layout`, { method: 'PUT', body: JSON.stringify({ nodes }) }),
      ]);
      if (r1?.ok && r2?.ok) { notifications.success('Граф сохранён'); onSaved?.(); }
      else notifications.error('Ошибка при сохранении');
    } catch (e) { notifications.error('Ошибка'); }
    setSaving(false);
  };

  const cm = {}; characters.forEach(c => { cm[c.id] = c; });
  const onCvs = new Set(Object.keys(nodes).map(Number));
  const sbChars = characters.filter(c => !onCvs.has(c.id));
  const dots = [{ dx: NW / 2, dy: 0 }, { dx: NW / 2, dy: NH }, { dx: 0, dy: NH / 2 }, { dx: NW, dy: NH / 2 }];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 52, background: 'rgba(20,22,80,0.55)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0, zIndex: 1 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '7px 14px', color: '#fff', fontFamily: 'Nunito', fontSize: 13, cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>назад
        </button>
        <span style={{ fontFamily: 'Playfair Display', fontWeight: 700, color: '#fff', fontSize: 17, flex: 1, textAlign: 'center' }}>Граф отношений</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {RELATION_TYPES.map(t => <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Nunito', fontSize: 11, color: 'rgba(255,255,255,0.8)' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: RELATION_COLORS[t], display: 'inline-block', flexShrink: 0 }} />{t}</span>)}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={cvRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', background: bgUrl }}
          onClick={e => { if (e.target === cvRef.current || e.target.dataset.bg) { setSelId(null); setPicker(null); } }}
          onMouseDown={e => {
            if ((e.ctrlKey && e.button === 0) || e.button === 1) {
              e.preventDefault(); setSelId(null); setPicker(null);
              drag.current = { type: 'pan', sox: off.x, soy: off.y, smx: e.clientX, smy: e.clientY }; return;
            }
            if (e.target === cvRef.current || e.target.dataset.bg) {
              setSelId(null); setPicker(null);
              drag.current = { type: 'pan', sox: off.x, soy: off.y, smx: e.clientX, smy: e.clientY };
            }
          }}>
          <div data-bg="1" style={{ position: 'absolute', inset: 0, background: 'rgba(20,22,80,0.12)', pointerEvents: 'none' }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.1 }}>
            <defs><pattern id="dg" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="white" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#dg)" />
          </svg>
          {eDrag && <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}>
            <line x1={eDrag.x1} y1={eDrag.y1} x2={eDrag.x2} y2={eDrag.y2} stroke="rgba(69,71,181,0.5)" strokeWidth={2} strokeDasharray="6,4" />
            <circle cx={eDrag.x1} cy={eDrag.y1} r={4} fill="rgba(69,71,181,0.7)" />
          </svg>}

          <div data-bg="1" style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${off.x}px,${off.y}px) scale(${scale})`, overflow: 'visible' }}>
            <svg style={{ position: 'absolute', left: 0, top: 0, width: 8000, height: 8000, overflow: 'visible' }}>
              {edges.map((edge, i) => {
                const n1 = nodes[edge.char1_id], n2 = nodes[edge.char2_id]; if (!n1 || !n2) return null;
                const x1 = n1.x + NW / 2, y1 = n1.y + NH / 2, x2 = n2.x + NW / 2, y2 = n2.y + NH / 2;
                const color = RELATION_COLORS[edge.relation_type] || '#aaa';
                const mid = bezierMid(x1, y1, x2, y2, i);
                return (<g key={edge.id} style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setSelId(null); setPicker({ eid: edge.id, x: e.clientX, y: e.clientY }); }}>
                  <path d={edgePath(x1, y1, x2, y2, i)} stroke="transparent" strokeWidth={14 / scale} fill="none" style={{ pointerEvents: 'stroke' }} />
                  <path d={edgePath(x1, y1, x2, y2, i)} stroke={color} strokeWidth={2.5 / scale} fill="none" strokeLinecap="round" opacity={0.9} style={{ pointerEvents: 'none' }} />
                  <circle cx={x1} cy={y1} r={4 / scale} fill={color} style={{ pointerEvents: 'none' }} />
                  <circle cx={x2} cy={y2} r={4 / scale} fill={color} style={{ pointerEvents: 'none' }} />
                  <text x={mid.x} y={mid.y - 8 / scale} textAnchor="middle" fontSize={10 / scale} fill={color} fontFamily="Nunito" fontWeight="700" opacity={0.95} style={{ pointerEvents: 'none' }}>{edge.relation_type}</text>
                </g>);
              })}
            </svg>

            {Object.entries(nodes).map(([cid, pos]) => {
              const char = cm[+cid]; if (!char) return null;
              const isSel = selId === +cid;
              const th = photoUrl(char.photo_url || char.photo);
              return (
                <div key={cid} style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: isSel ? 10 : 5 }}>
                  {isSel && <div style={{ position: 'absolute', left: NW / 2 - 13, top: -30, zIndex: 20 }}>
                    <button onClick={e => { e.stopPropagation(); removeNode(+cid); }} style={{ width: 26, height: 26, borderRadius: '50%', background: '#c0392b', border: '2px solid #fff', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>}
                  <div style={{ width: NW, height: NH, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px 8px',
                    background: isSel ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.56)',
                    backdropFilter: 'blur(14px)',
                    border: isSel ? '2px solid rgba(69,71,181,0.65)' : '1px solid rgba(255,255,255,0.55)',
                    borderRadius: 14, cursor: 'grab', userSelect: 'none',
                    boxShadow: isSel ? '0 0 18px rgba(69,71,181,0.28)' : '0 4px 16px rgba(20,22,80,0.18)',
                    transition: 'border .15s,background .15s' }}
                    onMouseDown={e => {
                      if (e.target.dataset.dot) return;
                      e.stopPropagation(); setPicker(null);
                      const r = cvRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
                      const wx = (e.clientX - r.left - off.x) / scale, wy = (e.clientY - r.top - off.y) / scale;
                      drag.current = { type: 'node', id: +cid, ox: wx - pos.x, oy: wy - pos.y };
                    }}
                    onClick={e => { e.stopPropagation(); setPicker(null); setSelId(p => p === +cid ? null : +cid); }}>
                    <div style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', background: 'rgba(69,71,181,0.08)', marginBottom: 7, flexShrink: 0, border: '1.5px solid rgba(69,71,181,0.18)' }}>
                      {th ? <img src={th} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, opacity: 0.22 }}>👤</div>}
                    </div>
                    <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#2b2c7f', fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap', padding: '0 4px' }}>{char.name}</div>
                    {char.role && <div style={{ fontFamily: 'Nunito', fontSize: 9, color: '#6b7c9e', marginTop: 2 }}>{char.role}</div>}
                  </div>
                  {isSel && dots.map((d, di) => (
                    <div key={di} data-dot="1"
                      style={{ position: 'absolute', left: d.dx - DR, top: d.dy - DR, width: DR * 2, height: DR * 2, borderRadius: '50%', background: '#4547b5', border: '2px solid #fff', cursor: 'crosshair', zIndex: 15, boxShadow: '0 2px 6px rgba(43,44,127,0.45)', transition: 'transform .1s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.35)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      onMouseDown={e => startDot(e, +cid, pos.x + d.dx, pos.y + d.dy)} />
                  ))}
                </div>
              );
            })}

            {Object.keys(nodes).length === 0 && !loading && (
              <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', minWidth: 400, minHeight: 300 }}>
                <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: '28px 40px', border: '1px solid rgba(255,255,255,0.35)' }}>
                  <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.5 }}>🕸</div>
                  <div style={{ fontFamily: 'Nunito', color: '#2b2c7f', fontSize: 14, fontWeight: 600, opacity: 0.7 }}>Перетащите персонажа с панели справа</div>
                  <div style={{ fontFamily: 'Nunito', color: '#6b7c9e', fontSize: 12, marginTop: 4 }}>тяните синюю точку для создания связи</div>
                </div>
              </div>
            )}
          </div>

          <button onClick={save} disabled={saving}
            style={{ position: 'absolute', right: 20, bottom: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 14, background: saving ? 'rgba(69,71,181,0.6)' : 'rgba(43,44,127,0.88)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', boxShadow: '0 4px 20px rgba(43,44,127,0.3)', backdropFilter: 'blur(8px)', transition: 'background .2s' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'rgba(69,71,181,0.94)'; }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = 'rgba(43,44,127,0.88)'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>

          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 14px', color: 'rgba(43,44,127,0.85)', fontFamily: 'Nunito', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🖱 прокрутка — масштаб &nbsp;·&nbsp; Ctrl+ЛКМ — перемещение &nbsp;·&nbsp; синяя точка — связь
          </div>
        </div>

        <div style={{ width: 200, flexShrink: 0, background: 'rgba(255,255,255,0.92)', borderLeft: '1px solid rgba(69,71,181,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid rgba(69,71,181,0.1)' }}>
            <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#2b2c7f', fontSize: 13 }}>Персонажи</div>
            <div style={{ fontFamily: 'Nunito', fontSize: 11, color: '#8b9cbd', marginTop: 2 }}>{sbChars.length > 0 ? `${sbChars.length} не добавлено` : 'Все на холсте ✓'}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sbChars.map(char => {
              const th = photoUrl(char.photo_url || char.photo);
              return (<div key={char.id}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'rgba(69,71,181,0.05)', border: '1px solid rgba(69,71,181,0.12)', borderRadius: 12, cursor: 'grab', userSelect: 'none', transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(69,71,181,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(69,71,181,0.05)'}
                onMouseDown={e => { e.preventDefault(); drag.current = { type: 'sb', cid: char.id }; setGhost({ x: e.clientX, y: e.clientY, cid: char.id }); }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', background: '#eef0ff', flexShrink: 0 }}>
                  {th ? <img src={th} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#c0c4e8' }}>👤</div>}
                </div>
                <div>
                  <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#2b2c7f', fontSize: 12, lineHeight: 1.2 }}>{char.name}</div>
                  {char.role && <div style={{ fontFamily: 'Nunito', fontSize: 10, color: '#8b9cbd', marginTop: 1 }}>{char.role}</div>}
                </div>
              </div>);
            })}
            {sbChars.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: '#8b9cbd', fontFamily: 'Nunito', fontSize: 12 }}>Все персонажи<br />на холсте</div>}
          </div>
        </div>
      </div>

      {ghost && (() => { const char = cm[ghost.cid]; if (!char) return null; const th = photoUrl(char.photo_url || char.photo); return (
        <div style={{ position: 'fixed', left: ghost.x - NW / 2, top: ghost.y - NH / 2 - 10, pointerEvents: 'none', zIndex: 9999, opacity: 0.88 }}>
          <div style={{ width: NW, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px 8px', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)', border: '2px solid rgba(69,71,181,0.5)', borderRadius: 14, boxShadow: '0 8px 24px rgba(43,44,127,0.28)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#eef0ff', marginBottom: 6 }}>{th ? <img src={th} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#c0c4e8' }}>👤</div>}</div>
            <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#2b2c7f', fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', padding: '0 4px' }}>{char.name}</div>
          </div>
        </div>
      ); })()}

      {picker && <><div style={{ position: 'fixed', inset: 0, zIndex: 4999 }} onClick={() => setPicker(null)} /><RelationPicker x={picker.x} y={picker.y} onSelect={pickRel} onDelete={delRel} isEdit={picker.eid !== undefined} /></>}

      {loading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ fontFamily: 'Nunito', color: '#2b2c7f', fontSize: 14 }}>Загрузка...</div>
      </div>}
    </div>
  );
}

export default function ProjectPage() {
  const [project,         setProject]        = useState(null);
  const [characters,      setCharacters]     = useState([]);
  const [charOffset,      setCharOffset]      = useState(0);
  const [chapters,        setChapters]       = useState([]);
  const [editMode,        setEditMode]       = useState(false);
  const [panelHidden,     setPanelHidden]    = useState(false);
  const [tags,            setTags]           = useState({});
  const [charView,        setCharView]       = useState(null);
  const [charEdit,        setCharEdit]       = useState(undefined);
  const [deleteChapterId, setDeleteChapterId]= useState(null);
  const [deleteModal,     setDeleteModal]    = useState(false);
  const [bgError,         setBgError]        = useState(false);
  const [showGraph,       setShowGraph]      = useState(false);
  const [showView,        setShowView]       = useState(false);
  const [readerChapters,  setReaderChapters] = useState(null);
  const [addChapterModal, setAddChapterModal]= useState(false);
  const [mgKey,           setMGKey]          = useState(0);

  const [cardsPerPage, setCardsPerPage] = useState(6);
  const charContainerRef = useRef(null);

  useEffect(() => {
    const calculateCardsPerPage = () => {
      if (!charContainerRef.current) return;
      const containerWidth = charContainerRef.current.clientWidth;
      const cardWidth = 142;
      const possibleCards = Math.floor((containerWidth - 40) / cardWidth);
      setCardsPerPage(Math.max(3, Math.min(possibleCards, 8)));
    };

    calculateCardsPerPage();
    window.addEventListener('resize', calculateCardsPerPage);
    return () => window.removeEventListener('resize', calculateCardsPerPage);
  }, []);

  const onUnauth = () => { removeToken(); window.location.href = 'http://localhost:8010/'; };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) { localStorage.setItem('access_token', token); window.history.replaceState({}, '', window.location.pathname); }
    load();
  }, []);

  const load = async () => {
    const res = await apiFetch(API, {}, onUnauth);
    if (!res || !res.ok) { notifications.error('Не удалось загрузить проект'); return; }
    const p = await res.json();
    setProject(p);
    setCharacters(p.characters || []);
    setCharOffset(0);
    setChapters(p.chapters || []);
    const t = {};
    if (p.parts) t.parts = p.parts;
    if (p.genre) t.genre = p.genre;
    if (p.status) t.status = p.status;
    setTags(t);
  };

  const saveProject = async () => {
    const title = document.getElementById('proj-title').value.trim() || project?.title;
    const desc  = document.getElementById('proj-desc').value.trim()  || null;
    const body  = { title, description: desc, genre: tags.genre || null, status: tags.status || null, parts: tags.parts || null };
    const res   = await apiFetch(API, { method: 'PATCH', body: JSON.stringify(body) }, onUnauth);
    if (!res) return;
    if (res.ok) { const u = await res.json(); setProject(u); notifications.success('Информация обновлена'); setEditMode(false); }
    else notifications.error('Ошибка при сохранении');
  };

  const toggleTag = (group, val) => setTags(t => ({ ...t, [group]: t[group] === val ? undefined : val }));

  const openEditor = (ch) => { window.location.href = `http://localhost:8012/editor/${PROJECT_ID}/${ch.id}?token=${getToken()}`; };

  const deleteChapter = async () => {
    if (!deleteChapterId) return;
    const res = await apiFetch(`${API}/chapters/${deleteChapterId}`, { method: 'DELETE' }, onUnauth);
    if (res?.status === 204) { setChapters(c => c.filter(x => x.id !== deleteChapterId)); notifications.success('Глава удалена'); setDeleteChapterId(null); }
    else notifications.error('Ошибка при удалении');
  };

  const deleteProject = async () => {
    const res = await apiFetch(API, { method: 'DELETE' }, onUnauth);
    if (res?.status === 204) window.location.href = 'http://localhost:8011/catalog';
    else notifications.error('Ошибка при удалении');
  };

  const TAG_GROUPS = [
    { group: 'parts',  options: ['одночастный', 'многочастный'] },
    { group: 'genre',  options: ['рассказ', 'повесть', 'роман', 'стихи'] },
    { group: 'status', options: ['завершен', 'в процессе', 'на паузе'] },
  ];

  const bgCss = bgError ? 'linear-gradient(135deg,#c5c8e8 0%,#9a9ed8 40%,#3b3d8a 100%)' : `url(${MINIO_BG}) center/cover no-repeat fixed`;
  const bgUrl = bgError ? 'linear-gradient(135deg,#c5c8e8 0%,#9a9ed8 40%,#3b3d8a 100%)' : `url(${MINIO_BG}) center/cover no-repeat`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }
        .pbg { min-height: 100vh; background: ${bgCss}; display: flex; flex-direction: column; }
        .ptop { height: 52px; background: rgba(20,22,80,0.5); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; padding: 0 28px; gap: 16px; position: sticky; top: 0; z-index: 100; }
        .pmain { flex: 1; display: flex; overflow: hidden; }
        .lcol { flex: 1; padding: 28px 32px; overflow-y: auto; min-width: 0; }
        .rcol { width: 320px; flex-shrink: 0; background: rgba(255,255,255,0.92); border-left: 1px solid rgba(69,71,181,0.15); padding: 24px; overflow-y: auto; transition: width .45s cubic-bezier(.4,0,.2,1), padding .45s, opacity .35s; opacity: 1; }
        .rcol.h { width: 0; padding: 0; overflow: hidden; opacity: 0; }
        .sc { background: rgba(255,255,255,0.12); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.2); border-radius: 16px; padding: 20px; margin-bottom: 20px; }
        .sh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .sl { font-family: Nunito; font-weight: 700; color: #fff; font-size: 15px; }
        .cc { width: 130px; flex-shrink: 0; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 12px 10px; cursor: pointer; transition: background .15s, transform .15s; text-align: center; }
        .cc:hover { background: rgba(255,255,255,0.28); transform: translateY(-2px); }
        .cp { width: 90px; height: 90px; border-radius: 10px; margin: 0 auto 8px; overflow: hidden; background: #d0d4f0; }
        .ci { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; margin-bottom: 8px; cursor: pointer; transition: background .15s; }
        .ci:hover { background: rgba(255,255,255,0.2); }
        .tp { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-family: Nunito; font-weight: 600; background: rgba(69,71,181,0.2); color: #4547b5; border: 1px solid rgba(69,71,181,0.3); margin-right: 6px; margin-bottom: 4px; }
        .ts { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-family: Nunito; font-weight: 600; cursor: pointer; background: transparent; color: #6b7c9e; border: 1px solid #d8dff0; margin-right: 6px; margin-bottom: 4px; transition: background .15s, color .15s; }
        .ts:hover { background: #f0f2fb; color: #4547b5; }
        .ts.a { background: #2b2c7f; color: #fff; border-color: #2b2c7f; }
        .rb { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1.5px solid rgba(69,71,181,0.25); background: linear-gradient(135deg,rgba(69,71,181,0.08),rgba(69,71,181,0.04)); color: #2b2c7f; font-family: Nunito; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all .2s; margin-top: 14px; }
        .rb:hover { background: linear-gradient(135deg,rgba(69,71,181,0.16),rgba(69,71,181,0.09)); border-color: rgba(69,71,181,0.45); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(69,71,181,0.12); }
      `}</style>
      <img src={MINIO_BG} onError={() => setBgError(true)} style={{ display: 'none' }} alt="" />

      <div className="pbg">
        <div className="ptop">
          <button onClick={() => window.location.href = 'http://localhost:8011/catalog'} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '7px 14px', color: '#fff', fontFamily: 'Nunito', fontSize: 13, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            назад
          </button>
          <span style={{ fontFamily: 'Playfair Display', fontWeight: 700, color: '#fff', fontSize: 16, flex: 1, textAlign: 'center' }}>{project?.title || 'Загрузка...'}</span>
          <span style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'Nunito', fontSize: 12, padding: '4px 12px', borderRadius: 20 }}>Глав: {chapters.length}</span>
          <button onClick={() => setPanelHidden(h => !h)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer' }}>☰</button>
        </div>

        <div className="pmain">
          <div className="lcol">
            <div className="sc">
              <div className="sh">
                <span className="sl">Карточки персонажей</span>
                <button onClick={() => setCharEdit(null)} style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.9)', border: 'none', color: '#2b2c7f', fontFamily: 'Nunito', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>+ добавить</button>
              </div>
              {characters.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Nunito', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Персонажей пока нет</div>
              ) : (() => {
                const MAIN = ['PROTAGONIST', 'ANTAGONIST', 'протагонист', 'антагонист'];
                const sorted = [
                  ...characters.filter(c => MAIN.includes(c.role)),
                  ...characters.filter(c => !MAIN.includes(c.role)),
                ];
                const PAGE = cardsPerPage;
                const maxOff = Math.max(0, sorted.length - PAGE);
                const off = Math.min(charOffset, maxOff);
                const canPrev = off > 0;
                const canNext = off < maxOff;
                const navBtn = (enabled) => ({
                  width: 30, height: 30, flexShrink: 0, borderRadius: '50%',
                  background: enabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: enabled ? '#fff' : 'rgba(255,255,255,0.2)',
                  cursor: enabled ? 'pointer' : 'default',
                  fontSize: 20, fontWeight: 700, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s',
                });
                return (
                  <div ref={charContainerRef} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={navBtn(canPrev)} disabled={!canPrev}
                      onClick={() => setCharOffset(o => Math.max(0, o - 1))}>‹</button>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap', overflow: 'hidden' }}>
                      {sorted.slice(off, off + PAGE).map(ch => {
                        const thumb = photoUrl(ch.photo_url || ch.photo);
                        return (
                          <div key={ch.id} className="cc" style={{ flexShrink: 0 }} onClick={() => setCharView(ch)}>
                            <div className="cp">
                              {thumb
                                ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(100,100,180,0.5)', fontSize: 11 }}>нет фото</div>}
                            </div>
                            <div style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#fff', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</div>
                            {ch.role && <div style={{ fontFamily: 'Nunito', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{ch.role}</div>}
                          </div>
                        );
                      })}
                    </div>

                    <button style={navBtn(canNext)} disabled={!canNext}
                      onClick={() => setCharOffset(o => Math.min(maxOff, o + 1))}>›</button>
                  </div>
                );
              })()}
            </div>

            <div className="sc">
              <div className="sh">
                <span className="sl">Главы</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {chapters.length > 0 && (
                    <button onClick={() => setReaderChapters(chapters)}
                      style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'Nunito', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      Читать
                    </button>
                  )}
                  <button onClick={() => setAddChapterModal(true)}
                    style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.9)', border: 'none', color: '#2b2c7f', fontFamily: 'Nunito', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                    + добавить
                  </button>
                </div>
              </div>
              {chapters.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Nunito', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Глав пока нет — добавьте первую!</div>
              ) : (
                chapters.map(ch => (
                  <div key={ch.id} className="ci">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => setReaderChapters(chapters)}
                        title="Читать"
                        style={{ fontFamily: 'Nunito', fontWeight: 600, color: '#fff', fontSize: 14, cursor: 'pointer',
                          textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'rgba(255,255,255,0.4)',
                          textUnderlineOffset: 3, display: 'inline-block', maxWidth: '100%',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.title}
                      </div>
                      <div style={{ fontFamily: 'Nunito', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>символов: {(ch.char_count || 0).toLocaleString('ru')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button title="Открыть редактор" onClick={() => openEditor(ch)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button title="В корзину" onClick={() => setDeleteChapterId(ch.id)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {!panelHidden && (
            <div className="rcol">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontFamily: 'Nunito', fontWeight: 700, color: '#2b2c7f', fontSize: 15 }}>О проекте</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {editMode && (
                    <button onClick={saveProject} style={{ width: 32, height: 32, borderRadius: 8, background: '#2b2c7f', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    </button>
                  )}
                  <button onClick={() => setEditMode(e => !e)} style={{ width: 32, height: 32, borderRadius: 8, background: editMode ? '#e0e4ff' : '#f0f2fb', border: 'none', color: '#4547b5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button onClick={() => setDeleteModal(true)} style={{ width: 32, height: 32, borderRadius: 8, background: '#fff0ee', border: '1px solid #f0c0bc', color: '#c0392b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontFamily: 'Nunito', fontSize: 12, color: '#6b7c9e', display: 'block', marginBottom: 4 }}>Название</label>
                <input id="proj-title" defaultValue={project?.title || ''} key={project?.title} disabled={!editMode} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #d8dff0', fontSize: 14, fontFamily: 'Nunito', fontWeight: 600, outline: 'none', color: '#2b2c7f', background: editMode ? '#fff' : '#f8f9fd', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontFamily: 'Nunito', fontSize: 12, color: '#6b7c9e', display: 'block', marginBottom: 6 }}>Теги</label>
                {editMode ? (
                  TAG_GROUPS.map(({ group, options }) => (
                    <div key={group} style={{ marginBottom: 6 }}>
                      {options.map(opt => <span key={opt} className={`ts ${tags[group] === opt ? 'a' : ''}`} onClick={() => toggleTag(group, opt)}>{opt}</span>)}
                    </div>
                  ))
                ) : (
                  <div>{Object.values(tags).filter(Boolean).map((t, i) => <span key={i} className="tp">{t}</span>)}</div>
                )}
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontFamily: 'Nunito', fontSize: 12, color: '#6b7c9e', display: 'block', marginBottom: 4 }}>Описание</label>
                <textarea id="proj-desc" defaultValue={project?.description || ''} key={project?.description} disabled={!editMode} placeholder="Опишите проект..." style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #d8dff0', fontSize: 13, fontFamily: 'Nunito', resize: 'none', minHeight: 100, boxSizing: 'border-box', outline: 'none', color: '#2b2c7f', background: editMode ? '#fff' : '#f8f9fd' }} />
              </div>

              <button className="rb" onClick={() => setShowGraph(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><line x1="6" y1="8" x2="12" y2="16" /><line x1="18" y1="8" x2="12" y2="16" /><line x1="6" y1="6" x2="18" y2="6" /></svg>
                Граф отношений
              </button>

              {characters.length > 0 && <MiniGraph key={mgKey} characters={characters} onView={() => setShowView(true)} />}
            </div>
          )}
        </div>
      </div>

      {showGraph && <RelationshipGraph characters={characters} bgUrl={bgUrl} onClose={() => setShowGraph(false)} onSaved={() => setMGKey(k => k + 1)} />}

      {showView && <GraphViewModal characters={characters} bgUrl={bgUrl} onClose={() => setShowView(false)} />}

      {charView && (
        <CharViewModal char={charView} onClose={() => setCharView(null)} onEdit={() => { setCharEdit(charView); setCharView(null); }} />
      )}

      {charEdit !== undefined && (
        <CharEditModal char={charEdit} onClose={() => setCharEdit(undefined)}
          onSaved={(saved, deletedId) => {
            if (deletedId) setCharacters(c => c.filter(x => x.id !== deletedId));
            else if (saved) {
              setCharacters(c => {
                const idx = c.findIndex(x => x.id === saved.id);
                return idx >= 0 ? c.map(x => x.id === saved.id ? saved : x) : [...c, saved];
              });
            }
          }}
        />
      )}

      {deleteChapterId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,60,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }} onClick={() => setDeleteChapterId(null)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 340, boxShadow: '0 20px 60px rgba(30,32,96,0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Nunito', color: '#2b2c7f', marginBottom: 8 }}>Переместить в корзину?</h3>
            <p style={{ fontFamily: 'Nunito', color: '#8b9cbd', fontSize: 14, marginBottom: 24 }}>Глава будет перемещена в корзину. Вы сможете восстановить её в течение 60 дней.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteChapterId(null)} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid #d8dff0', background: 'transparent', color: '#6b7c9e', fontFamily: 'Nunito', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
              <button onClick={deleteChapter} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#3a4a8a', color: '#fff', fontFamily: 'Nunito', fontWeight: 700, cursor: 'pointer' }}>В корзину</button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,60,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }} onClick={() => setDeleteModal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: 340, boxShadow: '0 20px 60px rgba(30,32,96,0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Nunito', color: '#2b2c7f', marginBottom: 8 }}>Переместить проект в корзину?</h3>
            <p style={{ fontFamily: 'Nunito', color: '#8b9cbd', fontSize: 14, marginBottom: 24 }}>Проект будет перемещён в корзину. Вы сможете восстановить его в течение 60 дней.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid #d8dff0', background: 'transparent', color: '#6b7c9e', fontFamily: 'Nunito', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
              <button onClick={deleteProject} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#c0392b', color: '#fff', fontFamily: 'Nunito', fontWeight: 700, cursor: 'pointer' }}>В корзину</button>
            </div>
          </div>
        </div>
      )}

      {addChapterModal && (
        <AddChapterModal
          onClose={() => setAddChapterModal(false)}
          onSave={async (title) => {
            const res = await apiFetch(`${API}/chapters`, {
              method: 'POST',
              body: JSON.stringify({ title, order: chapters.length }),
            }, onUnauth);
            if (!res) return;
            if (res.ok || res.status === 201) {
              const saved = await res.json();
              setChapters(c => [...c, saved]);
              notifications.success('Глава добавлена');
              setAddChapterModal(false);
            } else {
              notifications.error('Не удалось добавить главу');
            }
          }}
        />
      )}

      {readerChapters && (
        <BookReader
          chapters={readerChapters}
          bookTitle={project?.title || ''}
          onClose={() => setReaderChapters(null)}
        />
      )}
    </>
  );
}

function AddChapterModal({ onClose, onSave }) {
  const [title,  setTitle]  = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(title.trim());
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,60,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 22, padding: 32, width: 420, boxShadow: '0 24px 80px rgba(30,32,96,0.35)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 20, color: '#2b2c7f', marginBottom: 6 }}>
          Новая глава
        </div>
        <div style={{ fontFamily: 'Nunito', fontSize: 13, color: '#8b9cbd', marginBottom: 24 }}>
          Введите название для новой главы
        </div>

        <label style={{ fontFamily: 'Nunito', fontSize: 12, fontWeight: 700, color: '#4b5c8a', display: 'block', marginBottom: 8 }}>
          Название главы
        </label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
          placeholder="Например: Глава 1. Начало пути"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 16px', borderRadius: 12,
            border: '1.5px solid #d8dff0', outline: 'none',
            fontFamily: 'Nunito', fontSize: 15, color: '#2b2c7f',
            background: '#f8f9ff',
          }}
          onFocus={e => { e.target.style.borderColor = '#2b2c7f'; }}
          onBlur={e => { e.target.style.borderColor = '#d8dff0'; }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 12,
            border: '1.5px solid #d8dff0', background: 'transparent',
            color: '#6b7c9e', fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Отмена</button>
          <button onClick={handleSave} disabled={!title.trim() || saving} style={{
            flex: 1, padding: '12px', borderRadius: 12, border: 'none',
            background: title.trim() ? '#2b2c7f' : '#d8dff0',
            color: '#fff', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
            cursor: title.trim() ? 'pointer' : 'default',
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Создание...' : 'Создать главу'}
          </button>
        </div>
      </div>
    </div>
  );
}