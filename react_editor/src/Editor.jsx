import { useState, useRef, useEffect, useCallback } from "react";
import html2pdf from "html2pdf.js";

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  bold: "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z",
  italic: "M19 4h-9M14 20H5M15 4L9 20",
  underline: "M6 3v7 a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16",
  strike: "M17.3 12H6.7M10 6.5C10 5.1 11.1 4 12.5 4s2.5 1.1 2.5 2.5c0 .9-.5 1.6-1.2 2H6M14 17.5c0 1.4-1.1 2.5-2.5 2.5S9 18.9 9 17.5c0-.9.5-1.6 1.2-2H18",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  quote: "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z",
  ul: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  ol: "M10 6h11M10 12h11M10 18h11M4 6h.01M4 12h.01M4 18h.01",
  alignL: "M17 10H3M21 6H3M21 14H3M17 18H3",
  alignC: "M17 10H7M21 6H3M21 14H3M17 18H7",
  alignR: "M21 10H7M21 6H3M21 14H3M21 18H7",
  alignJ: "M21 10H3M21 6H3M21 14H3M21 18H3",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",
  sparkle: "M12 3l1.8 5.4L19 9l-5.2 3.6L15.6 18 12 14.4 8.4 18l1.8-5.4L5 9l5.2-.6z",
  chevron: "M6 9l6 6 6-6",
};

function Dropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={styles.menuBtn}>{label}</button>
      {open && (
        <div style={styles.dropdown}>
          {items.map((item, i) =>
            item === "---"
              ? <div key={i} style={styles.divider} />
              : <button key={i} style={styles.dropItem} onClick={() => { item.action?.(); setOpen(false); }}>
                  {item.label}
                </button>
          )}
        </div>
      )}
    </div>
  );
}

function FormatSelect({ editorRef }) {
  const [val, setVal] = useState("Paragraph");
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const opts = ["Paragraph", "Heading 1", "Heading 2", "Heading 3"];
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const apply = (opt) => {
    setVal(opt); setOpen(false);
    editorRef.current?.focus();
    const map = { "Paragraph":"p","Heading 1":"h1","Heading 2":"h2","Heading 3":"h3" };
    document.execCommand("formatBlock", false, map[opt] || "p");
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={styles.formatSelect}>
        {val} <Icon d={icons.chevron} size={12} />
      </button>
      {open && (
        <div style={styles.dropdown}>
          {opts.map(opt => (
            <button key={opt} onClick={() => apply(opt)} style={{
              ...styles.dropItem,
              fontFamily: opt.startsWith("H") ? "'Nunito', sans-serif" : "inherit",
              fontSize: opt === "Heading 1" ? 18 : opt === "Heading 2" ? 15 : opt === "Heading 3" ? 13 : 13,
              fontWeight: opt.startsWith("H") ? 700 : opt === val ? 600 : 400,
              color: opt === val ? "#2d3f52" : "#6b7c8c",
            }}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function TBtn({ title, cmd, val, children, active, onClick }) {
  const exec = (e) => {
    e?.preventDefault();
    if (onClick) { onClick(); return; }
    document.execCommand(cmd, false, val || null);
  };
  return (
    <button
      title={title}
      onMouseDown={exec}
      style={{ ...styles.tBtn, background: active ? "#d0dde8" : "transparent", color: active ? "#2d3f52" : "#6b7c8c" }}>
      {children}
    </button>
  );
}

const Sep = () => <span style={{ width: 1, height: 20, background: "#c8d9ec", margin: "0 4px" }} />;

function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

export default function Editor() {
  const editorRef = useRef(null);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [chapterTitle, setChapterTitle] = useState("Загрузка...");
  const [saveStatus, setSaveStatus] = useState("saved");
  const saveTimerRef = useRef(null);

  const pathParts = window.location.pathname.split("/");
  const chapterId = pathParts[3];
  const projectId = pathParts[2];
  const token = new URLSearchParams(window.location.search).get('token');
  const API_BASE = `http://localhost:8012/api/projects/${projectId}/chapters/${chapterId}`;

  const updateStats = useCallback(() => {
    const text = editorRef.current?.innerText || "";
    setStats({ words: countWords(text), chars: text.replace(/\s/g, "").length });
  }, []);

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const draftKey = `chapter_draft_${chapterId}`;
        const localDraft = localStorage.getItem(draftKey);

        const res = await fetch(API_BASE, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setChapterTitle(data.title);

          const htmlToLoad = localDraft || data.content || "<p>Начните писать...</p>";
          if (editorRef.current) {
            editorRef.current.innerHTML = htmlToLoad;
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }

          updateStats();
        } else {
          setChapterTitle("Ошибка загрузки");
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchChapter();
  }, [chapterId, token, API_BASE, updateStats]);

  const handleInput = () => {
    setSaveStatus("unsaved");

    const draftKey = `chapter_draft_${chapterId}`;
    localStorage.setItem(draftKey, editorRef.current.innerHTML);

    updateStats();

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveContent(editorRef.current.innerHTML);
    }, 5000);
  };

  const saveContent = async (htmlToSave) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(API_BASE, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content: htmlToSave,
          char_count: stats.chars
        })
      });

      if (res.ok) {
        setSaveStatus("saved");
        localStorage.removeItem(`chapter_draft_${chapterId}`);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      setSaveStatus("error");
    }
  };

  const manualSave = () => {
    if (editorRef.current) {
      saveContent(editorRef.current.innerHTML);
    }
  };

  const exportPDF = async () => {
    const element = editorRef.current;
    if (!element) return;

    const opt = {
      margin: [20, 15, 20, 15],
      filename: `${chapterTitle.replace(/\s+/g, "_")}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      alert("Ошибка при экспорте");
    }
  };

  const handleEditorClick = (e) => {
    if (e.target.tagName === 'A' && e.target.href) {
      e.preventDefault();
      window.open(e.target.href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap');
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .editor-body { padding: 20mm !important; }
          @page { size: A4; margin: 0; }
        }
        [contenteditable] a { color: #4a6a8a; text-decoration: underline; cursor: pointer; pointer-events: auto; }
        [contenteditable] a:hover { color: #2d4a6a; }
        [contenteditable] pre { background: #f0f4f8; padding: 12px; border-radius: 8px; font-family: monospace; overflow-x: auto; }
        [contenteditable] blockquote { border-left: 4px solid #8fa8c8; margin: 16px 0; padding: 12px 20px; background: #f8fafc; font-style: italic; color: #4a6a8a; }
        [contenteditable] ul { list-style-type: disc; padding-left: 20px; }
        [contenteditable] ol { list-style-type: decimal; padding-left: 20px; }
      `}</style>

      <div style={styles.root}>
        <div className="no-print" style={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Dropdown label="Файл" items={[
              "---",
              { label: "Экспорт PDF", action: exportPDF },
              { label: "Печать", action: () => window.print() },
            ]} />
          </div>

          <div style={styles.titleWrap}>
            <span style={styles.titleText}>{chapterTitle}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={styles.statBadge}>{stats.words} слов · {stats.chars} символов</span>

            <span style={{ fontSize: 12, color: saveStatus === 'saved' ? '#5a9e6a' : saveStatus === 'saving' ? '#8fa8c8' : '#c0392b' }}>
              {saveStatus === 'saved' ? '✓ Сохранено' : saveStatus === 'saving' ? 'Сохранение...' : 'Не сохранено'}
            </span>

            <button onClick={manualSave} style={styles.saveBtn}>
              <Icon d={icons.save} size={14} /> Сохранить
            </button>
            <button onClick={exportPDF} style={styles.exportBtn}>
              <Icon d={icons.download} size={14} /> Экспорт PDF
            </button>
            <button style={styles.aiBtn}>
              <Icon d={icons.sparkle} size={14} /> Ask AI
            </button>
          </div>
        </div>

        <div className="no-print" style={styles.toolbar}>
          <FormatSelect editorRef={editorRef} />
          <Sep />
          <TBtn title="Жирный" cmd="bold"><Icon d={icons.bold} /></TBtn>
          <TBtn title="Курсив" cmd="italic"><Icon d={icons.italic} /></TBtn>
          <TBtn title="Подчёркнутый" cmd="underline"><Icon d={icons.underline} /></TBtn>
          <TBtn title="Зачёркнутый" cmd="strikeThrough"><Icon d={icons.strike} /></TBtn>
          <Sep />
          <TBtn title="Ссылка" onClick={() => {
            const url = prompt("Введите URL:");
            if (url && editorRef.current) {
              document.execCommand("createLink", false, url);
              const sel = window.getSelection();
              if (sel.rangeCount > 0) {
                const node = sel.getRangeAt(0).commonAncestorContainer.parentElement;
                if (node?.tagName === "A") {
                  node.setAttribute("target", "_blank");
                }
              }
            }
          }}><Icon d={icons.link} /></TBtn>
          <Sep />
          <TBtn title="Код" cmd="formatBlock" val="pre"><Icon d={icons.code} /></TBtn>
          <TBtn title="Цитата" cmd="formatBlock" val="blockquote"><Icon d={icons.quote} /></TBtn>
          <Sep />
          <TBtn title="Маркированный список" cmd="insertUnorderedList"><Icon d={icons.ul} /></TBtn>
          <TBtn title="Нумерованный список" cmd="insertOrderedList"><Icon d={icons.ol} /></TBtn>
        </div>

        <div style={styles.canvas}>
          <div className="page" style={styles.page}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              style={styles.editorBody}
              onInput={handleInput}
              onClick={handleEditorClick}
            />
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  root: { minHeight: "100vh", background: "#dce8f5", display: "flex", flexDirection: "column", fontFamily: "'Nunito', sans-serif" },
  topbar: { height: 48, background: "#fff", borderBottom: "1px solid #c8d9ec", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", gap: 16, position: "sticky", top: 0, zIndex: 100 },
  menuBtn: { background: "none", border: "none", padding: "6px 10px", cursor: "pointer", fontSize: 13, color: "#2d3f52", borderRadius: 6, fontFamily: "'Nunito', sans-serif" },
  titleWrap: { flex: 1, display: "flex", justifyContent: "center" },
  titleText: { fontSize: 14, color: "#2d3f52", fontWeight: 600, fontFamily: "'Nunito', sans-serif" },
  statBadge: { fontSize: 12, color: "#6b7c8c", background: "#f0f4f8", padding: "3px 10px", borderRadius: 20, fontWeight: 500 },
  saveBtn: { display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #b0c4d8", color: "#2d3f52", fontSize: 13, padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "'Nunito', sans-serif" },
  exportBtn: { display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #b0c4d8", color: "#2d3f52", fontSize: 13, padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "'Nunito', sans-serif" },
  aiBtn: { display: "flex", alignItems: "center", gap: 5, background: "#8fa8c8", border: "none", color: "#fff", fontSize: 13, padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "'Nunito', sans-serif", boxShadow: "0 2px 8px rgba(122,150,184,0.4)", transition: "all 0.15s", fontWeight: 600 },
  toolbar: { background: "#fff", borderBottom: "1px solid #c8d9ec", display: "flex", alignItems: "center", padding: "0 20px", gap: 2, minHeight: 42, position: "sticky", top: 48, zIndex: 99 },
  tBtn: { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#6b7c8c" },
  formatSelect: { display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #b0c4d8", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#2d3f52", minWidth: 120, fontFamily: "'Nunito', sans-serif" },
  dropdown: { position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", border: "1px solid #b0c4d8", borderRadius: 10, padding: "4px", boxShadow: "0 8px 32px rgba(100,140,180,0.15)", zIndex: 999, minWidth: 180 },
  dropItem: { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 12px", fontSize: 13, color: "#2d3f52", cursor: "pointer", borderRadius: 6, fontFamily: "'Nunito', sans-serif" },
  divider: { height: 1, background: "#dce8f5", margin: "4px 0" },
  canvas: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px 80px", background: "#dce8f5", overflowY: "auto" },
  page: { width: "100%", maxWidth: 794, background: "#fff", borderRadius: 8, boxShadow: "0 4px 16px rgba(100,140,180,0.12)", border: "1px solid #b0c4d8", marginBottom: 40 },
  editorBody: { padding: "72px 90px 40px", fontSize: "1rem", lineHeight: 1.75, color: "#2d3f52", fontFamily: "'Nunito', sans-serif", outline: "none", minHeight: "60vh", cursor: "text" },
};