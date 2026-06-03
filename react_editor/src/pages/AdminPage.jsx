import { useState, useEffect, useCallback, useRef } from 'react';
import { getToken, removeToken } from '../utils/api.js';
import { notifications } from '../utils/notifications.js';

const AUTH    = 'http://localhost:8010';
const CATALOG = 'http://localhost:8011';
const PROJECT = 'http://localhost:8012';
const ADMIN   = 'http://localhost:8013';
const MINIO_BG = 'http://localhost:9000/app-backgrounds/bg10.jpg';
const MINIO_PHOTOS = 'http://localhost:9000/character-photos';

function authH() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}
async function apiGet(url) {
  const r = await fetch(url, { headers: authH() });
  if (r.status === 401) { removeToken(); window.location.href = AUTH + '/'; return null; }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  return r.json();
}
async function apiPost(url, body = {}) {
  const r = await fetch(url, { method: 'POST', headers: authH(), body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  return r.json().catch(() => ({}));
}
async function apiDelete(url) {
  const r = await fetch(url, { method: 'DELETE', headers: authH() });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
}

const RELATION_COLORS = {
  'женаты': '#c9860a', 'пара': '#c0392b', 'друзья': '#1e8449',
  'враги': '#2c3e50', 'знакомые': '#2471a3', 'нейтральные': '#7f8c8d',
};

function photoUrl(path) {
  if (!path) return null;
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${MINIO_PHOTOS}/${path}`;
}

function CharDetailOverlay({ char, onClose }) {
  const thumb = photoUrl(char.photo_url || char.photo);
  const full  = photoUrl(char.photo_full_url || char.photo_url || char.photo);
  const [fs, setFs] = useState(false);
  const fields = [
    ['Роль', char.role], ['Пол', char.gender === 'другое' ? char.gender_other : char.gender],
    ['Дата рождения', char.birthdate], ['Возраст', char.age],
    ['Статус', char.char_status], ['Локация', char.location],
    ['Черты', char.features],
  ].filter(([, v]) => v);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,12,50,0.82)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1600, backdropFilter:'blur(4px)' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, padding:28, width:520, maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(30,32,96,0.4)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontFamily:'Nunito', color:'#2b2c7f', fontSize:18 }}>{char.name}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#8b9cbd', fontSize:20 }}>✕</button>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          <div onClick={() => full && setFs(true)} style={{ width:110, height:145, borderRadius:12, background:'#f0f2fb', flexShrink:0, overflow:'hidden', cursor: full ? 'zoom-in' : 'default' }}>
            {thumb ? <img src={thumb} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#8b9cbd', fontSize:12, fontFamily:'Nunito' }}>нет фото</div>}
          </div>
          <div style={{ flex:1 }}>
            {char.short_desc && <p style={{ fontFamily:'Nunito', color:'#6b7c9e', fontSize:13, marginBottom:12 }}>{char.short_desc}</p>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px' }}>
              {fields.map(([k, v]) => (
                <div key={k}>
                  <span style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd', display:'block' }}>{k}</span>
                  <span style={{ fontFamily:'Nunito', fontSize:13, color:'#2b2c7f', fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
            {char.personality && <div style={{ marginTop:10 }}><span style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd' }}>Характер</span><p style={{ fontFamily:'Nunito', fontSize:13, color:'#3b3d8a', marginTop:2 }}>{char.personality}</p></div>}
            {char.desc_full   && <div style={{ marginTop:8 }}><span style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd' }}>Описание</span><p style={{ fontFamily:'Nunito', fontSize:13, color:'#3b3d8a', marginTop:2 }}>{char.desc_full}</p></div>}
          </div>
        </div>
      </div>
      {fs && full && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1700, cursor:'zoom-out' }} onClick={() => setFs(false)}>
          <img src={full} alt="" style={{ maxWidth:'88vw', maxHeight:'88vh', objectFit:'contain', borderRadius:8 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function AdminMiniGraph({ graphData, characters }) {
  const svgRef = useRef(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: 680, h: 400 });
  const drag = useRef(null);

  if (!graphData) return <Empty text="Данные графа не загружены" />;
  const { relationships = [], nodes = {} } = graphData;
  if (!Object.keys(nodes).length) return <Empty text="Граф пуст — позиции не заданы" />;

  const cm = {}; characters.forEach(c => { cm[c.id] = c; });
  const ents = Object.entries(nodes);
  const NW = 90, NH = 90, R = 28;

  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    setVb(v => {
      const rect = svgRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width  * v.w + v.x;
      const my = (e.clientY - rect.top)  / rect.height * v.h + v.y;
      const nw = Math.min(Math.max(v.w * factor, 200), 3000);
      const nh = Math.min(Math.max(v.h * factor, 120), 2000);
      return { x: mx - (mx - v.x) * (nw / v.w), y: my - (my - v.y) * (nh / v.h), w: nw, h: nh };
    });
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, vb: { ...vb } };
  }
  function onMouseMove(e) {
    if (!drag.current) return;
    const { sx, sy, vb: ov } = drag.current;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (sx - e.clientX) / rect.width  * ov.w;
    const dy = (sy - e.clientY) / rect.height * ov.h;
    setVb({ ...ov, x: ov.x + dx, y: ov.y + dy });
  }
  function onMouseUp() { drag.current = null; }

  return (
    <div style={{ border:'1px solid #eef0fa', borderRadius:14, overflow:'hidden', background:'linear-gradient(135deg,#f4f6ff,#eef0ff)' }}>
      <div style={{ padding:'6px 14px 5px', background:'rgba(255,255,255,0.7)', borderBottom:'1px solid #eef0fa', fontFamily:'Nunito', fontSize:11, color:'#8b9cbd' }}>
        🖱 Колёсико — масштаб · Перетащите — перемещение
      </div>
      <svg ref={svgRef} width="100%" height={380}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ display:'block', cursor: drag.current ? 'grabbing' : 'grab', userSelect:'none' }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <defs>
          <pattern id="aDots2" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(69,71,181,0.07)" />
          </pattern>
        </defs>
        <rect x={vb.x-5000} y={vb.y-5000} width={vb.w+10000} height={vb.h+10000} fill="url(#aDots2)" />
        {relationships.map((edge, i) => {
          const n1 = nodes[edge.char1_id], n2 = nodes[edge.char2_id];
          if (!n1 || !n2) return null;
          const p1 = { x: n1.x+NW/2, y: n1.y+NH/2 }, p2 = { x: n2.x+NW/2, y: n2.y+NH/2 };
          const dx=p2.x-p1.x, dy=p2.y-p1.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
          const px=-dy/dist, py=dx/dist, dir=i%2===0?1:-1, bend=Math.min(dist*0.15,20)*dir;
          const cx1=p1.x+dx/3+px*bend, cy1=p1.y+dy/3+py*bend;
          const cx2=p2.x-dx/3+px*bend, cy2=p2.y-dy/3+py*bend;
          const mid={ x:(p1.x+p2.x)/2+px*bend*0.6, y:(p1.y+p2.y)/2+py*bend*0.6 };
          const color = RELATION_COLORS[edge.relation_type] || '#aaa';
          return (
            <g key={i}>
              <path d={`M ${p1.x} ${p1.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${p2.x} ${p2.y}`}
                stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.85} />
              <text x={mid.x} y={mid.y-5} textAnchor="middle" fontSize={10} fill={color}
                fontFamily="Nunito" fontWeight="700" opacity={0.9}>{edge.relation_type}</text>
            </g>
          );
        })}
        {ents.map(([cid, pos]) => {
          const char = cm[+cid]; if (!char) return null;
          const cx = pos.x+NW/2, cy = pos.y+NH/2;
          const th = char.photo_url;
          return (
            <g key={cid}>
              <circle cx={cx} cy={cy} r={R+3} fill="rgba(255,255,255,0.9)" stroke="#d0d6f0" strokeWidth={1.5} />
              {th ? (<>
                <defs><clipPath id={`acp-${cid}`}><circle cx={cx} cy={cy} r={R} /></clipPath></defs>
                <image href={th} x={cx-R} y={cy-R} width={R*2} height={R*2}
                  clipPath={`url(#acp-${cid})`} preserveAspectRatio="xMidYMid slice" />
              </>) : (
                <circle cx={cx} cy={cy} r={R} fill="#dde2f5" />
              )}
              <text x={cx} y={cy+R+16} textAnchor="middle" fontSize={11} fill="#2b2c7f"
                fontFamily="Nunito" fontWeight="700">
                {char.name.length > 13 ? char.name.slice(0,12)+'…' : char.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ padding:'6px 14px 8px', display:'flex', gap:12, flexWrap:'wrap', borderTop:'1px solid #eef0fa', background:'rgba(255,255,255,0.6)' }}>
        {Object.entries(RELATION_COLORS).map(([t,c]) => (
          <span key={t} style={{ display:'flex', alignItems:'center', gap:4, fontFamily:'Nunito', fontSize:10, color:'#4b5c8a' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:c, display:'inline-block' }} />{t}
          </span>
        ))}
      </div>
    </div>
  );
}

function AdminBookReader({ chapters, startIndex = 0 }) {
  const [idx, setIdx] = useState(startIndex);
  const [visible, setVisible] = useState(true);
  useEffect(() => { setIdx(startIndex); }, [startIndex]);

  function go(dir) {
    const next = idx + dir;
    if (next < 0 || next >= chapters.length) return;
    setVisible(false);
    setTimeout(() => { setIdx(next); setVisible(true); }, 160);
  }

  if (!chapters.length) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'rgba(255,255,255,0.4)', fontFamily:'Nunito', fontSize:15 }}>Глав нет</div>
  );
  const ch = chapters[idx];
  const progress = chapters.length > 1 ? (idx / (chapters.length - 1)) * 100 : 100;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', gap:6, paddingBottom:14, overflowX:'auto', flexShrink:0 }}>
        {chapters.map((c, i) => (
          <button key={c.id} onClick={() => { setVisible(false); setTimeout(() => { setIdx(i); setVisible(true); }, 160); }}
            style={{ flexShrink:0, padding:'5px 14px', borderRadius:8, border:'none', cursor:'pointer',
              background: i===idx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
              color: i===idx ? '#2b2c7f' : 'rgba(255,255,255,0.7)',
              fontFamily:'Nunito', fontWeight: i===idx ? 700 : 500, fontSize:12, whiteSpace:'nowrap' }}>
            {c.order+1}. {c.title}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', transition:'opacity .16s', opacity: visible ? 1 : 0 }}>
        <div style={{ background:'rgba(255,255,255,0.07)', backdropFilter:'blur(16px)',
          border:'1px solid rgba(255,255,255,0.12)', borderRadius:16,
          padding:'36px 44px', minHeight:280, position:'relative',
          boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }}>
          <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontWeight:700, fontSize:16, color:'rgba(255,255,255,0.9)', marginBottom:20, paddingBottom:14, borderBottom:'1px solid rgba(255,255,255,0.12)' }}>
            Глава {ch.order+1}: {ch.title}
            <span style={{ fontFamily:'Nunito', fontWeight:400, fontSize:12, color:'rgba(255,255,255,0.35)', marginLeft:12 }}>{ch.char_count||0} симв.</span>
          </div>
          {ch.content ? (
            <p style={{ fontFamily:"'Georgia', 'Times New Roman', serif", fontSize:16, color:'rgba(255,255,255,0.85)', lineHeight:1.9, margin:0, whiteSpace:'pre-wrap', textAlign:'justify' }}>
              {ch.content}
            </p>
          ) : (
            <div style={{ color:'rgba(255,255,255,0.3)', fontFamily:'Nunito', fontSize:14, fontStyle:'italic', textAlign:'center', padding:'60px 0' }}>
              Текст недоступен для вашего уровня доступа
            </div>
          )}
          <div style={{ position:'absolute', bottom:14, right:20, fontFamily:'Nunito', fontSize:12, color:'rgba(255,255,255,0.25)' }}>{idx+1} / {chapters.length}</div>
        </div>
      </div>

      <div style={{ paddingTop:14, flexShrink:0 }}>
        <div style={{ width:'100%', height:2, background:'rgba(255,255,255,0.1)', borderRadius:2, marginBottom:14 }}>
          <div style={{ height:'100%', borderRadius:2, background:'rgba(255,255,255,0.45)', width:`${progress}%`, transition:'width .3s ease' }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <button onClick={() => go(-1)} disabled={idx===0} style={{ padding:'8px 22px', borderRadius:10,
            border:'1px solid rgba(255,255,255,0.15)',
            cursor:idx===0?'default':'pointer',
            background:idx===0?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.12)',
            color:idx===0?'rgba(255,255,255,0.2)':'#fff',
            fontFamily:'Nunito', fontWeight:700, fontSize:14, transition:'all .15s' }}>Предыдущая</button>
          <button onClick={() => go(1)} disabled={idx===chapters.length-1} style={{ padding:'8px 22px', borderRadius:10,
            border:'1px solid rgba(255,255,255,0.15)',
            cursor:idx===chapters.length-1?'default':'pointer',
            background:idx===chapters.length-1?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.12)',
            color:idx===chapters.length-1?'rgba(255,255,255,0.2)':'#fff',
            fontFamily:'Nunito', fontWeight:700, fontSize:14, transition:'all .15s' }}>Следующая</button>
        </div>
      </div>
    </div>
  );
}

function FullscreenReader({ chapters, startIndex, onClose }) {
  const [bgError, setBgError] = useState(false);
  const bg = bgError
    ? 'linear-gradient(135deg, #0e1033 0%, #1a1d5c 50%, #0e1033 100%)'
    : 'url(http://localhost:9000/app-backgrounds/bg10.jpg) center/cover no-repeat fixed';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:2000, background: bg, display:'flex', flexDirection:'column' }}>
      <img src="http://localhost:9000/app-backgrounds/bg10.jpg" style={{ display:'none' }} onError={() => setBgError(true)} alt="" />
      <div style={{ position:'absolute', inset:0, background:'rgba(8,10,40,0.65)', backdropFilter:'blur(3px)' }} />
      <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', height:'100%' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 32px', background:'rgba(255,255,255,0.06)',
          borderBottom:'1px solid rgba(255,255,255,0.1)', backdropFilter:'blur(12px)', flexShrink:0 }}>
          <div style={{ fontFamily:'Nunito', fontWeight:800, fontSize:16, color:'#fff' }}>Читалка</div>
          <button onClick={onClose} style={{ padding:'7px 18px', borderRadius:10,
            background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)',
            color:'rgba(255,255,255,0.8)', fontFamily:'Nunito', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            Закрыть
          </button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'28px max(28px, calc(50vw - 400px))' }}>
          <AdminBookReader chapters={chapters} startIndex={startIndex} />
        </div>
      </div>
    </div>
  );
}

function ProjectDetailModal({ project, role, onClose, onDelete }) {
  const [tab, setTab] = useState('characters');
  const [characters, setCharacters] = useState([]);
  const [chapters, setChapters]     = useState([]);
  const [graph, setGraph]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [charDetail, setCharDetail] = useState(null);
  const [fullscreenIdx, setFullscreenIdx] = useState(null);

  useEffect(() => { loadTab(tab); }, [tab]);

  async function loadTab(t) {
    setLoading(true);
    try {
      if (t === 'characters') {
        setCharacters(await apiGet(`${ADMIN}/api/admin/projects/${project.id}/characters`) || []);
      } else if (t === 'graph') {
        const [g, chars] = await Promise.all([
          apiGet(`${ADMIN}/api/admin/projects/${project.id}/graph`),
          characters.length ? Promise.resolve(characters)
            : apiGet(`${ADMIN}/api/admin/projects/${project.id}/characters`).then(r => r || []),
        ]);
        setGraph(g);
        if (!characters.length) setCharacters(chars);
      } else if (t === 'chapters') {
        const url = role === 'superadmin'
          ? `${ADMIN}/api/admin/projects/${project.id}/chapters?include_content=true`
          : `${ADMIN}/api/admin/projects/${project.id}/chapters`;
        setChapters(await apiGet(url) || []);
      }
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }

  const tabs = [
    { id: 'characters', label: 'Персонажи' },
    { id: 'graph',      label: 'Граф отношений' },
    { id: 'chapters',   label: 'Читалка' },
    ...(project.is_deleted && project.deleted_reason ? [{ id: 'reason', label: '⚠ Причина' }] : []),
  ];

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }} onClick={onClose}>
        <div style={{
          background: '#fff', borderRadius: 20, width: '92vw', maxWidth: 800,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(20,22,80,0.4)', overflow: 'hidden',
        }} onClick={e => e.stopPropagation()}>

          <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #eef0fa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 20, color: '#2b2c7f', display:'flex', alignItems:'center', gap:8 }}>
                  {project.is_deleted && <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:'50%', background:'#e53e3e', color:'#fff', fontSize:13, fontWeight:900 }}>!</span>}
                  <span style={project.is_deleted ? { textDecoration:'line-through', color:'#8b9cbd' } : {}}>{project.title}</span>
                </div>
                <div style={{ fontFamily: 'Nunito', fontSize: 12, color: '#8b9cbd', marginTop: 3 }}>
                  {project.genre ? `${project.genre} · ` : ''}{project.status}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!project.is_deleted && (
                  <button onClick={() => { onClose(); onDelete(project); }} style={{
                    padding: '8px 16px', borderRadius: 10, border: 'none',
                    background: '#fef2f2', color: '#c0392b',
                    fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}>🗑 Удалить</button>
                )}
                <button onClick={onClose} style={{
                  padding: '8px 14px', borderRadius: 10, border: '1.5px solid #e8ecf8',
                  background: 'none', color: '#8b9cbd',
                  fontFamily: 'Nunito', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '8px 18px', border: 'none', cursor: 'pointer',
                  borderBottom: tab === t.id ? '2px solid #2b2c7f' : '2px solid transparent',
                  background: 'none', fontFamily: 'Nunito', fontSize: 13,
                  fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? '#2b2c7f' : (t.id==='reason' ? '#e53e3e' : '#8b9cbd'),
                  transition: 'color .15s',
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8b9cbd', fontFamily: 'Nunito' }}>Загрузка...</div>
            ) : (
              <>
                {tab === 'characters' && (
                  characters.length === 0 ? <Empty text="Персонажей нет" /> : (
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                      {characters.map(c => {
                        const thumb = photoUrl(c.photo_url || c.photo);
                        return (
                          <div key={c.id} onClick={() => setCharDetail(c)} style={{
                            width:120, flexShrink:0, background:'#f4f6ff',
                            border:'1px solid #e0e4f8', borderRadius:14,
                            padding:'12px 10px', cursor:'pointer', textAlign:'center',
                            transition:'background .15s, transform .15s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.background='#e8ecff'; e.currentTarget.style.transform='translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background='#f4f6ff'; e.currentTarget.style.transform='none'; }}
                          >
                            <div style={{ width:80, height:80, borderRadius:10, margin:'0 auto 8px', overflow:'hidden', background:'#dde2f5', border:'1.5px solid #d0d6f0' }}>
                              {thumb
                                ? <img src={thumb} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', fontSize:22, opacity:0.4 }}>👤</div>}
                            </div>
                            <div style={{ fontFamily:'Nunito', fontWeight:700, color:'#2b2c7f', fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                            {c.role && <div style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd', marginTop:2 }}>{c.role}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {tab === 'graph' && (
                  <AdminMiniGraph graphData={graph} characters={characters.length ? characters : []} />
                )}

                {tab === 'chapters' && (
                  chapters.length === 0 ? <Empty text="Глав нет" /> : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ fontFamily:'Nunito', fontSize:12, color:'#8b9cbd', marginBottom:4 }}>
                        {role === 'superadmin'
                          ? 'Нажмите на главу, чтобы открыть читалку'
                          : 'Список глав · текст доступен только суперадмину'}
                      </div>
                      {chapters.map((ch, i) => (
                        <div key={ch.id}
                          onClick={() => role === 'superadmin' ? setFullscreenIdx(i) : undefined}
                          style={{
                            display:'flex', alignItems:'center', gap:12,
                            padding:'12px 16px', borderRadius:12,
                            border:'1.5px solid #eef0fa', background:'#f8f9ff',
                            cursor: role === 'superadmin' ? 'pointer' : 'default',
                            transition:'background .15s',
                          }}
                          onMouseEnter={e => { if (role === 'superadmin') e.currentTarget.style.background = '#eef0ff'; }}
                          onMouseLeave={e => e.currentTarget.style.background = '#f8f9ff'}
                        >
                          <div style={{ width:32, height:32, borderRadius:8, background:'#2b2c7f', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontFamily:'Nunito', fontWeight:800, fontSize:13, color:'#fff' }}>{ch.order+1}</span>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:'Nunito', fontWeight:700, fontSize:14, color:'#2b2c7f', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {ch.title}
                            </div>
                            <div style={{ fontFamily:'Nunito', fontSize:11, color:'#8b9cbd' }}>{ch.char_count||0} символов</div>
                          </div>
                          {role === 'superadmin' && (
                            <span style={{ fontFamily:'Nunito', fontSize:12, color:'#8b9cbd', flexShrink:0 }}>Открыть →</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {tab === 'reason' && (
                  <div>
                    <div style={{ fontFamily:'Nunito', fontSize:13, color:'#8b9cbd', marginBottom:12 }}>
                      Проект помечен как удалённый{project.deleted_by_email ? ` администратором ${project.deleted_by_email}` : ''}{project.deleted_at ? ` · ${new Date(project.deleted_at).toLocaleDateString('ru-RU')}` : ''}
                    </div>
                    <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'18px 20px' }}>
                      <div style={{ fontFamily:'Nunito', fontWeight:700, fontSize:13, color:'#991b1b', marginBottom:8 }}>Причина удаления:</div>
                      <p style={{ fontFamily:'Nunito', fontSize:14, color:'#7f1d1d', lineHeight:1.7, margin:0 }}>{project.deleted_reason}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {charDetail && <CharDetailOverlay char={charDetail} onClose={() => setCharDetail(null)} />}
      {fullscreenIdx !== null && (
        <FullscreenReader chapters={chapters} startIndex={fullscreenIdx} onClose={() => setFullscreenIdx(null)} />
      )}
    </>
  );
}

function Empty({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#b0bcd4', fontFamily: 'Nunito', fontSize: 14 }}>
      {text}
    </div>
  );
}

function ConfirmModal({ title, text, confirmLabel = 'Удалить', danger = true, onClose, onConfirm }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32, width: 340,
        boxShadow: '0 20px 60px rgba(30,32,96,0.25)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Nunito', color: '#2b2c7f', fontSize: 18, marginBottom: 8 }}>{title}</h3>
        <p style={{ fontFamily: 'Nunito', color: '#8b9cbd', fontSize: 14, marginBottom: 24 }}>{text}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid #d8dff0',
            background: 'transparent', color: '#6b7c9e',
            fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Отмена</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: 11, borderRadius: 12, border: 'none',
            background: danger ? '#c0392b' : '#2b2c7f', color: '#fff',
            fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function AddAdminModal({ onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [role,  setRole]  = useState('admin');

  async function submit() {
    if (!email.trim()) { notifications.warning('Введите email', 'Внимание'); return; }
    try {
      await apiPost(`${ADMIN}/api/admin/management/admins`, { email: email.trim(), role });
      notifications.success(`${email} назначен ${role}`);
      onDone(); onClose();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32, width: 380,
        boxShadow: '0 20px 60px rgba(30,32,96,0.25)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Nunito', color: '#2b2c7f', fontSize: 18, marginBottom: 20 }}>Добавить администратора</h3>
        <label style={{ fontFamily: 'Nunito', fontSize: 13, color: '#6b7c9e', display: 'block', marginBottom: 5 }}>Email пользователя</label>
        <input value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="user@example.com" autoFocus
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid #d8dff0', fontSize: 14, fontFamily: 'Nunito',
            outline: 'none', marginBottom: 14, boxSizing: 'border-box',
          }} />
        <label style={{ fontFamily: 'Nunito', fontSize: 13, color: '#6b7c9e', display: 'block', marginBottom: 5 }}>Роль</label>
        <select value={role} onChange={e => setRole(e.target.value)} style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          border: '1.5px solid #d8dff0', fontSize: 14, fontFamily: 'Nunito',
          outline: 'none', marginBottom: 20, background: '#fff', boxSizing: 'border-box',
        }}>
          <option value="admin">Администратор</option>
          <option value="superadmin">Суперадмин</option>
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid #d8dff0',
            background: 'transparent', color: '#6b7c9e',
            fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Отмена</button>
          <button onClick={submit} style={{
            flex: 1, padding: 11, borderRadius: 12, border: 'none',
            background: '#2b2c7f', color: '#fff',
            fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>Назначить</button>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'rgba(255,255,255,0.12)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 16,
  overflow: 'hidden',
  marginBottom: 16,
};

const thStyle = {
  padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: .5,
  background: 'rgba(0,0,0,0.12)', fontFamily: 'Nunito',
};

const tdStyle = {
  padding: '13px 16px', fontSize: 13, color: '#fff',
  borderBottom: '1px solid rgba(255,255,255,0.07)', fontFamily: 'Nunito',
  verticalAlign: 'middle',
};

function Pill({ children, color = 'rgba(255,255,255,0.15)' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      background: color, fontSize: 11, color: '#fff',
      fontFamily: 'Nunito', fontWeight: 600,
    }}>{children}</span>
  );
}

function StatusDot({ active }) {
  return <span style={{
    display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
    background: active ? '#4ade80' : '#f87171', marginRight: 6, flexShrink: 0,
  }} />;
}

function RolePill({ role }) {
  const cfg = {
    user:       { bg: 'rgba(255,255,255,0.12)' },
    admin:      { bg: 'rgba(59,130,246,0.35)' },
    superadmin: { bg: 'rgba(139,92,246,0.4)' },
  };
  return <Pill color={(cfg[role] || cfg.user).bg}>{role}</Pill>;
}

function SearchBar({ value, onChange, placeholder = 'Поиск...' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.25)', borderRadius: 12,
      padding: '10px 16px', minWidth: 240,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontFamily: 'Nunito', fontSize: 14, flex: 1 }} />
      <style>{`input::placeholder{color:rgba(255,255,255,0.5)!important}`}</style>
    </div>
  );
}

function ProjectsTab({ role }) {
  const [projects, setProjects] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [userMap,  setUserMap]  = useState({}); // id → { email, full_name }
  const PER = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page, size: PER });
      if (search) p.set('search', search);
      const [data, users] = await Promise.all([
        apiGet(`${ADMIN}/api/admin/projects?${p}`),
        apiGet(`${ADMIN}/api/admin/users`).catch(() => []),
      ]);
      setProjects(data?.items || []);
      setTotal(data?.total || 0);
      const map = {};
      (users || []).forEach(u => { map[u.id] = { email: u.email, full_name: u.full_name }; });
      setUserMap(map);
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PER);

  function ownerLabel(ownerId) {
    const u = userMap[ownerId];
    if (!u) return `#${ownerId}`;
    return u.full_name || u.email;
  }

  async function doRestore(project) {
    try {
      await apiPost(`${ADMIN}/api/admin/projects/${project.id}/restore`, {});
      notifications.success(`Проект «${project.title}» восстановлен`);
      load();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="поиск по названию" />
        <button onClick={load} style={{
          padding: '10px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.12)', color: '#fff',
          fontFamily: 'Nunito', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>↻ Обновить</button>
        <div style={{ marginLeft: 'auto', fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          {total} проектов всего
        </div>
      </div>

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Название', 'Автор', 'Жанр', 'Статус', 'Глав', 'Создан', ''].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', opacity: .5 }}>Загрузка...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', opacity: .4 }}>Проектов нет</td></tr>
            ) : projects.map(p => (
              <tr key={p.id}
                onMouseEnter={e => e.currentTarget.style.background = p.is_deleted ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = p.is_deleted ? 'rgba(239,68,68,0.05)' : 'none'}
                style={{ background: p.is_deleted ? 'rgba(239,68,68,0.05)' : 'none' }}>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.is_deleted && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: '50%', background: '#e53e3e',
                        color: '#fff', fontSize: 11, fontWeight: 900, flexShrink: 0,
                      }}>!</span>
                    )}
                    <span style={{
                      fontWeight: 700,
                      textDecoration: p.is_deleted ? 'line-through' : 'none',
                      color: p.is_deleted ? 'rgba(255,255,255,0.45)' : '#fff',
                    }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize: 11, opacity: .5 }}>#{p.id}</div>
                </td>
                <td style={{ ...tdStyle, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{ownerLabel(p.owner_id)}</td>
                <td style={tdStyle}>{p.genre ? <Pill>{p.genre}</Pill> : '—'}</td>
                <td style={tdStyle}>
                  {p.is_deleted
                    ? <Pill color="rgba(239,68,68,0.35)">удалён</Pill>
                    : <Pill>{p.status}</Pill>}
                </td>
                <td style={tdStyle}>{p.chapter_count}</td>
                <td style={tdStyle}>{p.created_at?.slice(0, 10)}</td>
                <td style={{ ...tdStyle, borderBottom: 'none' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelected(p)} style={{
                      padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)', color: '#fff',
                      fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>Просмотр</button>
                    {p.is_deleted ? (
                      <button onClick={() => doRestore(p)} style={{
                        padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)',
                        background: 'rgba(34,197,94,0.15)', color: '#86efac',
                        fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Вернуть</button>
                    ) : (
                      <button onClick={() => setDeleteModal({ ...p, ownerLabel: ownerLabel(p.owner_id) })} style={{
                        padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                        background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                        fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Удалить</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              width: 36, height: 36, borderRadius: 10,
              background: p === page ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: p === page ? '#2b2c7f' : '#fff',
              fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      )}

      {selected && (
        <ProjectDetailModal project={selected} role={role}
          onClose={() => setSelected(null)}
          onDelete={p => { setSelected(null); setDeleteModal({ ...p, ownerLabel: ownerLabel(p.owner_id) }); }} />
      )}
      {deleteModal && (
        <DeleteReasonModal
          project={deleteModal}
          onClose={() => setDeleteModal(null)}
          onDone={() => { setDeleteModal(null); load(); }}
        />
      )}
    </>
  );
}

function UsersTab({ myRole }) {
  const [users,    setUsers]   = useState([]);
  const [search,   setSearch]  = useState('');
  const [loading,  setLoading] = useState(false);
  const [confirm,  setConfirm] = useState(null);
  const [banModal,  setBanModal] = useState(null);
  const [page,     setPage]    = useState(1);
  const PER = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = search ? `?search=${encodeURIComponent(search)}` : '';
      setUsers(await apiGet(`${ADMIN}/api/admin/users${p}`) || []);
      setPage(1);
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, []);

  async function doAction() {
    const { user, action, reason } = confirm;
    try {
      await apiPost(`${ADMIN}/api/admin/users/${user.id}/${action}`, { reason: reason || '' });
      notifications.success(action === 'ban' ? `${user.email} заблокирован` : `${user.email} разблокирован`);
      setConfirm(null); load();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
  }

  const visible = users.slice((page - 1) * PER, page * PER);
  const totalPages = Math.ceil(users.length / PER);



  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="поиск по email" />
        <button onClick={load} style={{
          padding: '10px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.12)', color: '#fff',
          fontFamily: 'Nunito', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>↻ Обновить</button>
        <div style={{ marginLeft: 'auto', fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          {users.length} пользователей
        </div>
      </div>

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['ID', 'Email', 'Имя', 'Роль', 'Статус', 'Удал. проектов', 'Регистрация', ''].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', opacity: .5 }}>Загрузка...</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', opacity: .4 }}>Пользователей нет</td></tr>
            ) : visible.map(u => (
              <tr key={u.id}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <td style={{ ...tdStyle, opacity: .5 }}>#{u.id}</td>
                <td style={tdStyle}>{u.email}</td>
                <td style={tdStyle}>{u.full_name || '—'}</td>
                <td style={tdStyle}><RolePill role={u.role} /></td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <StatusDot active={u.is_active} />
                    {u.is_active ? 'Активен' : 'Заблокирован'}
                  </div>
                </td>
                <td style={{ ...tdStyle, color: u.deleted_projects_count > 0 ? '#fca5a5' : undefined }}>
                  {u.deleted_projects_count}
                </td>
                <td style={tdStyle}>{u.created_at?.slice(0, 10)}</td>
                <td style={{ ...tdStyle, borderBottom: 'none' }}>
                  {myRole === 'superadmin' && (
                    u.is_active
                      ? <button onClick={() => setBanModal(u)} style={{
                          padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                          background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                          fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>Заблокировать</button>
                      : <button onClick={() => setConfirm({ user: u, action: 'unban' })} style={{
                          padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)',
                          background: 'rgba(34,197,94,0.15)', color: '#86efac',
                          fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>Разблокировать</button>
                  )}
                  {myRole !== 'superadmin' && (
                    <span style={{ fontSize: 12, opacity: .35, fontFamily: 'Nunito' }}>только просмотр</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              width: 36, height: 36, borderRadius: 10,
              background: p === page ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: p === page ? '#2b2c7f' : '#fff',
              fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      )}

      {banModal && (
        <BanReasonModal
          user={banModal}
          onClose={() => setBanModal(null)}
          onDone={() => { setBanModal(null); load(); }}
        />
      )}
      {confirm && (
        <ConfirmModal
          title="Разблокировать пользователя?"
          text={`${confirm.user.email} снова получит доступ к платформе.`}
          confirmLabel="Разблокировать"
          danger={false}
          onClose={() => setConfirm(null)}
          onConfirm={doAction} />
      )}
    </>
  );
}

function ManagementTab() {
  const [admins,   setAdmins]  = useState([]);
  const [loading,  setLoading] = useState(false);
  const [showAdd,  setShowAdd] = useState(false);
  const [confirm,  setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAdmins(await apiGet(`${ADMIN}/api/admin/management/admins`) || []); }
    catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function promote(u) {
    try {
      await apiPost(`${ADMIN}/api/admin/management/admins/${u.id}/promote`, {});
      notifications.success(`${u.email} теперь суперадмин`);
      setConfirm(null); load();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
  }

  async function removeAdmin(u) {
    try {
      await apiDelete(`${ADMIN}/api/admin/management/admins/${u.id}`);
      notifications.success(`${u.email} лишён прав`);
      setConfirm(null); load();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button onClick={() => setShowAdd(true)} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 20px', borderRadius: 12, border: 'none',
          background: 'rgba(255,255,255,0.92)', color: '#2b2c7f',
          fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(43,44,127,0.2)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          добавить администратора
        </button>
        <div style={{ fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          {admins.length} администраторов
        </div>
      </div>

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Email', 'Роль', 'Статус', 'Добавлен', ''].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', opacity: .5 }}>Загрузка...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', opacity: .4 }}>Нет администраторов</td></tr>
            ) : admins.map(a => (
              <tr key={a.id}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <td style={tdStyle}>{a.email}</td>
                <td style={tdStyle}><RolePill role={a.role} /></td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <StatusDot active={a.is_active} />{a.is_active ? 'Активен' : 'Заблокирован'}
                  </div>
                </td>
                <td style={tdStyle}>{a.created_at?.slice(0, 10)}</td>
                <td style={{ ...tdStyle, borderBottom: 'none' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {a.role === 'admin' && (
                      <button onClick={() => setConfirm({ type: 'promote', user: a })} style={{
                        padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)',
                        background: 'rgba(139,92,246,0.15)', color: '#c4b5fd',
                        fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>↑ Суперадмин</button>
                    )}
                    <button onClick={() => setConfirm({ type: 'remove', user: a })} style={{
                      padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                      fontFamily: 'Nunito', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>Снять права</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddAdminModal onClose={() => setShowAdd(false)} onDone={load} />}
      {confirm?.type === 'promote' && (
        <ConfirmModal
          title="Повысить до суперадмина?"
          text={`${confirm.user.email} получит полный доступ к панели.`}
          confirmLabel="Повысить" danger={false}
          onClose={() => setConfirm(null)}
          onConfirm={() => promote(confirm.user)} />
      )}
      {confirm?.type === 'remove' && (
        <ConfirmModal
          title="Снять права администратора?"
          text={`${confirm.user.email} станет обычным пользователем.`}
          confirmLabel="Снять права"
          onClose={() => setConfirm(null)}
          onConfirm={() => removeAdmin(confirm.user)} />
      )}
    </>
  );
}


function DeleteReasonModal({ project, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');

  // Try to get owner email from users list
  useEffect(() => {
    apiGet(`${ADMIN}/api/admin/users`)
      .then(users => {
        const u = (users || []).find(u => u.id === project.owner_id);
        if (u) setOwnerEmail(u.email);
      }).catch(() => {});
  }, [project.owner_id]);

  async function submit() {
    if (reason.trim().length < 5) return;
    setLoading(true);
    try {
      await apiPost(`${ADMIN}/api/admin/projects/${project.id}/soft-delete`, {
        reason: reason.trim(),
        owner_email: ownerEmail,
      });
      // Log
      notifications.success(`Проект «${project.title}» помечен как удалённый`);
      onDone();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '28px 32px', width: 420,
        boxShadow: '0 20px 60px rgba(30,32,96,0.3)', fontFamily: 'Nunito',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px', color: '#2b2c7f', fontSize: 17, fontWeight: 800 }}>
          Пометить проект как удалённый
        </h3>
        <p style={{ margin: '0 0 16px', color: '#8b9cbd', fontSize: 13 }}>
          «{project.title}»{project.ownerLabel ? ` · автор: ${project.ownerLabel}` : ''}
        </p>
        <label style={{ fontSize: 13, color: '#6b7c9e', display: 'block', marginBottom: 6 }}>
          Причина удаления <span style={{ color: '#e53e3e' }}>*</span>
        </label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder="Опишите причину — пользователь получит её на email..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid #d8dff0', fontSize: 13, fontFamily: 'Nunito',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            color: '#2b2c7f', marginBottom: 16,
          }} />
        {ownerEmail && (
          <p style={{ fontSize: 12, color: '#8b9cbd', marginBottom: 16 }}>
            📧 Уведомление будет отправлено на: <strong>{ownerEmail}</strong>
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid #d8dff0',
            background: '#fff', color: '#6b7c9e',
            fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Отмена</button>
          <button onClick={submit} disabled={loading || reason.trim().length < 5} style={{
            flex: 2, padding: 11, borderRadius: 12, border: 'none',
            background: reason.trim().length >= 5 ? '#c0392b' : '#e2b8b8',
            color: '#fff', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
            cursor: reason.trim().length >= 5 ? 'pointer' : 'default',
          }}>
            {loading ? 'Сохранение...' : 'Пометить и отправить уведомление'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BanReasonModal({ user, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (reason.trim().length < 5) return;
    setLoading(true);
    try {
      await apiPost(`${ADMIN}/api/admin/users/${user.id}/ban`, { reason: reason.trim() });
      notifications.success(`${user.email} заблокирован`);
      onDone();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '28px 32px', width: 420,
        boxShadow: '0 20px 60px rgba(30,32,96,0.3)', fontFamily: 'Nunito',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px', color: '#2b2c7f', fontSize: 17, fontWeight: 800 }}>
          Заблокировать пользователя
        </h3>
        <p style={{ margin: '0 0 16px', color: '#8b9cbd', fontSize: 13 }}>
          {user.email}
        </p>
        <label style={{ fontSize: 13, color: '#6b7c9e', display: 'block', marginBottom: 6 }}>
          Причина блокировки <span style={{ color: '#e53e3e' }}>*</span>
        </label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder="Опишите причину — пользователь получит её на email..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid #d8dff0', fontSize: 13, fontFamily: 'Nunito',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            color: '#2b2c7f', marginBottom: 6,
          }} />
        <p style={{ fontSize: 12, color: '#8b9cbd', marginBottom: 16 }}>
          📧 Уведомление будет отправлено на: <strong>{user.email}</strong>
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid #d8dff0',
            background: '#fff', color: '#6b7c9e',
            fontFamily: 'Nunito', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>Отмена</button>
          <button onClick={submit} disabled={loading || reason.trim().length < 5} style={{
            flex: 2, padding: 11, borderRadius: 12, border: 'none',
            background: reason.trim().length >= 5 ? '#c0392b' : '#e2b8b8',
            color: '#fff', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14,
            cursor: reason.trim().length >= 5 ? 'pointer' : 'default',
          }}>
            {loading ? 'Блокировка...' : 'Заблокировать и отправить уведомление'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppealsTab() {
  const [appeals, setAppeals] = useState([]);
  const [filter, setFilter]   = useState('pending');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAppeals(await apiGet(`${ADMIN}/api/admin/appeals?status=${filter}`) || []);
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const [reviewModal, setReviewModal] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  async function submitReview() {
    if (!reviewModal) return;
    setReviewing(true);
    try {
      await apiPost(`${ADMIN}/api/admin/appeals/${reviewModal.appeal.id}/review`, {
        resolution: reviewModal.resolution,
        admin_comment: reviewComment.trim() || null,
      });
      notifications.success(
        reviewModal.resolution === 'accepted' ? 'Апелляция принята, проект восстановлен' : 'Апелляция отклонена'
      );
      setReviewModal(null);
      setReviewComment('');
      load();
    } catch (e) { notifications.error(e.message, 'Ошибка'); }
    setReviewing(false);
  }

  function statusBadge(a) {
    if (a.status === 'pending')  return { label: 'Ожидает', bg: 'rgba(251,191,36,0.25)', color: '#fbbf24' };
    if (a.status === 'accepted') return { label: '✓ Принята', bg: 'rgba(34,197,94,0.2)', color: '#86efac' };
    if (a.status === 'rejected') return { label: '✕ Отклонена', bg: 'rgba(239,68,68,0.2)', color: '#fca5a5' };
    return { label: a.status, bg: 'rgba(255,255,255,0.1)', color: '#fff' };
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { id: 'pending',  label: '⏳ Ожидают' },
          { id: 'accepted', label: '✓ Принятые' },
          { id: 'rejected', label: '✕ Отклонённые' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.2)',
            background: filter === f.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)',
            color: filter === f.id ? '#2b2c7f' : '#fff',
            fontFamily: 'Nunito', fontWeight: filter === f.id ? 700 : 500, fontSize: 13,
          }}>{f.label}</button>
        ))}
        <button onClick={load} style={{
          padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Nunito', fontSize: 13, cursor: 'pointer',
        }}>↻</button>
        <div style={{ marginLeft: 'auto', fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: '36px' }}>
          {appeals.length} апелляций
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontFamily: 'Nunito' }}>Загрузка...</div>
      ) : appeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)', fontFamily: 'Nunito', fontSize: 14 }}>
          {filter === 'pending' ? 'Новых апелляций нет' : 'Апелляций нет'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {appeals.map(a => {
            const badge = statusBadge(a);
            return (
              <div key={a.id} style={{
                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: '18px 22px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'Nunito', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 2 }}>
                      «{a.project_title}»
                    </div>
                    <div style={{ fontFamily: 'Nunito', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      {a.owner_name ? `${a.owner_name} · ` : ''}{a.owner_email} · {a.created_at?.slice(0, 10)}
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontFamily: 'Nunito', fontWeight: 700,
                    background: badge.bg, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{badge.label}</span>
                </div>

                <div style={{
                  background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 10,
                  fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6,
                }}>{a.message}</div>

                {a.admin_comment && (
                  <div style={{
                    background: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 14px', marginBottom: 10,
                    fontFamily: 'Nunito', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
                    borderLeft: '3px solid rgba(255,255,255,0.2)',
                  }}>
                    <span style={{ opacity: 0.7 }}>Комментарий администратора:</span> {a.admin_comment}
                  </div>
                )}

                {a.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setReviewModal({ appeal: a, resolution: 'accepted' }); setReviewComment(''); }} style={{
                      padding: '7px 16px', borderRadius: 9, border: '1px solid rgba(34,197,94,0.35)',
                      background: 'rgba(34,197,94,0.15)', color: '#86efac',
                      fontFamily: 'Nunito', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}>✓ Принять (восстановить)</button>
                    <button onClick={() => { setReviewModal({ appeal: a, resolution: 'rejected' }); setReviewComment(''); }} style={{
                      padding: '7px 16px', borderRadius: 9, border: '1px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
                      fontFamily: 'Nunito', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}>✕ Отклонить</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,50,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(4px)' }}
          onClick={() => setReviewModal(null)}>
          <div style={{ background: 'rgba(25,27,80,0.97)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 18, padding: 28, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'Nunito', fontWeight: 700, fontSize: 17, color: '#fff', marginBottom: 6 }}>
              {reviewModal.resolution === 'accepted' ? '✓ Принять апелляцию' : '✕ Отклонить апелляцию'}
            </div>
            <div style={{ fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 18 }}>
              «{reviewModal.appeal.project_title}» · {reviewModal.appeal.owner_name || reviewModal.appeal.owner_email}
            </div>
            <label style={{ fontFamily: 'Nunito', fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>
              Комментарий для пользователя (необязательно)
            </label>
            <textarea
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              rows={3}
              placeholder="Укажите причину решения..."
              style={{
                width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10, padding: '10px 14px', color: '#fff', fontFamily: 'Nunito', fontSize: 13,
                resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 18,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewModal(null)} style={{
                padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)',
                background: 'none', color: 'rgba(255,255,255,0.6)', fontFamily: 'Nunito', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>Отмена</button>
              <button onClick={submitReview} disabled={reviewing} style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: reviewModal.resolution === 'accepted' ? '#22c55e' : '#ef4444',
                color: '#fff', fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: reviewing ? 0.6 : 1,
              }}>
                {reviewing ? 'Отправка...' : reviewModal.resolution === 'accepted' ? 'Подтвердить принятие' : 'Подтвердить отклонение'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  const [tab,    setTab]    = useState('projects');
  const [myRole, setMyRole] = useState(null);
  const [bgErr,  setBgErr]  = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { window.location.href = AUTH + '/'; return; }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const role = payload.role;
      if (!role || role === 'user') {
        notifications.error('Доступ запрещён', 'Ошибка');
        window.location.href = 'http://localhost:8011/catalog';
        return;
      }
      setMyRole(role);
    } catch { window.location.href = AUTH + '/'; }
  }, []);

  useEffect(() => {
    if (!myRole) return;
    const checkSession = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const r = await fetch(`${AUTH}/api/auth/me?token=${token}`);
        if (r.status === 401 || r.status === 403) {
          notifications.error('Ваша сессия завершена', 'Выход');
          removeToken();
          setTimeout(() => { window.location.href = AUTH + '/'; }, 1500);
        } else if (r.ok) {
          const data = await r.json();
          if (data.role === 'user') {
            notifications.error('Права администратора сняты', 'Выход');
            removeToken();
            setTimeout(() => { window.location.href = `http://localhost:8011/catalog`; }, 1500);
          }
        }
      } catch
    };
    const interval = setInterval(checkSession, 30_000);
    return () => clearInterval(interval);
  }, [myRole]);

  if (!myRole) return null;

  const navItems = [
    { id: 'projects',   label: 'Проекты',      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
    { id: 'appeals',    label: 'Апелляции',     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { id: 'users',      label: 'Пользователи', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    ...(myRole === 'superadmin' ? [{ id: 'management', label: 'Управление', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> }] : []),
  ];

  const bgStyle = bgErr
    ? 'linear-gradient(135deg, #e8eaf8 0%, #c5c8e8 30%, #6b6fb5 65%, #3b3d8a 100%)'
    : `url(${MINIO_BG}) center/cover no-repeat fixed`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }
      `}</style>

      <img src={MINIO_BG} onError={() => setBgErr(true)} style={{ display: 'none' }} alt="" />

      <div style={{ minHeight: '100vh', display: 'flex', background: bgStyle }}>

        <div style={{
          width: 260, flexShrink: 0, padding: '40px 28px',
          background: 'rgba(20,22,80,0.45)', backdropFilter: 'blur(16px)',
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.1)', minHeight: '100vh',
        }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontFamily: 'Playfair Display', fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
              WRITERS<br />PLATFORM
            </div>
            <div style={{ fontFamily: 'Nunito', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              {myRole === 'superadmin' ? 'суперадмин' : 'администратор'}
            </div>
          </div>

          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: tab === item.id ? 'rgba(255,255,255,0.18)' : 'none',
                color: tab === item.id ? '#fff' : 'rgba(255,255,255,0.6)',
                fontFamily: 'Nunito', fontSize: 14,
                fontWeight: tab === item.id ? 700 : 500,
                transition: 'background .15s, color .15s', textAlign: 'left',
              }}
                onMouseEnter={e => { if (tab !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={e => { if (tab !== item.id) e.currentTarget.style.background = 'none'; }}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </nav>

          <button onClick={() => { removeToken(); window.location.href = AUTH + '/'; }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12,
            color: 'rgba(255,255,255,0.6)', fontFamily: 'Nunito', fontSize: 13,
            cursor: 'pointer', transition: 'color .15s, border-color .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            выйти
          </button>
        </div>

        <div style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'Playfair Display', fontSize: 28, fontWeight: 900, color: '#fff' }}>
              { tab === 'projects' ? 'Проекты' : tab === 'users' ? 'Пользователи' : tab === 'appeals' ? 'Апелляции' : 'Управление' }
            </div>
            <div style={{ fontFamily: 'Nunito', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
              { tab === 'projects' ? 'Все проекты пользователей платформы'
              : tab === 'users'    ? 'Управление аккаунтами и блокировками'
              : tab === 'appeals'  ? 'Оспаривания решений об удалении проектов'
              :                      'Администраторы и права доступа' }
            </div>
          </div>

          {tab === 'projects'   && <ProjectsTab role={myRole} />}
          {tab === 'users'      && <UsersTab myRole={myRole} />}
        {tab === 'appeals'    && <AppealsTab />}
          {tab === 'management' && myRole === 'superadmin' && <ManagementTab />}
        </div>
      </div>
    </>
  );
}
