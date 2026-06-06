import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import html2pdf from "html2pdf.js";

const PAGE_W    = 750;
const PAGE_H    = 1058;
const PAD_V     = 80;
const PAD_H     = 90;
const CONTENT_H = PAGE_H - PAD_V * 2;
const CONTENT_W = PAGE_W - PAD_H * 2;
const LINE_H    = Math.round(16 * 1.75);
const BG_URL    = "http://localhost:9000/app-backgrounds/bg9.jpg";

const getIcon = (name, size = 16) => {
  const icons = {
    bold:      "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z",
    italic:    "M19 4h-9M14 20H5M15 4L9 20",
    underline: "M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16",
    link:      "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    code:      "M16 18l6-6-6-6M8 6l-6 6 6 6",
    quote:     "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z",
    ul:        "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
    ol:        "M10 6h11M10 12h11M10 18h11M4 6h.01M4 12h.01M4 18h.01",
    alignL:    "M17 10H3M21 6H3M21 14H3M17 18H3",
    alignC:    "M17 10H7M21 6H3M21 14H3M17 18H7",
    alignR:    "M21 10H7M21 6H3M21 14H3M21 18H7",
    alignJ:    "M21 10H3M21 6H3M21 14H3M21 18H3",
    download:  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    save:      "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
    sparkle:   "M12 3l1.8 5.4L19 9l-5.2 3.6L15.6 18 12 14.4 8.4 18l1.8-5.4L5 9l5.2-.6z",
    chevron:   "M6 9l6 6 6-6",
    pencil:    "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    fileText:  "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    printer:   "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
    moon:      "M21 12.79A7 7 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    sun:       "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
    arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  };

  const Icon = ({ d, size: s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );

  return <Icon d={icons[name]} size={size} />;
};

let saveQueue = [];
let isProcessingSave = false;
let aiQueue = [];
let isProcessingAI = false;

async function processSaveQueue() {
  if (isProcessingSave || saveQueue.length === 0) return;
  isProcessingSave = true;

  const { chapterId, token, content, resolve, reject } = saveQueue.shift();

  try {
    const [projectId, chapterIdNum] = chapterId.split('/');
    const res = await fetch(`http://localhost:8012/api/projects/${projectId}/chapters/${chapterIdNum}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content_html: content }),
    });
    if (res.ok) {
      localStorage.removeItem(`chapter_draft_${chapterId}`);
      resolve?.();
    } else {
      reject?.(new Error("Save failed"));
    }
  } catch (err) {
    reject?.(err);
  } finally {
    isProcessingSave = false;
    processSaveQueue();
  }
}

async function processAIQueue() {
  if (isProcessingAI || aiQueue.length === 0) return;
  isProcessingAI = true;

  const { action, text, genre, projectId, token, resolve, reject } = aiQueue.shift();

  try {
    const endpoint = action === "analyze" ? "/api/ai/analyze" : "/api/ai/complete";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        text,
        action,
        genre: genre || null,
        project_id: projectId
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    resolve(data);
  } catch (err) {
    reject(err);
  } finally {
    isProcessingAI = false;
    processAIQueue();
  }
}

function queueSave(chapterId, token, content) {
  return new Promise((resolve, reject) => {
    saveQueue.push({ chapterId, token, content, resolve, reject });
    processSaveQueue();
  });
}

function queueAIAction(action, text, genre, projectId, token) {
  return new Promise((resolve, reject) => {
    aiQueue.push({ action, text, genre, projectId, token, resolve, reject });
    processAIQueue();
  });
}

function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function toggleBlock(tag) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  const el   = node.nodeType === 1 ? node : node.parentElement;
  document.execCommand("formatBlock", false, el?.closest(tag) ? "p" : tag);
}

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  bold:      "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z",
  italic:    "M19 4h-9M14 20H5M15 4L9 20",
  underline: "M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16",
  link:      "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  code:      "M16 18l6-6-6-6M8 6l-6 6 6 6",
  quote:     "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z",
  ul:        "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  ol:        "M10 6h11M10 12h11M10 18h11M4 6h.01M4 12h.01M4 18h.01",
  alignL:    "M17 10H3M21 6H3M21 14H3M17 18H3",
  alignC:    "M17 10H7M21 6H3M21 14H3M17 18H7",
  alignR:    "M21 10H7M21 6H3M21 14H3M21 18H7",
  alignJ:    "M21 10H3M21 6H3M21 14H3M21 18H3",
  download:  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  save:      "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  sparkle:   "M12 3l1.8 5.4L19 9l-5.2 3.6L15.6 18 12 14.4 8.4 18l1.8-5.4L5 9l5.2-.6z",
  chevron:   "M6 9l6 6 6-6",
  pencil:    "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  fileText:  "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  printer:   "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  moon:      "M21 12.79A7 7 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  sun:       "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  panelCollapse: "M15 18l-6-6 6-6",
  panelExpand: "M9 18l6-6-6-6",
  chatBubble: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
};

const Dropdown = ({ label, items, dark }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const itemIconMap = { "Экспорт PDF": icons.fileText, "Печать": icons.printer };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? (dark ? "rgba(255,255,255,0.1)" : "#f0f4f8") : "none",
          border: "none", padding: "6px 12px", cursor: "pointer", fontSize: 13,
          color: dark ? "#e8ecff" : "#2d3f52", borderRadius: 8,
          fontFamily: "'Nunito', sans-serif", fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6, transition: "background .15s",
        }}
      >
        {label} <Icon d={icons.chevron} size={12} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0,
          background: dark ? "#1e2055" : "#fff",
          border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#c8d9ec"}`,
          borderRadius: 12, padding: 6,
          boxShadow: dark ? "0 12px 40px rgba(10,12,60,0.7)" : "0 12px 40px rgba(100,140,180,0.18)",
          zIndex: 9999, minWidth: 200,
        }}>
          {items.map((item, i) =>
            item === "---"
              ? <div key={i} style={{ height: 1, background: dark ? "rgba(255,255,255,0.07)" : "#e8f0f8", margin: "4px 0" }} />
              : (
                <button key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    textAlign: "left", background: "none", border: "none",
                    padding: "9px 12px", fontSize: 13, color: dark ? "#c8d0ff" : "#2d3f52",
                    cursor: "pointer", borderRadius: 8,
                    fontFamily: "'Nunito', sans-serif", fontWeight: 500,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.1)" : "#f0f6ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                  onClick={() => { item.action?.(); setOpen(false); }}
                >
                  {itemIconMap[item.label] && (
                    <span style={{ color: dark ? "#8890cc" : "#8fa8c8", flexShrink: 0 }}>
                      <Icon d={itemIconMap[item.label]} size={15} />
                    </span>
                  )}
                  {item.label}
                </button>
              )
          )}
        </div>
      )}
    </div>
  );
};

const FormatSelect = ({ dark, onBeforeApply }) => {
  const [val, setVal] = useState("Абзац");
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const ref = useRef();
  const btnRef = useRef();
  const opts = ["Абзац", "Заголовок 1", "Заголовок 2", "Заголовок 3"];
  const cmdMap = { "Абзац": "p", "Заголовок 1": "h1", "Заголовок 2": "h2", "Заголовок 3": "h3" };

  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
  };

  const apply = (opt) => {
    onBeforeApply?.();
    setVal(opt);
    setOpen(false);
    document.execCommand("formatBlock", false, cmdMap[opt] || "p");
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button ref={btnRef} onClick={handleOpen} style={{
        display: "flex", alignItems: "center", gap: 6, background: "none",
        border: `1px solid ${dark ? "rgba(255,255,255,0.18)" : "#b0c4d8"}`,
        padding: "4px 10px", borderRadius: 6, cursor: "pointer",
        fontSize: 13, color: dark ? "#e8ecff" : "#2d3f52",
        minWidth: 130, fontFamily: "'Nunito', sans-serif",
      }}>
        {val} <Icon d={icons.chevron} size={12} />
      </button>
      {open && (
        <div style={{
          position: "fixed", top: dropPos.top, left: dropPos.left,
          background: dark ? "#1e2055" : "#fff",
          border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#b0c4d8"}`,
          borderRadius: 10, padding: 4,
          boxShadow: dark ? "0 8px 32px rgba(10,12,60,0.6)" : "0 8px 32px rgba(100,140,180,0.18)",
          zIndex: 99999, minWidth: 160,
        }}>
          {opts.map(opt => (
            <button key={opt} onClick={() => apply(opt)} style={{
              display: "block", width: "100%", textAlign: "left",
              background: opt === val ? (dark ? "rgba(69,71,181,0.3)" : "#eef3fa") : "none",
              border: "none", padding: "8px 12px",
              fontSize: opt === "Заголовок 1" ? 18 : opt === "Заголовок 2" ? 15 : 13,
              fontFamily: "'Nunito', sans-serif",
              fontWeight: opt !== "Абзац" ? 700 : opt === val ? 600 : 400,
              color: opt === val ? (dark ? "#a0aaff" : "#2d3f52") : (dark ? "#c8d0ff" : "#6b7c8c"),
              cursor: "pointer", borderRadius: 6,
            }}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const TBtn = ({ title, cmd, val, children, onClick, dark, onBefore }) => {
  const exec = (e) => {
    e?.preventDefault();
    onBefore?.();
    if (onClick) { onClick(); return; }
    document.execCommand(cmd, false, val || null);
  };
  return (
    <button title={title} onMouseDown={exec} style={{
      width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
      border: "none", borderRadius: 6, cursor: "pointer",
      background: "transparent", color: dark ? "#8890cc" : "#6b7c8c",
      transition: "background .1s, color .1s", flexShrink: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.08)" : "#eef3fa"; e.currentTarget.style.color = dark ? "#e8ecff" : "#2d3f52"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = dark ? "#8890cc" : "#6b7c8c"; }}
    >
      {children}
    </button>
  );
};

const Sep = ({ dark }) => (
  <span style={{ width: 1, height: 20, background: dark ? "rgba(255,255,255,0.1)" : "#c8d9ec", margin: "0 4px", flexShrink: 0 }} />
);

const DarkToggle = ({ dark, onToggle }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ color: dark ? "#e8ecff" : "#8fa8c8", lineHeight: 0 }}><Icon d={icons.sun} size={14} /></span>
      <button onClick={onToggle} title={dark ? "Светлая тема" : "Тёмная тема"} style={{
        width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
        padding: 0, background: dark ? "#4547b5" : "#c8d9ec",
        position: "relative", transition: "background .25s", flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 3, left: dark ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: dark ? "#e8ecff" : "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          transition: "left .25s", display: "block",
        }} />
      </button>
      <span style={{ color: dark ? "#8890cc" : "#2d3f52", lineHeight: 0 }}><Icon d={icons.moon} size={14} /></span>
    </div>
  );
};
export default function Editor() {
  const [pageCount, setPageCount] = useState(1);
  const [reflowTick, setReflowTick] = useState(0);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [chapterTitle, setChapterTitle] = useState("Загрузка...");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [dark, setDark] = useState(false);
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiHighlights, setAiHighlights] = useState(false);
  const [projectGenre, setProjectGenre] = useState(null);
  const [explanations, setExplanations] = useState(null);
  const [showExplanations, setShowExplanations] = useState(false);
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const [continueBtn, setContinueBtn] = useState(null);
  const [continueLoading, setContinueLoading] = useState(false);
  const [pendingAiInsert, setPendingAiInsert] = useState(null);
  const pendingAiInsertRef = useRef(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const aiDropdownRef = useRef(null);
  const pageRefs = useRef([]);
  const sizerRef = useRef(null);
  const pendingPages = useRef(null);
  const isReflowing = useRef(false);
  const saveTimerRef = useRef(null);
  const loadedRef = useRef(false);
  const titleInputRef = useRef(null);
  const idleTimerRef = useRef(null);
  const continueRangeRef = useRef(null);
  const chatEndRef = useRef(null);

  const setPending = useCallback((val) => {
    pendingAiInsertRef.current = val;
    setPendingAiInsert(val);
  }, []);

  const historyStack = useRef([""]);
  const historyIndex = useRef(0);
  const historyDebounce = useRef(null);
  const pendingCursorRef = useRef(null);

  const parts = window.location.pathname.split("/");
  const projectId = parts[2];
  const chapterIdNum = parts[3];
  const token = new URLSearchParams(window.location.search).get("token");
  const API_BASE = `http://localhost:8012/api/projects/${projectId}/chapters/${chapterIdNum}`;

  const getAllContent = useCallback(() =>
    pageRefs.current.map(r => r?.innerHTML || "").join(""), []);

  const snapshotNow = useCallback(() => {
    const html = getAllContent();
    const stack = historyStack.current;
    const idx = historyIndex.current;
    if (stack[idx] === html) return;
    stack.splice(idx + 1);
    stack.push(html);
    if (stack.length > 200) stack.shift();
    else historyIndex.current = stack.length - 1;
  }, [getAllContent]);

  const snapshotLater = useCallback(() => {
    clearTimeout(historyDebounce.current);
    historyDebounce.current = setTimeout(snapshotNow, 700);
  }, [snapshotNow]);

  const beforeFormat = useCallback(() => {
    clearTimeout(historyDebounce.current);
    snapshotNow();
  }, [snapshotNow]);

  const getCursorCharOffset = useCallback(() => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return -1;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return -1;
    let offset = 0;
    for (const page of pageRefs.current) {
      if (!page) continue;
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node === range.startContainer) return offset + range.startOffset;
        offset += node.length;
      }
    }
    return -1;
  }, []);

  const restoreCursorFromOffset = useCallback((targetOffset) => {
    const pages = pageRefs.current.filter(Boolean);
    if (!pages.length) return;

    if (targetOffset >= 0) {
      let offset = 0;
      for (const page of pages) {
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const len = node.length;
          if (offset + len >= targetOffset) {
            try {
              const r = document.createRange();
              r.setStart(node, Math.min(targetOffset - offset, len));
              r.collapse(true);
              window.getSelection()?.removeAllRanges();
              window.getSelection()?.addRange(r);
              return;
            } catch {}
          }
          offset += len;
        }
      }
    }

    const last = pages[pages.length - 1];
    const fallbackWalker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
    let lastNode = null, nn;
    while ((nn = fallbackWalker.nextNode())) lastNode = nn;
    try {
      const r = document.createRange();
      if (lastNode) {
        r.setStart(lastNode, lastNode.length);
      } else {
        r.selectNodeContents(last);
      }
      r.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
    } catch {}
  }, []);

  const normalizePageContent = useCallback((el) => {
    if (!el) return;
    const BLOCK = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL','BLOCKQUOTE','PRE','DIV']);
    let buf = [];
    const flush = (before) => {
      if (!buf.length) return;
      const hasReal = buf.some(n => n.nodeType === 3 ? n.textContent.trim() : true);
      if (hasReal) {
        const p = document.createElement('p');
        buf.forEach(n => p.appendChild(n));
        el.insertBefore(p, before || null);
      } else {
        buf.forEach(n => { try { el.removeChild(n); } catch{} });
      }
      buf = [];
    };
    Array.from(el.childNodes).forEach(child => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && BLOCK.has(child.tagName);
      if (isBlock) { flush(child); }
      else { buf.push(child); }
    });
    flush(null);
  }, []);

  const splitBlockAtHeight = useCallback((block, availH, sizer) => {
    const tag = (block.tagName || "p").toLowerCase();
    if (!["p", "div", "h1", "h2", "h3"].includes(tag)) return null;

    sizer.innerHTML = "";
    sizer.appendChild(block.cloneNode(true));
    if (sizer.scrollHeight <= availH) return null;

    const text = block.textContent;
    if (!text) return null;

    const spaceIdxs = [0];
    for (let i = 1; i < text.length; i++) {
      if (text[i - 1] === " " || text[i - 1] === "\n") spaceIdxs.push(i);
    }
    if (spaceIdxs.length <= 1) return null;

    let lo = 0, hi = spaceIdxs.length - 1, bestPos = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const pos = spaceIdxs[mid];
      const testEl = document.createElement(tag);
      testEl.textContent = text.substring(0, pos).trimEnd();
      sizer.innerHTML = "";
      sizer.appendChild(testEl);
      if (sizer.scrollHeight > 0 && sizer.scrollHeight <= availH) {
        bestPos = pos;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (bestPos <= 0) return null;

    const el1 = block.cloneNode(true);
    const el2 = block.cloneNode(true);

    let rem = bestPos;
    const w1 = document.createTreeWalker(el1, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = w1.nextNode())) {
      const len = tn.textContent.length;
      if (rem <= 0) {
        tn.textContent = "";
      } else if (len > rem) {
        tn.textContent = tn.textContent.substring(0, rem).trimEnd();
        rem = 0;
      } else {
        rem -= len;
      }
    }

    rem = bestPos;
    const w2 = document.createTreeWalker(el2, NodeFilter.SHOW_TEXT);
    while ((tn = w2.nextNode())) {
      const len = tn.textContent.length;
      if (rem <= 0) {
      } else if (len > rem) {
        tn.textContent = tn.textContent.substring(rem).replace(/^\s+/, "");
        rem = 0;
      } else {
        rem -= len;
        tn.textContent = "";
      }
    }

    return [el1, el2];
  }, []);

  const reflow = useCallback((withCursorRestore = false) => {
    if (isReflowing.current) return;
    isReflowing.current = true;

    const sizer = sizerRef.current;
    if (!sizer) { isReflowing.current = false; return; }

    const savedOffset = withCursorRestore ? getCursorCharOffset() : undefined;

    pageRefs.current.forEach(el => normalizePageContent(el));

    const allHTML = getAllContent();
    if (!allHTML.trim()) {
      if (pageRefs.current[0]) pageRefs.current[0].innerHTML = "<p><br></p>";
      pendingPages.current = { htmls: ["<p><br></p>"], savedOffset };
      isReflowing.current = false;
      setPageCount(1);
      setReflowTick(t => t + 1);
      return;
    }

    const host = document.createElement("div");
    host.innerHTML = allHTML;

    const BLOCK_TAGS = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL','BLOCKQUOTE','PRE','DIV']);
    const blocks = [];
    let inlineBuf = [];
    const flushInline = () => {
      if (!inlineBuf.length) return;
      const hasContent = inlineBuf.some(n => n.nodeType === 3 ? n.textContent : true);
      if (hasContent) {
        const p = document.createElement('p');
        inlineBuf.forEach(n => p.appendChild(n.cloneNode(true)));
        blocks.push(p);
      }
      inlineBuf = [];
    };

    host.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim()) inlineBuf.push(node);
      } else if (BLOCK_TAGS.has(node.tagName)) {
        flushInline();
        blocks.push(node.cloneNode(true));
      } else {
        inlineBuf.push(node.cloneNode(true));
      }
    });
    flushInline();

    if (blocks.length === 0) {
      const p = document.createElement("p");
      p.innerHTML = "<br>";
      blocks.push(p);
    }

    const pages = [];
    let curBlocks = [];
    let curH = 0;

    for (const block of blocks) {
      sizer.innerHTML = "";
      sizer.appendChild(block.cloneNode(true));
      const bh = sizer.scrollHeight;
      const avail = CONTENT_H - curH;

      if (curBlocks.length > 0 && curH + bh > CONTENT_H) {
        if (avail >= LINE_H * 2) {
          const parts = splitBlockAtHeight(block, avail, sizer);
          if (parts && parts[0] && parts[1]) {
            const [p1, p2] = parts;

            sizer.innerHTML = "";
            sizer.appendChild(p1.cloneNode(true));
            if (sizer.scrollHeight > 0) curBlocks.push(p1);
            pages.push(curBlocks.map(b => b.outerHTML || "").join(""));

            sizer.innerHTML = "";
            sizer.appendChild(p2.cloneNode(true));
            const p2h = sizer.scrollHeight;
            curBlocks = p2h > 0 ? [p2] : [];
            curH = p2h > 0 ? p2h : 0;
            continue;
          }
        }
        pages.push(curBlocks.map(b => b.outerHTML || "").join(""));
        curBlocks = [block];
        curH = bh;
      } else {
        curBlocks.push(block);
        curH += bh;
      }
    }

    if (curBlocks.length > 0) {
      pages.push(curBlocks.map(b => b.outerHTML || "").join(""));
    }

    if (pages.length === 0) pages.push("<p><br></p>");

    pendingPages.current = { htmls: pages, savedOffset };
    isReflowing.current = false;
    setPageCount(pages.length);
    setReflowTick(t => t + 1);
  }, [getAllContent, getCursorCharOffset, normalizePageContent, splitBlockAtHeight]);

  useLayoutEffect(() => {
    if (!pendingPages.current) return;
    const { htmls, savedOffset } = pendingPages.current;
    pendingPages.current = null;
    htmls.forEach((html, i) => {
      const el = pageRefs.current[i];
      if (el && el.innerHTML !== html) el.innerHTML = html;
    });
    for (let i = htmls.length; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (el) el.innerHTML = "<p><br></p>";
    }

    if (pendingCursorRef.current) {
      const { markId } = pendingCursorRef.current;
      pendingCursorRef.current = null;
      for (const page of pageRefs.current) {
        const target = page?.querySelector(`[data-cursor-target="${markId}"]`);
        if (target) {
          target.removeAttribute('data-cursor-target');
          try {
            const r = document.createRange();
            const firstChild = target.firstChild;
            if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
              r.setStart(firstChild, 0);
            } else {
              r.setStart(target, 0);
            }
            r.collapse(true);
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(r);
          } catch {}
          return;
        }
      }
    }

    if (savedOffset !== undefined) restoreCursorFromOffset(savedOffset);
  });

  const updateStats = useCallback(() => {
    const text = pageRefs.current.map(r => r?.innerText || "").join("");
    setStats({ words: countWords(text), chars: text.replace(/\s/g, "").length });
  }, []);

  const restoreToIndex = useCallback((idx) => {
    const html = historyStack.current[idx];
    if (html == null) return;
    historyIndex.current = idx;
    pageRefs.current.forEach((el, i) => {
      if (!el) return;
      el.innerHTML = i === 0 ? html : "";
    });
    reflow(false);
    updateStats();
    setSaveStatus("unsaved");
    localStorage.setItem(`chapter_draft_${projectId}_${chapterIdNum}`, html);
  }, [reflow, updateStats, projectId, chapterIdNum]);

  const undo = useCallback(() => {
    clearTimeout(historyDebounce.current);
    snapshotNow();
    if (historyIndex.current > 0) restoreToIndex(historyIndex.current - 1);
  }, [snapshotNow, restoreToIndex]);

  const redo = useCallback(() => {
    if (historyIndex.current < historyStack.current.length - 1)
      restoreToIndex(historyIndex.current + 1);
  }, [restoreToIndex]);

  const handleEnter = useCallback((e) => {
    e.preventDefault();

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    let blockEl = range.startContainer.nodeType === 3
      ? range.startContainer.parentElement
      : range.startContainer;
    let page = null;
    for (const p of pageRefs.current) {
      if (p && p.contains(blockEl)) { page = p; break; }
    }
    if (!page) return;
    while (blockEl && blockEl.parentElement !== page) {
      blockEl = blockEl.parentElement;
    }
    if (!blockEl) return;

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(blockEl, blockEl.childNodes.length);
    const fragment = afterRange.extractContents();

    const newP = document.createElement('p');
    const fragText = fragment.textContent;
    if (fragText) {
      newP.appendChild(fragment);
    } else {
      newP.innerHTML = '<br>';
    }

    const markId = 'ec-' + Date.now();
    newP.setAttribute('data-cursor-target', markId);
    pendingCursorRef.current = { markId };

    blockEl.parentNode.insertBefore(newP, blockEl.nextSibling);

    if (!blockEl.textContent && !blockEl.querySelector('br')) {
      blockEl.innerHTML = '<br>';
    }

    setTimeout(() => {
      reflow(false);
      updateStats();
    }, 10);
  }, [reflow, updateStats]);

  const handleBackspace = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    const node = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType === Node.TEXT_NODE && offset === 0) {
      const parent = node.parentElement;
      if (parent && parent.tagName === 'P' && parent.textContent.trim() === '') {
        e.preventDefault();
        parent.remove();
        reflow(true);
        updateStats();
        return;
      }
    }
  }, [reflow, updateStats]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") {
      handleEnter(e);
      return;
    }
    if (e.key === "Backspace") {
      handleBackspace(e);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (pendingAiInsertRef.current) {
        acceptPendingAiRef.current?.();
        return;
      }
      document.execCommand("insertHTML", false, "\u00a0\u00a0\u00a0\u00a0");
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
    if (mod && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); return; }
    if (mod && e.key === "s") { e.preventDefault(); manualSave(); return; }

    if (mod && e.key === "a") {
      e.preventDefault();
      const pages = pageRefs.current.filter(Boolean);
      if (pages.length === 0) return;
      try {
        const range = document.createRange();
        range.setStart(pages[0], 0);
        const lastPage = pages[pages.length - 1];
        range.setEnd(lastPage, lastPage.childNodes.length);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      } catch {}
      return;
    }
  }, [undo, redo, handleEnter, handleBackspace]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const load = async () => {
      try {
        const draftKey = `chapter_draft_${projectId}_${chapterIdNum}`;
        const localDraft = localStorage.getItem(draftKey);

        const res = await fetch(API_BASE, {
          headers: { Authorization: `Bearer ${token}` }
        });

        let htmlToLoad = "<p><br></p>";
        if (res.ok) {
          const data = await res.json();
          setChapterTitle(data.title || "Без названия");

          const contentRes = await fetch(`${API_BASE}/content`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (contentRes.ok) {
            const contentData = await contentRes.json();
            htmlToLoad = localDraft || contentData.content || htmlToLoad;
          } else {
            htmlToLoad = localDraft || data.content || htmlToLoad;
          }
        } else {
          setChapterTitle("Ошибка загрузки");
        }

        if (pageRefs.current[0]) pageRefs.current[0].innerHTML = htmlToLoad;
        reflow(false);
        updateStats();
        historyStack.current = [htmlToLoad];
        historyIndex.current = 0;

        try {
          const projRes = await fetch(
            `http://localhost:8012/api/projects/${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (projRes.ok) {
            const projData = await projRes.json();
            if (projData.genre) setProjectGenre(projData.genre);
          }
        } catch (_) {}
      } catch (err) {
        console.error(err);
        setChapterTitle("Ошибка загрузки");
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const startEditTitle = () => { setTitleDraft(chapterTitle); setEditingTitle(true); };

  const commitTitle = async () => {
    const newTitle = titleDraft.trim();
    if (!newTitle || newTitle === chapterTitle) { setEditingTitle(false); return; }
    setChapterTitle(newTitle);
    setEditingTitle(false);
    try {
      await fetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) { console.error(err); }
  };

  const saveContent = useCallback((html) => {
    setSaveStatus("saving");
    queueSave(`${projectId}/${chapterIdNum}`, token, html)
      .then(() => {
        setSaveStatus("saved");
        localStorage.removeItem(`chapter_draft_${projectId}_${chapterIdNum}`);
      })
      .catch(() => setSaveStatus("error"));
  }, [projectId, chapterIdNum, token]);

  const manualSave = useCallback(() => saveContent(getAllContent()), [saveContent, getAllContent]);

  const handleInput = useCallback(() => {
    setSaveStatus("unsaved");
    reflow(true);
    updateStats();
    const content = getAllContent();
    localStorage.setItem(`chapter_draft_${projectId}_${chapterIdNum}`, content);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveContent(content), 5000);
    snapshotLater();
    if (pendingAiInsert) {
      setPending(null);
    }
  }, [projectId, chapterIdNum, reflow, updateStats, getAllContent, snapshotLater, saveContent, pendingAiInsert]);

  const handlePaste = useCallback(() => {
    clearTimeout(historyDebounce.current);
    snapshotNow();
    setTimeout(snapshotLater, 0);
  }, [snapshotNow, snapshotLater]);

  const handleEditorClick = useCallback((e) => {
    const link = e.target.closest("a[href]");
    if (link) { e.preventDefault(); window.open(link.href, "_blank", "noopener,noreferrer"); }
  }, []);

  const exportPDF = useCallback(async () => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `width:${PAGE_W}px;margin:0;padding:0;background:#fff;`;

    const pages = pageRefs.current.filter(Boolean);
    pages.forEach((page) => {
      const pageDiv = document.createElement("div");
      pageDiv.style.cssText = [
        `width:${PAGE_W}px`,
        `height:${PAGE_H}px`,
        `padding:${PAD_V}px ${PAD_H}px`,
        "font-family:'Nunito',sans-serif",
        "font-size:16px",
        "line-height:1.75",
        "color:#2d3f52",
        "background:#ffffff",
        "box-sizing:border-box",
        "overflow:hidden",
      ].join(";");

      const clone = page.cloneNode(true);
      clone.querySelectorAll('.ai-highlight').forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
      });
      const allElements = clone.querySelectorAll('*');
      allElements.forEach(el => {
        const savedAlign = el.style.textAlign;
        el.removeAttribute('style');
        el.style.lineHeight = '1.75';
        el.style.color = '#2d3f52';
        el.style.fontSize = '16px';
        if (savedAlign) el.style.textAlign = savedAlign;
      });
      clone.querySelectorAll('p').forEach(el => { el.style.margin = '0 0 0.25em'; });
      clone.querySelectorAll('h1,h2,h3').forEach(el => { el.style.margin = '0.5em 0 0.25em'; el.style.fontWeight = '700'; });
      clone.querySelectorAll('ul,ol').forEach(el => { el.style.paddingLeft = '22px'; el.style.margin = '0.25em 0'; });
      clone.querySelectorAll('blockquote').forEach(el => {
        el.style.background = '#f8fafc';
        el.style.borderLeft = '4px solid #8fa8c8';
        el.style.margin = '0.75em 0';
        el.style.padding = '8px 20px';
        el.style.fontStyle = 'italic';
      });
      clone.querySelectorAll('pre,code').forEach(el => {
        el.style.background = '#f0f4f8';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '6px';
        el.style.fontFamily = 'monospace';
        el.style.fontSize = '0.87em';
        el.style.whiteSpace = 'pre-wrap';
        el.style.wordBreak = 'break-all';
        el.style.border = '1px solid #d0dcea';
        el.style.lineHeight = '1.6';
      });
      pageDiv.innerHTML = clone.innerHTML;
      wrapper.appendChild(pageDiv);
    });

    const opt = {
      margin: 0,
      filename: `${chapterTitle.replace(/\s+/g, "_")}.pdf`,
      image: { type: "jpeg", quality: 0.97 },
      html2canvas: { scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "px", format: [PAGE_W, PAGE_H], orientation: "portrait" },
    };

    try { await html2pdf().set(opt).from(wrapper).save(); }
    catch { alert("Ошибка при экспорте PDF"); }
  }, [chapterTitle]);

  const getAllText = useCallback(() => {
    return pageRefs.current
      .filter(Boolean)
      .map(p => p.innerText || "")
      .join("\n\n")
      .trim();
  }, []);

  const callAI = useCallback(async (action, textToSend) => {
    return queueAIAction(action, textToSend, projectGenre, projectId, token);
  }, [projectGenre, projectId, token]);

  const handleIntroduce = useCallback(async () => {
    setAiDropdownOpen(false);
    setAiLoading(true);
    try {
      const fullText = getAllText();
      const textToSend = fullText.length > 8000 ? fullText.slice(0, 8000) : fullText;
      const data = await callAI("introduce", textToSend);
      const firstPage = pageRefs.current.find(Boolean);
      if (firstPage) {
        if (pendingAiInsert) {
          const old = document.getElementById(pendingAiInsert.spanId);
          if (old) old.closest('p')?.remove() || old.remove();
        }
        const spanId = 'ai-pending-' + Date.now();
        const p = document.createElement("p");
        const span = document.createElement("span");
        span.id = spanId;
        span.className = 'ai-pending';
        span.setAttribute('data-ai-type', 'introduce');
        span.textContent = data.result;
        p.appendChild(span);
        firstPage.insertBefore(p, firstPage.firstChild);
        reflow(false);
        updateStats();
        setPending({ spanId, type: "introduce" });
      }
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [getAllText, callAI, reflow, updateStats, pendingAiInsert]);

  const handleConclude = useCallback(async () => {
    setAiDropdownOpen(false);
    setAiLoading(true);
    try {
      const fullText = getAllText();
      const textToSend = fullText.length > 8000 ? fullText.slice(0, 8000) : fullText;
      const data = await callAI("conclude", textToSend);
      const lastPage = [...pageRefs.current].reverse().find(Boolean);
      if (lastPage) {
        if (pendingAiInsert) {
          const old = document.getElementById(pendingAiInsert.spanId);
          if (old) old.closest('p')?.remove() || old.remove();
        }
        const spanId = 'ai-pending-' + Date.now();
        const p = document.createElement("p");
        const span = document.createElement("span");
        span.id = spanId;
        span.className = 'ai-pending';
        span.setAttribute('data-ai-type', 'conclude');
        span.textContent = data.result;
        p.appendChild(span);
        lastPage.appendChild(p);
        reflow(false);
        updateStats();
        setPending({ spanId, type: "conclude" });
      }
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [getAllText, callAI, reflow, updateStats, pendingAiInsert]);

  const handleAnalyze = useCallback(async () => {
    setAiDropdownOpen(false);
    setAiPanelOpen(true);
    setAiLoading(true);
    setAiAnalysis(null);
    setShowExplanations(false);
    clearHighlights();

    try {
      const fullText = getAllText();
      const data = await callAI("analyze", fullText);
      setAiAnalysis(data);

      const colorMap = dark
        ? {
            "rgba(200,130,0,0.7)":    data.spam_phrases || [],
            "rgba(20,100,210,0.65)":  data.water_phrases || [],
            "rgba(150,30,180,0.65)":  data.speech_error_phrases || [],
            "rgba(200,20,20,0.65)":   data.grammar_error_phrases || [],
          }
        : {
            "#ffe08a": data.spam_phrases || [],
            "#b3e5fc": data.water_phrases || [],
            "#e1bee7": data.speech_error_phrases || [],
            "#ffcdd2": data.grammar_error_phrases || [],
          };
      highlightPhrases(colorMap);

      const categories = ['spam', 'water', 'speech_error', 'grammar_error'];
      for (const cat of categories) {
        if (data[`${cat}_phrases`]?.length > 0) {
          setExplanations({
            category: cat,
            loading: false,
            data: data[`${cat}_explanations`] || {},
          });
          break;
        }
      }
    } catch (e) {
      alert("Ошибка анализа: " + e.message);
      setAiPanelOpen(false);
    } finally {
      setAiLoading(false);
    }
  }, [getAllText, callAI, dark]);

  const handleImprove = useCallback(async () => {
    setAiLoading(true);
    try {
      const fullText = getAllText();
      const textToSend = fullText.length > 8000 ? fullText.slice(0, 8000) : fullText;
      const data = await callAI("improve", textToSend);
      setAiAnalysis(prev => ({ ...prev, improve: data.result }));
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [getAllText, callAI]);

  const highlightPhrases = useCallback((phrasesMap) => {
    const highlightInElement = (element, phrase, color) => {
      if (!phrase || phrase.length < 3) return;

      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node.parentElement?.classList?.contains('ai-highlight')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const nodesToReplace = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        const lowerPhrase = phrase.toLowerCase();
        let index = lowerText.indexOf(lowerPhrase);

        while (index !== -1) {
          nodesToReplace.push({
            node,
            start: index,
            end: index + phrase.length,
            matchText: text.substring(index, index + phrase.length)
          });
          index = lowerText.indexOf(lowerPhrase, index + 1);
        }
      }

      nodesToReplace.sort((a, b) => {
        if (a.node !== b.node) return 0;
        return b.start - a.start;
      });

      const processedNodes = new Set();
      nodesToReplace.forEach(({ node, start, end, matchText }) => {
        if (processedNodes.has(node)) return;

        const before = node.textContent.slice(0, start);
        const after = node.textContent.slice(end);

        const span = document.createElement("span");
        span.className = "ai-highlight";
        span.style.backgroundColor = color;
        span.style.borderRadius = "3px";
        span.style.padding = "0 2px";
        span.textContent = matchText;

        const parent = node.parentNode;
        if (parent) {
          const frag = document.createDocumentFragment();
          if (before) frag.appendChild(document.createTextNode(before));
          frag.appendChild(span);
          if (after) frag.appendChild(document.createTextNode(after));
          parent.replaceChild(frag, node);
          processedNodes.add(node);
        }
      });
    };

    pageRefs.current.filter(Boolean).forEach(page => {
      page.querySelectorAll(".ai-highlight").forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
      });
      page.normalize();

      Object.entries(phrasesMap).forEach(([color, phrases]) => {
        phrases.forEach(phrase => {
          highlightInElement(page, phrase, color);
        });
      });
    });

    setAiHighlights(true);
  }, []);

  const clearHighlights = useCallback(() => {
    pageRefs.current.filter(Boolean).forEach(page => {
      page.querySelectorAll(".ai-highlight").forEach(el => {
        el.replaceWith(document.createTextNode(el.textContent));
      });
      page.normalize();
    });
    setAiHighlights(false);
  }, []);

  const closeAiPanel = useCallback(() => {
    clearHighlights();
    setAiPanelOpen(false);
    setAiPanelCollapsed(false);
    setAiAnalysis(null);
    setExplanations(null);
    setShowExplanations(false);
  }, [clearHighlights]);

  const handleExplain = useCallback((category) => {
    if (!aiAnalysis) return;
    setExplanations({
      category,
      loading: false,
      data: aiAnalysis[`${category}_explanations`] || {},
    });
    setShowExplanations(true);
  }, [aiAnalysis]);

  const findSentenceEndRanges = useCallback((blockEl, cursorNode, cursorOffset) => {
    const textNodes = [];
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = walker.nextNode())) textNodes.push(tn);
    if (!textNodes.length) return null;

    let cursorAbs = 0;
    let acc = 0;
    let found = false;
    for (const n of textNodes) {
      if (n === cursorNode) { cursorAbs = acc + cursorOffset; found = true; break; }
      acc += n.length;
    }
    if (!found) cursorAbs = blockEl.textContent.length;

    const fullText = blockEl.textContent;

    let sentEndAbs = fullText.length;
    for (let i = cursorAbs; i < fullText.length; i++) {
      const c = fullText[i];
      if (c === '.' || c === '!' || c === '?' || c === '\u2026') {
        const nxt = fullText[i + 1];
        if (!nxt || nxt === ' ' || nxt === '\n' || nxt === '"' || nxt === '\u00bb' || nxt === '\u201d') {
          sentEndAbs = i + 1;
          break;
        }
      }
    }

    const makeRangeAt = (pos) => {
      let a = 0;
      for (const n of textNodes) {
        const len = n.length;
        if (a + len >= pos) {
          const off = Math.min(pos - a, len);
          const r = document.createRange();
          r.setStart(n, off);
          r.collapse(true);
          return r;
        }
        a += len;
      }
      const r = document.createRange();
      r.selectNodeContents(blockEl);
      r.collapse(false);
      return r;
    };

    const insertRange = makeRangeAt(sentEndAbs);

    let displayRange;
    if (sentEndAbs > 0 && sentEndAbs <= fullText.length) {
      displayRange = makeRangeAt(sentEndAbs - 1);
      try {
        const r2 = displayRange.cloneRange();
        r2.setEnd(displayRange.startContainer,
                  Math.min(displayRange.startOffset + 1, displayRange.startContainer.length));
        displayRange = r2;
      } catch (_) {}
    } else {
      displayRange = insertRange.cloneRange();
    }

    return { displayRange, insertRange };
  }, []);

  const showContinueButtonCallback = useCallback(() => {
  }, []);

    const handleContinueText = useCallback(async () => {
      if (!continueBtn || !continueRangeRef.current) return;

      const savedParagraph = continueBtn.paragraphText;
      const savedRange = continueRangeRef.current.cloneRange();
      setContinueBtn(null);
      setContinueLoading(true);

      try {
        const t = localStorage.getItem('access_token') || token;
        const fullText = getAllText();
        const res = await fetch('/api/ai/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({
            text: fullText,
            current_paragraph: savedParagraph,
            genre: projectGenre || null,
            project_id: projectId,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const continuation = data.result?.trim();
        if (!continuation) return;

        if (savedRange.startContainer.isConnected) {
          const sel2 = window.getSelection();
          sel2.removeAllRanges();
          sel2.addRange(savedRange);

          if (pendingAiInsert) {
            const old = document.getElementById(pendingAiInsert.spanId);
            if (old) old.closest('p')?.remove() || old.remove();
            setPending(null);
          }

          const spanId = 'ai-pending-' + Date.now();
          const nodeText = savedRange.startContainer.textContent || '';
          const atOffset = savedRange.startOffset;
          const needSpace = atOffset > 0 && nodeText[atOffset - 1] !== ' ' && nodeText[atOffset - 1] !== '\n';
          const spanHtml = `<span id="${spanId}" class="ai-pending" data-ai-type="continue">${needSpace ? ' ' : ''}${continuation}</span>`;
          document.execCommand('insertHTML', false, spanHtml);

          reflow(false);
          updateStats();
          setPending({ spanId, type: "continue" });
        }
      } catch (e) {
        console.error('Continue error:', e);
        alert('Ошибка продолжения текста: ' + e.message);
      } finally {
        setContinueLoading(false);
      }
    }, [continueBtn, getAllText, reflow, updateStats, token, projectGenre, pendingAiInsert]);
  useEffect(() => {
    const onScroll = () => { setContinueBtn(null); };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  useEffect(() => {
    return () => clearTimeout(idleTimerRef.current);
  }, []);

  const acceptPendingAi = useCallback(() => {
    const pending = pendingAiInsertRef.current;
    if (!pending) return;

    let el = document.getElementById(pending.spanId);
    if (!el) {
      for (const page of pageRefs.current) {
        if (!page) continue;
        el = page.querySelector('.ai-pending');
        if (el) break;
      }
    }

    if (el) {
      const parent = el.parentNode;
      if (parent) {
        const textNode = document.createTextNode(el.textContent);
        parent.replaceChild(textNode, el);
        parent.normalize();
      }
    }

    setPending(null);
    reflow(false);
    updateStats();
    setSaveStatus('unsaved');
    saveContent(getAllContent());
    snapshotLater();
  }, [setPending, reflow, updateStats, saveContent, getAllContent, snapshotLater]);

  const acceptPendingAiRef = useRef(null);
  acceptPendingAiRef.current = acceptPendingAi;

  const rejectPendingAi = useCallback(() => {
    const pending = pendingAiInsertRef.current;
    if (!pending) return;
    let el = document.getElementById(pending.spanId);
    if (!el) {
      for (const page of pageRefs.current) {
        if (!page) continue;
        el = page.querySelector('.ai-pending') || null;
        if (el) break;
      }
    }
    if (el) {
      const parentP = el.parentElement;
      el.remove();
      if (parentP && parentP.tagName === 'P' && !parentP.textContent.trim()) {
        parentP.remove();
      }
    }
    setPending(null);
    reflow(false);
    updateStats();
  }, [setPending, reflow, updateStats]);

  useEffect(() => {
    const handleMouseUp = (e) => {
      if (e.target.closest?.('[data-continue-btn]')) return;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          return;
        }

        const selRange = sel.getRangeAt(0);
        let inEditor = false;
        for (const page of pageRefs.current) {
          if (page && page.contains(selRange.startContainer)) { inEditor = true; break; }
        }
        if (!inEditor) return;

        const selectedText = sel.toString().trim();
        if (selectedText.length < 15) return;

        const rects = selRange.getClientRects();
        if (!rects.length) return;
        const lastRect = rects[rects.length - 1];

        const insertRange = selRange.cloneRange();
        insertRange.collapse(false);
        continueRangeRef.current = insertRange;

        setContinueBtn({
          x: lastRect.right,
          y: lastRect.top,
          paragraphText: selectedText,
        });
      });
    };

    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setTimeout(() => {
          const sel2 = window.getSelection();
          if (!sel2 || sel2.isCollapsed) setContinueBtn(null);
        }, 200);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const sendChatMessage = useCallback(async (presetMsg) => {
    const text = (presetMsg !== undefined ? presetMsg : chatInput).trim();
    if (!text || chatLoading) return;

    const userMsg = { role: 'user', text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const t = localStorage.getItem('access_token') || token;
      const chapterText = getAllText();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          messages: newMessages,
          chapter_text: chapterText.length > 4000 ? chapterText.slice(0, 4000) : chapterText,
          genre: projectGenre || null,
          project_id: projectId,
          chapter_id: chapterIdNum ? parseInt(chapterIdNum) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', text: data.result }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: '⚠ Ошибка: ' + e.message }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [chatMessages, chatInput, chatLoading, getAllText, projectGenre, token]);

  useEffect(() => {
    if (aiHighlights && aiAnalysis) {
      const timer = setTimeout(() => {
        const colorMap = dark
          ? {
              "rgba(200,130,0,0.7)":    aiAnalysis.spam_phrases || [],
              "rgba(20,100,210,0.65)":  aiAnalysis.water_phrases || [],
              "rgba(150,30,180,0.65)":  aiAnalysis.speech_error_phrases || [],
              "rgba(200,20,20,0.65)":   aiAnalysis.grammar_error_phrases || [],
            }
          : {
              "#ffe08a": aiAnalysis.spam_phrases || [],
              "#b3e5fc": aiAnalysis.water_phrases || [],
              "#e1bee7": aiAnalysis.speech_error_phrases || [],
              "#ffcdd2": aiAnalysis.grammar_error_phrases || [],
            };
        highlightPhrases(colorMap);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [pageCount, dark, aiHighlights, aiAnalysis, highlightPhrases]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (aiDropdownRef.current && !aiDropdownRef.current.contains(e.target)) {
        setAiDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const th = {
    barBg: dark ? "#1a1c50" : "#fff",
    barBorder: dark ? "rgba(255,255,255,0.07)" : "#c8d9ec",
    text: dark ? "#e8ecff" : "#2d3f52",
    textMuted: dark ? "#8890cc" : "#6b7c8c",
    badgeBg: dark ? "rgba(255,255,255,0.08)" : "#f0f4f8",
    btnBorder: dark ? "rgba(255,255,255,0.18)" : "#b0c4d8",
    pageBg: dark ? "#2e3170" : "#fff",
    editorText: dark ? "#d8dcf8" : "#2d3f52",
    pageShadow: dark ? "0 2px 20px rgba(0,0,20,0.7)" : "0 4px 20px rgba(80,120,160,0.18)",
  };

  const savedColor =
    saveStatus === "saved" ? (dark ? "#5adf8a" : "#5a9e6a") :
    saveStatus === "saving" ? (dark ? "#8890cc" : "#8fa8c8") : "#c0392b";
  const savedLabel =
    saveStatus === "saved" ? "Сохранено" :
    saveStatus === "saving" ? "Сохранение..." : "Не сохранено";

  const sharedBtnStyle = {
    display: "flex", alignItems: "center", gap: 5, background: "none",
    border: `1px solid ${th.btnBorder}`, color: th.text, fontSize: 13,
    padding: "5px 14px", borderRadius: 20, cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; overflow: hidden; }

        .pg-editor { outline: none; height: 100%; }
        .pg-editor p { margin: 0 0 0.25em; min-height: 1.75em; }
        .pg-editor h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.25em; }
        .pg-editor h2 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.25em; }
        .pg-editor h3 { font-size: 1.17em; font-weight: 700; margin: 0.5em 0 0.25em; }
        .pg-editor a { color: ${dark ? "#a0c0ff" : "#4a6a8a"}; text-decoration: underline; cursor: pointer; }
        .pg-editor a:hover { color: ${dark ? "#c8deff" : "#2d4a6a"}; }
        .pg-editor blockquote {
          border-left: 4px solid ${dark ? "#4547b5" : "#8fa8c8"};
          margin: 0.75em 0; padding: 8px 20px;
          background: ${dark ? "rgba(70,72,180,0.12)" : "#f8fafc"};
          font-style: italic; color: ${dark ? "#9098cc" : "#4a6a8a"};
        }
        .pg-editor ul { list-style-type: disc; padding-left: 22px; margin: 0.25em 0; }
        .pg-editor ol { list-style-type: decimal; padding-left: 22px; margin: 0.25em 0; }
        .pg-editor pre {
          background: ${dark ? "rgba(0,0,50,0.45)" : "#f0f4f8"};
          padding: 12px 16px;
          border-radius: 8px;
          font-family: 'Fira Mono', 'Consolas', monospace;
          font-size: 0.88em;
          color: ${dark ? "#c8e0ff" : "#2d3f52"};
          border: 1px solid ${dark ? "rgba(100,120,255,0.18)" : "#d0dcea"};
          overflow-x: auto;
          white-space: pre;
          margin: 0.5em 0;
          line-height: 1.6;
        }

        .page-num {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          font-size: 11px; color: ${dark ? "rgba(180,190,255,0.35)" : "#aab8c8"};
          font-family: 'Nunito', sans-serif; pointer-events: none; user-select: none;
        }

        #pg-sizer {
          position: fixed; top: -9999px; left: -9999px;
          width: ${CONTENT_W}px; visibility: hidden; pointer-events: none;
          font-family: 'Nunito', sans-serif; font-size: 16px; line-height: 1.75;
          word-break: break-word; overflow-wrap: break-word;
        }
        #pg-sizer p { margin: 0 0 0.25em; }
        #pg-sizer h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.25em; }
        #pg-sizer h2 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.25em; }
        #pg-sizer h3 { font-size: 1.17em; font-weight: 700; margin: 0.5em 0 0.25em; }
        #pg-sizer blockquote { border-left: 4px solid #8fa8c8; margin: 0.75em 0; padding: 8px 20px; }
        #pg-sizer ul { list-style-type: disc; padding-left: 22px; margin: 0.25em 0; }
        #pg-sizer ol { list-style-type: decimal; padding-left: 22px; margin: 0.25em 0; }
        #pg-sizer pre { padding: 10px; font-family: monospace; }

        .title-btn:hover { background: ${dark ? "rgba(255,255,255,0.07)" : "#f0f6ff"} !important; }
        .title-btn:hover .edit-hint { opacity: 1 !important; }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideInRight {
          from { transform: translateX(360px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeInContinue {
          from { opacity: 0; transform: translateY(4px) scale(.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .ai-pending {
          color: ${dark ? "#8890cc" : "#9aaabf"};
          background: ${dark ? "rgba(100,110,220,0.10)" : "rgba(90,110,180,0.07)"};
          border-radius: 3px;
          border-bottom: 1.5px dashed ${dark ? "#5560b8" : "#8fa8c8"};
          font-style: italic;
          cursor: default;
          user-select: none;
          transition: background .15s;
        }
        .ai-pending:hover {
          background: ${dark ? "rgba(100,110,220,0.18)" : "rgba(90,110,180,0.13)"};
        }
        .ai-pending::after {
          content: ' ⇥';
          font-size: 10px;
          font-style: normal;
          opacity: 0.55;
          letter-spacing: 0.5px;
          padding: 1px 4px;
          background: ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"};
          border-radius: 3px;
          margin-left: 4px;
        }

        .ai-chat-input {
          resize: none;
          border-radius: 10px;
          border: 1px solid ${dark ? "rgba(255,255,255,0.14)" : "#b0c8e4"};
          background: ${dark ? "rgba(255,255,255,0.05)" : "#fff"};
          color: ${dark ? "#e0e4ff" : "#2d3f52"};
          padding: 8px 12px;
          font-size: 13px;
          font-family: 'Nunito', sans-serif;
          outline: none;
          flex: 1;
          line-height: 1.5;
          transition: border-color .15s;
        }
        .ai-chat-input:focus {
          border-color: ${dark ? "rgba(160,170,255,0.4)" : "#8fa8c8"};
        }
        .ai-chat-input::placeholder { color: ${dark ? "#5060a0" : "#a0b4c8"}; }

        @media print {
          body { background: #fff !important; overflow: visible; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="pg-sizer" ref={sizerRef} aria-hidden="true" />

      <div style={{
        height: "100vh", display: "flex", flexDirection: "column",
        fontFamily: "'Nunito', sans-serif", overflow: "hidden", transition: "background .3s",
      }}>
        <div className="no-print" style={{
          height: 48, background: th.barBg, borderBottom: `1px solid ${th.barBorder}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", gap: 12, flexShrink: 0, zIndex: 100,
          transition: "background .3s, border-color .3s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => window.history.back()} title="Назад" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, background: "none", border: "none",
              borderRadius: 8, cursor: "pointer", color: th.textMuted,
              transition: "background .15s, color .15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.1)" : "#f0f4f8"; e.currentTarget.style.color = th.text; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = th.textMuted; }}
            ><Icon d={icons.arrowLeft} size={17} /></button>
            <Dropdown dark={dark} label="Файл" items={[
              "---",
              { label: "Экспорт PDF", action: exportPDF },
              { label: "Печать", action: () => window.print() },
            ]} />
          </div>

          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                style={{
                  fontSize: 14, fontWeight: 600, fontFamily: "'Nunito', sans-serif",
                  color: th.text, background: dark ? "rgba(255,255,255,0.07)" : "#f0f6ff",
                  border: `1.5px solid ${dark ? "#4547b5" : "#8fa8c8"}`,
                  borderRadius: 8, padding: "3px 12px", outline: "none",
                  minWidth: 200, textAlign: "center",
                }}
              />
            ) : (
              <button className="title-btn" onClick={startEditTitle}
                title="Нажмите, чтобы переименовать главу"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 600, color: th.text,
                  background: "none", border: "none", fontFamily: "'Nunito', sans-serif",
                  cursor: "text", padding: "3px 8px", borderRadius: 6, transition: "background .15s",
                }}
              >
                {chapterTitle}
                <span className="edit-hint" style={{ opacity: 0, color: th.textMuted, transition: "opacity .15s", lineHeight: 0 }}>
                  <Icon d={icons.pencil} size={12} />
                </span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 12, color: th.textMuted, background: th.badgeBg,
              padding: "3px 10px", borderRadius: 20, fontWeight: 500, whiteSpace: "nowrap",
            }}>{pageCount} стр · {stats.words} слов · {stats.chars} симв</span>
            <span style={{ fontSize: 12, color: savedColor, whiteSpace: "nowrap" }}>{savedLabel}</span>
            <button onClick={manualSave} style={sharedBtnStyle}>
              <Icon d={icons.save} size={13} /> Сохранить
            </button>
            <button onClick={exportPDF} style={sharedBtnStyle}>
              <Icon d={icons.download} size={13} /> PDF
            </button>
            <DarkToggle dark={dark} onToggle={() => setDark(d => !d)} />
          </div>
        </div>

        <div className="no-print" style={{
          background: th.barBg, borderBottom: `1px solid ${th.barBorder}`,
          display: "flex", alignItems: "center",
          padding: "0 16px", gap: 2, minHeight: 42, flexShrink: 0,
          overflow: "visible",
          transition: "background .3s, border-color .3s", zIndex: 99,
        }}>
          <TBtn dark={dark} title="Отменить (Ctrl+Z)" onClick={undo}>
            <span style={{ fontSize: 18, fontWeight: 500 }}>↶</span>
          </TBtn>
          <TBtn dark={dark} title="Повторить (Ctrl+Shift+Z)" onClick={redo}>
            <span style={{ fontSize: 18, fontWeight: 500 }}>↷</span>
          </TBtn>
          <Sep dark={dark} />

          <FormatSelect dark={dark} onBeforeApply={beforeFormat} />
          <Sep dark={dark} />

          <TBtn dark={dark} title="Жирный" cmd="bold" onBefore={beforeFormat}><Icon d={icons.bold} /></TBtn>
          <TBtn dark={dark} title="Курсив" cmd="italic" onBefore={beforeFormat}><Icon d={icons.italic} /></TBtn>
          <TBtn dark={dark} title="Подчёркнутый" cmd="underline" onBefore={beforeFormat}><Icon d={icons.underline} /></TBtn>
          <TBtn dark={dark} title="Зачёркнутый" cmd="strikeThrough" onBefore={beforeFormat}>
            <span style={{ fontSize: 15, fontWeight: 700, textDecoration: "line-through", fontFamily: "serif", color: "inherit" }}>S</span>
          </TBtn>
          <Sep dark={dark} />

          <TBtn dark={dark} title="Ссылка" onClick={() => {
            beforeFormat();
            const url = prompt("Введите URL:");
            if (url) {
              document.execCommand("createLink", false, url);
              const sel = window.getSelection();
              if (sel?.rangeCount > 0) {
                const node = sel.getRangeAt(0).commonAncestorContainer.parentElement;
                if (node?.tagName === "A") node.setAttribute("target", "_blank");
              }
            }
          }}><Icon d={icons.link} /></TBtn>
          <Sep dark={dark} />

          <TBtn dark={dark} title="Код (повторно — убрать)"
                onClick={() => { beforeFormat(); toggleBlock("pre"); }}>
            <Icon d={icons.code} />
          </TBtn>
          <TBtn dark={dark} title="Цитата (повторно — убрать)"
                onClick={() => { beforeFormat(); toggleBlock("blockquote"); }}>
            <Icon d={icons.quote} />
          </TBtn>
          <Sep dark={dark} />

          <TBtn dark={dark} title="Маркированный список" cmd="insertUnorderedList" onBefore={beforeFormat}><Icon d={icons.ul} /></TBtn>
          <TBtn dark={dark} title="Нумерованный список" cmd="insertOrderedList" onBefore={beforeFormat}><Icon d={icons.ol} /></TBtn>
          <Sep dark={dark} />

          <TBtn dark={dark} title="По левому краю" cmd="justifyLeft" onBefore={beforeFormat}><Icon d={icons.alignL} /></TBtn>
          <TBtn dark={dark} title="По центру" cmd="justifyCenter" onBefore={beforeFormat}><Icon d={icons.alignC} /></TBtn>
          <TBtn dark={dark} title="По правому краю" cmd="justifyRight" onBefore={beforeFormat}><Icon d={icons.alignR} /></TBtn>
          <TBtn dark={dark} title="По ширине" cmd="justifyFull" onBefore={beforeFormat}><Icon d={icons.alignJ} /></TBtn>
          <Sep dark={dark} />

          <div ref={aiDropdownRef} style={{ position: "relative", marginLeft: 4 }}>
            <button
              onClick={() => setAiDropdownOpen(o => !o)}
              disabled={aiLoading}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: dark
                  ? (aiDropdownOpen ? "#3b3caa" : "#2b2c7f")
                  : (aiDropdownOpen ? "#7a98b8" : "#8fa8c8"),
                border: "none", color: "#fff", fontSize: 13, padding: "5px 14px",
                borderRadius: 20, cursor: aiLoading ? "not-allowed" : "pointer",
                fontFamily: "'Nunito', sans-serif",
                boxShadow: dark ? "0 2px 8px rgba(43,44,127,0.5)" : "0 2px 8px rgba(122,150,184,0.4)",
                fontWeight: 600, flexShrink: 0,
                opacity: aiLoading ? 0.7 : 1, transition: "all .15s",
              }}
            >
              {aiLoading
                ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                : <Icon d={icons.sparkle} size={14} />
              }
              Ask AI
              <Icon d={icons.chevron} size={10} />
            </button>

            {aiDropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: dark ? "#1a1b50" : "#fff",
                border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#c8d9ec"}`,
                borderRadius: 12, padding: 6, zIndex: 9999, minWidth: 210,
                boxShadow: dark ? "0 12px 40px rgba(10,12,60,0.7)" : "0 12px 40px rgba(100,140,180,0.18)",
              }}>
                {[
                  { label: "Написать введение", action: handleIntroduce },
                  { label: "Написать заключение", action: handleConclude },
                  { label: "Анализ текста", action: handleAnalyze },
                ].map(item => (
                  <button key={item.label}
                    onClick={item.action}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: "none", border: "none", padding: "9px 14px",
                      cursor: "pointer", fontSize: 13, borderRadius: 8,
                      color: dark ? "#e0e4ff" : "#2d3f52",
                      fontFamily: "'Nunito', sans-serif", fontWeight: 600,
                      transition: "background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.08)" : "#f0f6ff"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >{item.label}</button>
                ))}
              </div>
            )}
          </div>

          {aiHighlights && (
            <button
              onClick={clearHighlights}
              style={{
                display: "flex", alignItems: "center", gap: 5, marginLeft: 6,
                background: dark ? "#3a0a0a" : "#ffcdd2",
                border: "none", color: dark ? "#ff9999" : "#c62828",
                fontSize: 13, padding: "5px 14px", borderRadius: 20,
                cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                fontWeight: 600, flexShrink: 0, transition: "opacity .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              ✕ Очистить
            </button>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{
            flex: 1, minWidth: 0, overflowY: "auto",
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "40px 20px 80px",
            ...(dark ? {
              backgroundImage: `linear-gradient(rgba(15,17,55,0.58),rgba(15,17,55,0.58)),url('${BG_URL}')`,
              backgroundSize: "cover", backgroundPosition: "center",
              backgroundRepeat: "no-repeat", backgroundAttachment: "local",
            } : { background: "#dce8f5" }),
            transition: "background .3s",
          }}>
            {Array.from({ length: pageCount }, (_, i) => (
              <div key={i} style={{
                position: "relative", width: PAGE_W, height: PAGE_H,
                background: th.pageBg, boxShadow: th.pageShadow,
                border: "none", marginBottom: 32, flexShrink: 0,
                overflow: "hidden", borderRadius: 2,
                transition: "background .3s, box-shadow .3s",
              }}>
                <div
                  ref={el => { pageRefs.current[i] = el; }}
                  className="pg-editor"
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    position: "absolute",
                    top: PAD_V, left: PAD_H, right: PAD_H, bottom: PAD_V,
                    fontSize: 16, lineHeight: 1.75,
                    color: th.editorText, fontFamily: "'Nunito', sans-serif",
                    cursor: "text", overflowWrap: "break-word", wordBreak: "break-word",
                    overflow: "hidden", transition: "color .3s",
                  }}
                  onInput={handleInput}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onClick={handleEditorClick}
                />
                <div className="page-num">{i + 1}</div>
              </div>
            ))}
          </div>

          {aiPanelOpen && (
            <>
              {aiPanelCollapsed && (
                <div style={{
                  flex: "0 0 44px", width: 44, overflowY: "hidden",
                  background: dark ? "#13144a" : "#f0f6ff",
                  borderLeft: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#c8d9ec"}`,
                  display: "flex", flexDirection: "column", alignItems: "center",
                  paddingTop: 14, gap: 10,
                }}>
                  <button
                    onClick={() => setAiPanelCollapsed(false)}
                    title="Развернуть панель"
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: dark ? "#8090c0" : "#8fa8c8", padding: 6, borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.08)" : "#e0eef8"; e.currentTarget.style.color = dark ? "#c0caff" : "#2d3f52"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = dark ? "#8090c0" : "#8fa8c8"; }}
                  >
                    <Icon d={icons.panelExpand} size={18} />
                  </button>
                  {aiHighlights && (
                    <div title="Текст размечен" style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", marginTop: 4 }} />
                  )}
                </div>
              )}

              {!aiPanelCollapsed && (
            <div style={{
              flex: "0 0 50%", width: "50%", overflowY: "auto",
              background: dark ? "#13144a" : "#f0f6ff",
              borderLeft: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#c8d9ec"}`,
              padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20,
              animation: "slideInRight .3s ease-out",
              position: "relative",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  fontSize: 15, fontWeight: 700,
                  color: dark ? "#e0e4ff" : "#2d3f52",
                  fontFamily: "'Nunito', sans-serif",
                }}>
                  Анализ текста
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => setAiPanelCollapsed(true)}
                    title="Свернуть панель"
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: dark ? "#8090c0" : "#8fa8c8", fontSize: 18, lineHeight: 1, padding: "4px 6px",
                      borderRadius: 6, display: "flex", alignItems: "center",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = dark ? "#c0caff" : "#2d3f52"; e.currentTarget.style.background = dark ? "rgba(255,255,255,0.06)" : "#e8f0f8"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = dark ? "#8090c0" : "#8fa8c8"; e.currentTarget.style.background = "none"; }}
                  >
                    <Icon d={icons.panelCollapse} size={16} />
                  </button>
                  <button onClick={closeAiPanel} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: dark ? "#8090c0" : "#8fa8c8", fontSize: 18, lineHeight: 1, padding: 4,
                  }}>✕</button>
                </div>
              </div>

              {aiLoading && !aiAnalysis && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    border: `3px solid ${dark ? "rgba(160,170,255,0.2)" : "rgba(100,140,200,0.2)"}`,
                    borderTopColor: dark ? "#a0aaff" : "#5b8ab0",
                    animation: "spin 1s linear infinite", margin: "0 auto 16px",
                  }} />
                  <p style={{
                    color: dark ? "#8090c0" : "#8fa8c8", fontSize: 13,
                    fontFamily: "'Nunito', sans-serif", margin: 0,
                  }}>
                    ИИ анализирует текст...
                  </p>
                </div>
              )}

              {aiAnalysis && !aiAnalysis.error && (
                <>
                  {[
                    { key: "spam", label: "Заспамленность", color: dark ? "#e8a000" : "#f59e0b", bg: dark ? "rgba(230,160,0,0.35)" : "#ffe08a" },
                    { key: "water", label: "Водность", color: dark ? "#42a5f5" : "#1e88e5", bg: dark ? "rgba(66,165,245,0.32)" : "#b3e5fc" },
                    { key: "speech_errors", label: "Речевые ошибки", color: dark ? "#ce93d8" : "#9c27b0", bg: dark ? "rgba(186,104,200,0.35)" : "#e1bee7" },
                    { key: "grammar_errors", label: "Грамматика", color: dark ? "#ef9a9a" : "#e53935", bg: dark ? "rgba(239,83,80,0.35)" : "#ffcdd2" },
                  ].map(item => {
                    const val = Math.min(100, Math.max(0, aiAnalysis[item.key] ?? 0));
                    return (
                      <div key={item.key}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: dark ? "#c0caff" : "#2d3f52",
                            fontFamily: "'Nunito', sans-serif",
                          }}>
                            <span style={{
                              display: "inline-block", width: 12, height: 12,
                              borderRadius: 3, background: item.bg,
                              marginRight: 6, verticalAlign: "middle",
                              border: dark ? "1px solid rgba(255,255,255,0.15)" : "none",
                            }} />
                            {item.label}
                          </span>
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: item.color,
                            fontFamily: "'Nunito', sans-serif",
                          }}>{val}%</span>
                        </div>
                        <div style={{
                          height: 8, borderRadius: 6,
                          background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 6,
                            width: `${val}%`,
                            background: item.color,
                            transition: "width 1s ease-out",
                            boxShadow: `0 0 8px ${item.color}60`,
                          }} />
                        </div>
                      </div>
                    );
                  })}

                  {(() => {
                    const issues = aiAnalysis?.consistency_issues;
                    if (!issues || !issues.length) return null;
                    return (
                      <>
                        <button
                          onClick={() => setConsistencyOpen(v => !v)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            width: "100%",
                            background: dark ? "rgba(255,140,0,0.15)" : "#fff3e0",
                            border: `1px solid ${dark ? "rgba(255,160,0,0.3)" : "#ffcc80"}`,
                            borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                            fontSize: 13, fontWeight: 700,
                            color: dark ? "#c0caff" : "#2d3f52",
                            fontFamily: "'Nunito', sans-serif",
                            transition: "background .12s",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span>⚠️</span>
                            <span>Соответствие персонажам ({issues.length})</span>
                          </span>
                          <span style={{ fontSize: 11, opacity: 0.6 }}>{consistencyOpen ? "▲" : "▼"}</span>
                        </button>
                        {consistencyOpen && (
                          <div style={{
                            background: dark ? "rgba(255,255,255,0.03)" : "#f7fbff",
                            border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#c8d9ec"}`,
                            borderRadius: 12, padding: "12px 14px",
                            display: "flex", flexDirection: "column", gap: 8,
                          }}>
                            {issues.map((issue, idx) => (
                              <div key={idx} style={{
                                background: dark ? "rgba(255,140,0,0.1)" : "#fff8f0",
                                border: `1px solid ${dark ? "rgba(255,160,0,0.2)" : "#ffe0b2"}`,
                                borderRadius: 8, padding: "8px 12px",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700,
                                    color: dark ? "#ffa040" : "#e65100",
                                    fontFamily: "'Nunito', sans-serif",
                                    background: dark ? "rgba(255,160,0,0.15)" : "#ffe0b2",
                                    borderRadius: 5, padding: "1px 7px" }}>
                                    {issue.character || "Персонаж"}
                                  </span>
                                  {issue.found_in_text === false && (
                                    <span style={{ fontSize: 10, color: "rgba(130,150,190,0.8)",
                                      fontFamily: "'Nunito', sans-serif" }}>не упомянут в тексте</span>
                                  )}
                                </div>
                                <p style={{ fontSize: 12, margin: 0, lineHeight: 1.6,
                                  color: dark ? "#c0a878" : "#5d4037",
                                  fontFamily: "'Nunito', sans-serif" }}>
                                  {issue.issue}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <button
                    onClick={() => setShowExplanations(v => !v)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", background: dark ? "rgba(255,255,255,0.05)" : "#e8f0f8",
                      border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#c8d9ec"}`,
                      borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                      fontSize: 13, fontWeight: 700,
                      color: dark ? "#c0caff" : "#2d3f52",
                      fontFamily: "'Nunito', sans-serif",
                      transition: "background .12s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.1)" : "#d8e8f4"}
                    onMouseLeave={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "#e8f0f8"}
                  >
                    <span>Пояснения к выделениям</span>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{showExplanations ? "▲" : "▼"}</span>
                  </button>

                  {showExplanations && (
                    <div style={{
                      background: dark ? "rgba(255,255,255,0.03)" : "#f7fbff",
                      border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#c8d9ec"}`,
                      borderRadius: 12,
                      minHeight: 280, height: 280, overflow: "hidden",
                      display: "flex", flexDirection: "column",
                      flexShrink: 0,
                    }}>
                      <div style={{
                        display: "flex", borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#d0e4f4"}`,
                        padding: "0 6px", flexShrink: 0, overflowX: "auto",
                      }}>
                        {[
                          { key: "spam", short: "🟡 Спам" },
                          { key: "water", short: "🔵 Вода" },
                          { key: "speech_error", short: "🟣 Речь" },
                          { key: "grammar_error", short: "🔴 Грамм" },
                        ].map(tab => {
                          const isActive = explanations?.category === tab.key;
                          const hasPhrases = aiAnalysis?.[`${tab.key}_phrases`]?.length > 0;
                          return (
                            <button
                              key={tab.key}
                              onClick={() => handleExplain(tab.key)}
                              disabled={!hasPhrases}
                              style={{
                                background: "none", border: "none", cursor: hasPhrases ? "pointer" : "not-allowed",
                                padding: "8px 10px", fontSize: 11, fontWeight: isActive ? 700 : 500,
                                color: isActive ? (dark ? "#a0aaff" : "#2d3f52") : (dark ? "#7080b0" : "#8fa8c8"),
                                fontFamily: "'Nunito', sans-serif",
                                borderBottom: isActive ? `2px solid ${dark ? "#a0aaff" : "#4a6a8a"}` : "2px solid transparent",
                                marginBottom: -1, whiteSpace: "nowrap", transition: "color .12s",
                                opacity: hasPhrases ? 1 : 0.5,
                              }}
                            >{tab.short}</button>
                          );
                        })}
                      </div>

                      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
                        {!explanations && (
                          <p style={{
                            fontSize: 12, color: dark ? "#7080b0" : "#8fa8c8",
                            fontFamily: "'Nunito', sans-serif", margin: 0, lineHeight: 1.6,
                          }}>
                            Выбери категорию выше, чтобы увидеть пояснения к выделениям
                          </p>
                        )}

                        {explanations?.data && Object.keys(explanations.data).length > 0 ? (
                          Object.entries(explanations.data)
                            .filter(([phrase]) => {
                              const catPhrases = aiAnalysis?.[`${explanations.category}_phrases`] || [];
                              return catPhrases.some(p => p.toLowerCase() === phrase.toLowerCase());
                            })
                            .map(([phrase, explanation]) => (
                              <div key={phrase} style={{ marginBottom: 12 }}>
                                <div style={{
                                  fontSize: 12, fontWeight: 700,
                                  color: dark ? "#d0d8ff" : "#2d3f52",
                                  fontFamily: "'Nunito', sans-serif",
                                  background: dark ? "rgba(255,255,255,0.06)" : "#e8f0f8",
                                  borderRadius: 6, padding: "3px 8px", display: "inline-block",
                                  marginBottom: 4,
                                }}>«{phrase}»</div>
                                <p style={{
                                  fontSize: 12, margin: 0, lineHeight: 1.6,
                                  color: dark ? "#9098cc" : "#4a6a8a",
                                  fontFamily: "'Nunito', sans-serif",
                                }}>{explanation}</p>
                              </div>
                            ))
                        ) : (
                          <p style={{
                            fontSize: 12, color: dark ? "#7080b0" : "#8fa8c8",
                            fontFamily: "'Nunito', sans-serif", margin: 0, lineHeight: 1.6,
                          }}>
                            {explanations?.category ?
                              `Нет пояснений для категории "${explanations.category}"` :
                              "Выбери категорию выше"}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <hr style={{
                    border: "none",
                    borderTop: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#d0e4f4"}`,
                    margin: "4px 0",
                  }} />

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setChatPanelOpen(true)}
                      title="Открыть чат с ИИ"
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        background: dark ? "rgba(69,71,181,0.25)" : "#e0eef8",
                        border: `1px solid ${dark ? "rgba(130,140,255,0.25)" : "#b0cce0"}`,
                        borderRadius: 20, padding: "7px 16px",
                        cursor: "pointer", fontSize: 13, fontWeight: 600,
                        color: dark ? "#c0caff" : "#4a6a8a",
                        fontFamily: "'Nunito', sans-serif",
                        transition: "background .15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(69,71,181,0.45)" : "#c8ddf0"}
                      onMouseLeave={e => e.currentTarget.style.background = dark ? "rgba(69,71,181,0.25)" : "#e0eef8"}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}></span>
                      Спросить ИИ
                    </button>
                  </div>
                </>
              )}

              {aiAnalysis?.error && (
                <p style={{
                  color: "#e57373", fontSize: 13,
                  fontFamily: "'Nunito', sans-serif",
                }}>
                  {aiAnalysis.error}
                </p>
              )}

              {chatPanelOpen && (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 10,
                  background: dark ? "#13144a" : "#f0f6ff",
                  display: "flex", flexDirection: "column",
                  padding: "18px 20px 16px",
                  animation: "slideInRight .2s ease-out",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}></span>
                      <span style={{
                        fontSize: 15, fontWeight: 700,
                        color: dark ? "#c8d0ff" : "#2d3f52",
                        fontFamily: "'Nunito', sans-serif",
                      }}>Чат с ИИ-ассистентом</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {chatMessages.length > 0 && (
                        <button onClick={() => setChatMessages([])} style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 12, color: dark ? "#6070a0" : "#a0b4c8",
                          fontFamily: "'Nunito', sans-serif", padding: "3px 8px",
                          borderRadius: 6,
                        }}
                          onMouseEnter={e => e.currentTarget.style.color = dark ? "#a0aaff" : "#4a6a8a"}
                          onMouseLeave={e => e.currentTarget.style.color = dark ? "#6070a0" : "#a0b4c8"}
                        >очистить</button>
                      )}
                      <button onClick={() => setChatPanelOpen(false)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 18, lineHeight: 1, color: dark ? "#6070a0" : "#8fa8c8",
                        padding: "2px 6px", borderRadius: 6,
                      }}
                        onMouseEnter={e => e.currentTarget.style.color = dark ? "#c0caff" : "#2d3f52"}
                        onMouseLeave={e => e.currentTarget.style.color = dark ? "#6070a0" : "#8fa8c8"}
                        title="Закрыть чат"
                      >←</button>
                    </div>
                  </div>

                  <div style={{
                    flex: 1, overflowY: "auto", display: "flex",
                    flexDirection: "column", gap: 10, paddingRight: 4,
                    marginBottom: 12,
                  }}>
                    {chatMessages.length === 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{
                          fontSize: 12, color: dark ? "#6070a0" : "#8fa8c8",
                          fontFamily: "'Nunito', sans-serif", margin: "0 0 6px",
                        }}>Быстрые вопросы:</p>
                        {[
                          "Как улучшить этот текст?",
                          "Что убрать из текста?",
                          "Проблемы со стилем?",
                          "Как лучше начать главу?",
                          "Что не хватает этой главе?",
                        ].map(q => (
                          <button key={q} onClick={() => sendChatMessage(q)}
                            disabled={chatLoading}
                            style={{
                              background: dark ? "rgba(255,255,255,0.05)" : "#e8f0f8",
                              border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#c8d9ec"}`,
                              borderRadius: 10, padding: "9px 14px", cursor: "pointer",
                              fontSize: 13, color: dark ? "#c0caff" : "#4a6a8a",
                              fontFamily: "'Nunito', sans-serif",
                              textAlign: "left", transition: "background .12s", fontWeight: 500,
                              opacity: chatLoading ? 0.5 : 1,
                            }}
                            onMouseEnter={e => { if (!chatLoading) e.currentTarget.style.background = dark ? "rgba(255,255,255,0.1)" : "#d8e8f4"; }}
                            onMouseLeave={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "#e8f0f8"}
                          >{q}</button>
                        ))}
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} style={{
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "92%",
                        background: msg.role === "user"
                          ? (dark ? "rgba(69,71,181,0.35)" : "#dbeafe")
                          : (dark ? "rgba(255,255,255,0.05)" : "#f0f6ff"),
                        border: `1px solid ${msg.role === "user"
                          ? (dark ? "rgba(130,140,255,0.25)" : "#bfdbfe")
                          : (dark ? "rgba(255,255,255,0.07)" : "#c8d9ec")}`,
                        borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        padding: "9px 13px",
                        fontSize: 13, lineHeight: 1.65,
                        color: dark ? "#c8d0ff" : "#2d3f52",
                        fontFamily: "'Nunito', sans-serif",
                        whiteSpace: "pre-wrap",
                      }}>{msg.text}</div>
                    ))}
                    {chatLoading && (
                      <div style={{
                        alignSelf: "flex-start",
                        background: dark ? "rgba(255,255,255,0.05)" : "#f0f6ff",
                        border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#c8d9ec"}`,
                        borderRadius: "14px 14px 14px 4px",
                        padding: "9px 16px",
                        fontSize: 13, color: dark ? "#6070a0" : "#8fa8c8",
                        fontFamily: "'Nunito', sans-serif",
                      }}>
                        <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                        {" "}ИИ печатает...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <textarea
                      className="ai-chat-input"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      placeholder="Задай вопрос об этой главе…"
                      rows={2}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={() => sendChatMessage()}
                      disabled={!chatInput.trim() || chatLoading}
                      style={{
                        width: 38, height: 38, flexShrink: 0,
                        background: chatInput.trim() && !chatLoading
                          ? (dark ? "#4547b5" : "#5b8ab0")
                          : (dark ? "rgba(255,255,255,0.07)" : "#d0e4f4"),
                        border: "none", borderRadius: 10,
                        cursor: chatInput.trim() && !chatLoading ? "pointer" : "not-allowed",
                        color: "#fff", fontSize: 18, display: "flex", alignItems: "center",
                        justifyContent: "center", transition: "background .15s",
                      }}
                      title="Отправить"
                    >→</button>
                  </div>
                </div>
              )}
            </div>
              )}
            </>
          )}
        </div>
      </div>

      {!chatPanelOpen && (
        <button
          onClick={() => { setAiPanelOpen(true); setAiPanelCollapsed(false); setChatPanelOpen(true); }}
          title="Спросить ИИ"
          style={{
            position: "fixed", bottom: 28, right: 28, zIndex: 9990,
            display: "flex", alignItems: "center", gap: 8,
            background: dark
              ? "linear-gradient(135deg,#3b3caa,#2b2c7f)"
              : "linear-gradient(135deg,#6a8fb5,#4a6a8a)",
            color: "#fff", border: "none", borderRadius: 28,
            padding: "11px 20px", fontSize: 14, fontWeight: 700,
            fontFamily: "'Nunito', sans-serif", cursor: "pointer",
            boxShadow: dark
              ? "0 6px 24px rgba(43,44,127,0.65)"
              : "0 6px 24px rgba(74,106,138,0.5)",
            transition: "all .18s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = dark ? "0 10px 32px rgba(43,44,127,0.8)" : "0 10px 32px rgba(74,106,138,0.65)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = dark ? "0 6px 24px rgba(43,44,127,0.65)" : "0 6px 24px rgba(74,106,138,0.5)"; }}
        >
          <Icon d={icons.chatBubble} size={16} />
          Спросить ИИ
        </button>
      )}

      {continueBtn && !continueLoading && (
        <button
          data-continue-btn="true"
          onClick={handleContinueText}
          title="ИИ напишет продолжение выделенного текста"
          style={{
            position: "fixed",
            left: continueBtn.x + 10,
            top: continueBtn.y - 2,
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: dark
              ? "linear-gradient(135deg,#3b3caa,#2b2c7f)"
              : "linear-gradient(135deg,#6a8fb5,#4a6a8a)",
            color: "#fff",
            border: "none",
            borderRadius: 20,
            padding: "5px 13px",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Nunito', sans-serif",
            cursor: "pointer",
            boxShadow: dark
              ? "0 4px 16px rgba(43,44,127,0.6)"
              : "0 4px 16px rgba(74,106,138,0.45)",
            animation: "fadeInContinue .2s ease-out",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          <Icon d={icons.sparkle} size={12} />
          Продолжить текст
        </button>
      )}

      {continueLoading && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          zIndex: 99999,
          background: dark ? "#1a1c50" : "#fff",
          border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "#c8d9ec"}`,
          borderRadius: 24, padding: "7px 18px",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: dark ? "0 8px 32px rgba(10,12,60,0.6)" : "0 8px 32px rgba(80,120,160,0.2)",
          fontSize: 13, fontWeight: 600, fontFamily: "'Nunito', sans-serif",
          color: dark ? "#a0aaff" : "#4a6a8a",
        }}>
          <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
          ИИ пишет продолжение...
        </div>
      )}

      {pendingAiInsert && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 99999,
          background: dark ? "#1a1c50" : "#fff",
          border: `1px solid ${dark ? "rgba(100,110,255,0.25)" : "#b0c8e4"}`,
          borderRadius: 28, padding: "7px 8px 7px 18px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: dark ? "0 8px 32px rgba(10,12,60,0.65)" : "0 8px 32px rgba(80,120,160,0.22)",
          fontFamily: "'Nunito', sans-serif",
          animation: "fadeInContinue .2s ease-out",
        }}>
          <Icon d={icons.sparkle} size={14} />
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: dark ? "#a0aaff" : "#4a6a8a",
          }}>
            ИИ предлагает текст
          </span>
          <button onClick={acceptPendingAi} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: dark ? "rgba(69,71,181,0.4)" : "#dbeafe",
            border: `1px solid ${dark ? "rgba(130,140,255,0.3)" : "#bfdbfe"}`,
            borderRadius: 18, padding: "5px 14px",
            cursor: "pointer", fontSize: 12, fontWeight: 700,
            color: dark ? "#c0caff" : "#2563eb",
            transition: "background .12s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(69,71,181,0.6)" : "#bfdbfe"}
            onMouseLeave={e => e.currentTarget.style.background = dark ? "rgba(69,71,181,0.4)" : "#dbeafe"}
          >
            Принять
            <kbd style={{
              background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
              border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
              borderRadius: 4, padding: "1px 5px",
              fontSize: 10, fontFamily: "inherit",
            }}>Tab</kbd>
          </button>
          <button onClick={rejectPendingAi} style={{
            background: "none",
            border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#d0dcea"}`,
            borderRadius: 18, padding: "5px 14px",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: dark ? "#7080b0" : "#8fa8c8",
            marginRight: 4, transition: "background .12s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = dark ? "rgba(255,255,255,0.07)" : "#f0f4f8"; e.currentTarget.style.color = dark ? "#c0caff" : "#2d3f52"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = dark ? "#7080b0" : "#8fa8c8"; }}
          >
            Отклонить
          </button>
        </div>
      )}
    </>
  );
}