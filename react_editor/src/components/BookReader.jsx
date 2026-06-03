import { useState, useEffect, useCallback, useRef } from 'react';

const MINIO_BG = 'http://localhost:9000/app-backgrounds/bg10.jpg';

function parseParagraphs(content) {
  if (!content) return [];

  if (/<[a-z]/i.test(content)) {
    const tmp = document.createElement('div');
    tmp.innerHTML = content;
    const paras = [];
    tmp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li').forEach(el => {
      const t = el.textContent.trim();
      if (t) paras.push(t);
    });
    if (!paras.length) {
      const lines = (tmp.innerText || tmp.textContent || '').split('\n');
      lines.forEach(l => { if (l.trim()) paras.push(l.trim()); });
    }
    return paras;
  }

  return content.split(/\n+/).map(l => l.trim()).filter(Boolean);
}

const CHARS_PER_PAGE = 2000;

function buildPages(chapters) {
  if (!chapters?.length) return [{ paragraphs: ['(нет текста)'], chapterTitle: '' }];

  const pages = [];
  let buf = [];
  let bufSize = 0;
  let curTitle = null;

  function flush() {
    if (buf.length) {
      pages.push({ paragraphs: [...buf], chapterTitle: curTitle });
      buf = [];
      bufSize = 0;
    }
  }

  for (const ch of chapters) {
    const paras = parseParagraphs(ch.content || '');
    if (bufSize > 0) flush();
    curTitle = ch.title;

    for (const para of paras) {
      if (bufSize + para.length > CHARS_PER_PAGE && buf.length) {
        flush();
        curTitle = ch.title;
      }
      buf.push(para);
      bufSize += para.length;
    }
  }
  flush();

  return pages.length ? pages : [{ paragraphs: ['(нет текста)'], chapterTitle: '' }];
}

const DEFAULT_SCALE = 1.0;
const MIN_SCALE     = 0.6;
const MAX_SCALE     = 2.0;
const SCALE_STEP    = 0.15;

export default function BookReader({ chapters = [], bookTitle = '', onClose }) {
  const [bgError, setBgError]    = useState(false);
  const [pageIdx, setPageIdx]    = useState(0);
  const [visible, setVisible]    = useState(true);
  const [scale, setScale]        = useState(DEFAULT_SCALE);
  const scrollRef                = useRef(null);
  const pages = buildPages(chapters);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pageIdx]);

  const goTo = useCallback((dir) => {
    const next = pageIdx + dir;
    if (next < 0 || next >= pages.length) return;
    setVisible(false);
    setTimeout(() => { setPageIdx(next); setVisible(true); }, 160);
  }, [pageIdx, pages.length]);

  const zoomIn    = () => setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut   = () => setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const zoomReset = () => setScale(DEFAULT_SCALE);

  useEffect(() => {
    const kd = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goTo(-1);
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, [goTo, onClose]);

  const bg = bgError
    ? 'linear-gradient(135deg,#0e1033 0%,#1a1d5c 50%,#0e1033 100%)'
    : `url(${MINIO_BG}) center/cover no-repeat fixed`;

  const pg       = pages[pageIdx];
  const progress = pages.length > 1 ? (pageIdx / (pages.length - 1)) * 100 : 100;
  const isScaled = scale !== DEFAULT_SCALE;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:bg,
      display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <img src={MINIO_BG} style={{ display:'none' }} onError={() => setBgError(true)} alt="" />
      <div style={{ position:'absolute', inset:0, background:'rgba(8,10,40,0.65)', backdropFilter:'blur(3px)' }} />

      <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 28px', background:'rgba(255,255,255,0.06)',
          borderBottom:'1px solid rgba(255,255,255,0.1)', backdropFilter:'blur(12px)', flexShrink:0 }}>

          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontFamily:"'Playfair Display',Georgia,serif", color:'#fff', fontSize:16, fontWeight:700, fontStyle:'italic' }}>
              {bookTitle}
            </div>
            {pg.chapterTitle && (
              <div style={{ fontFamily:'Nunito', fontSize:12, color:'rgba(255,255,255,0.45)',
                padding:'3px 12px', background:'rgba(255,255,255,0.08)',
                borderRadius:20, border:'1px solid rgba(255,255,255,0.12)' }}>
                {pg.chapterTitle}
              </div>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:4,
              background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)',
              borderRadius:10, padding:'3px 8px' }}>
              <button onClick={zoomOut} title="Уменьшить" style={zoomBtnStyle}>−</button>
              <span onClick={zoomReset} title="Сбросить масштаб"
                style={{ fontFamily:'Nunito', fontSize:12, color:'rgba(255,255,255,0.65)',
                  minWidth:42, textAlign:'center', cursor:'pointer', userSelect:'none' }}>
                {Math.round(scale * 100)}%
              </span>
              <button onClick={zoomIn} title="Увеличить" style={zoomBtnStyle}>+</button>
            </div>

            <div style={{ fontFamily:'Nunito', fontSize:13, color:'rgba(255,255,255,0.45)' }}>
              {pageIdx + 1} / {pages.length}
            </div>
            <button onClick={onClose} style={{ padding:'7px 18px', borderRadius:10,
              background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)',
              color:'rgba(255,255,255,0.8)', fontFamily:'Nunito', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              Закрыть
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="dark-scroll"
          style={{
            flex:1,
            overflowY:'auto',
            overflowX: isScaled ? 'auto' : 'hidden',
            display:'flex',
            alignItems:'flex-start',
            justifyContent:'center',
            padding:'32px 24px',
          }}
        >
          <div style={{
            width:'100%',
            maxWidth:720,
            flexShrink:0,
            background:'rgba(255,255,255,0.08)',
            backdropFilter:'blur(20px)',
            border:'1px solid rgba(255,255,255,0.15)',
            borderRadius:20,
            padding:'48px 60px',
            boxShadow:'0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
            transition:'opacity 0.18s ease',
            opacity: visible ? 1 : 0,
            transform:`scale(${scale})`,
            transformOrigin:'top center',
            marginBottom: scale > 1 ? `${(scale - 1) * 400}px` : 0,
          }}>
            {pg.chapterTitle && (
              <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:13, fontWeight:700,
                color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:2,
                marginBottom:28, paddingBottom:16, borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
                {pg.chapterTitle}
              </div>
            )}

            <div style={{ fontFamily:"'Georgia','Times New Roman',serif",
              fontSize:16, lineHeight:1.9, color:'rgba(255,255,255,0.88)' }}>
              {pg.paragraphs.map((para, i) => (
                <p key={i} style={{
                  margin:'0 0 1em 0',
                  textIndent:'2em',
                  textAlign:'justify',
                  wordBreak:'break-word',
                }}>
                  {para}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flexShrink:0, padding:'14px 28px 20px',
          background:'rgba(255,255,255,0.04)', borderTop:'1px solid rgba(255,255,255,0.08)',
          backdropFilter:'blur(8px)' }}>
          <div style={{ width:'100%', height:2, background:'rgba(255,255,255,0.1)', borderRadius:2, marginBottom:14 }}>
            <div style={{ height:'100%', borderRadius:2, background:'rgba(255,255,255,0.5)',
              width:`${progress}%`, transition:'width .3s ease' }} />
          </div>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <button onClick={() => goTo(-1)} disabled={pageIdx === 0} style={navBtn(pageIdx === 0)}>
              Назад
            </button>

            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {pages.slice(Math.max(0,pageIdx-6), Math.min(pages.length,pageIdx+7)).map((_,i) => {
                const real = Math.max(0,pageIdx-6)+i;
                return (
                  <div key={real}
                    onClick={() => { setVisible(false); setTimeout(() => { setPageIdx(real); setVisible(true); }, 160); }}
                    style={{ width:real===pageIdx?24:6, height:6, borderRadius:3,
                      background:real===pageIdx?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.25)',
                      cursor:'pointer', transition:'all .2s' }} />
                );
              })}
            </div>

            <button onClick={() => goTo(1)} disabled={pageIdx===pages.length-1} style={navBtn(pageIdx===pages.length-1)}>
              Далее
            </button>
          </div>

          <div style={{ textAlign:'center', marginTop:10, fontFamily:'Nunito', fontSize:11, color:'rgba(255,255,255,0.2)' }}>
            ← → для навигации · прокрутка для длинных страниц
          </div>
        </div>
      </div>
    </div>
  );
}

const zoomBtnStyle = {
  width:28, height:28, border:'none', background:'transparent',
  color:'rgba(255,255,255,0.75)', fontSize:18, lineHeight:1,
  cursor:'pointer', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
};

function navBtn(disabled) {
  return {
    padding:'10px 28px', borderRadius:12,
    background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)',
    border:'1px solid rgba(255,255,255,0.15)',
    color: disabled ? 'rgba(255,255,255,0.2)' : '#fff',
    fontFamily:'Nunito', fontWeight:700, fontSize:14,
    cursor: disabled ? 'default' : 'pointer', transition:'all .15s',
  };
}
