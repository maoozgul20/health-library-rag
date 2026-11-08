"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EvidenceList, Verdict } from "@/components/Evidence";
import { Library } from "@/components/Library";
import { Markdown } from "@/components/Markdown";
import { MedicalBackground } from "@/components/MedicalBackground";
import { MedicalScene } from "@/components/MedicalScene";
import { embedQuery, loadEmbedder, type LoadProgress } from "@/lib/embedder";
import { buildPrompt, COVERAGE_THRESHOLD, loadIndex, search, type LoadedIndex } from "@/lib/search";
import { SITE } from "@/lib/site";
import type { Hit, SearchMode } from "@/lib/types";

type Status = "searching" | "answering" | "done" | "error";

type Turn = {
  id: number;
  question: string;
  k: number;
  mode: SearchMode;
  hits: Hit[];
  status: Status;
  answer: string;
  error: string | null;
  baseline: { text: string; status: Status; error: string | null } | null;
};

type Chat = { id: string; title: string; turns: Turn[]; updated: number };
type ServerInfo = { configured: boolean; model: string; provider?: string } | null;

const STORE = "health-library-chats-v1";
const K_OPTIONS = [3, 5, 8];

const newChat = (): Chat => ({ id: Math.random().toString(36).slice(2, 10), title: "New chat", turns: [], updated: Date.now() });

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return [];
    const chats = JSON.parse(raw) as Chat[];
    // anything that was still streaming when the page closed is finished now
    return chats.map((c) => ({
      ...c,
      turns: c.turns.map((t) =>
        t.status === "searching" || t.status === "answering"
          ? { ...t, status: t.answer ? "done" : "error", error: t.answer ? null : "This answer was interrupted." }
          : t,
      ),
    }));
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(chats.filter((c) => c.turns.length).slice(0, 30)));
  } catch {}
}

async function streamAnswer(body: object, onText: (t: string) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `The server returned HTTP ${res.status}.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
}

const pulse = () => window.dispatchEvent(new Event("med-pulse"));

/* ---------- icons ---------- */

function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mark">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M5 17h5l2.5-6 4 11 3-8 1.8 3H27" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const Icon = {
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  send: <path d="M12 19V6M6 11l6-6 6 6" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
  sliders: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />,
  book: <path d="M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM5 16a4 4 0 014-4h10" />,
  copy: <path d="M9 9h10v10H9zM5 15V5h10" />,
  check: <path d="M5 12l5 5L19 7" />,
  doc: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  chat: <path d="M5 5h14v10H9l-4 4z" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
};
function I({ name, size = 18 }: { name: keyof typeof Icon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {Icon[name]}
    </svg>
  );
}

/* ---------- page ---------- */

export default function Home() {
  const [index, setIndex] = useState<LoadedIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [server, setServer] = useState<ServerInfo>(null);
  const [embedState, setEmbedState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<LoadProgress>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  const [question, setQuestion] = useState("");
  const [k, setK] = useState(5);
  const [mode, setMode] = useState<SearchMode>("semantic");
  const [compare, setCompare] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sources, setSources] = useState<{ chat: string; turn: number } | null>(null);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const nextId = useRef(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // load the index, the server status and saved chats
  useEffect(() => {
    loadIndex()
      .then((idx) => {
        setIndex(idx);
        if (!idx.vectors) setMode("keyword");
      })
      .catch((e) => setIndexError(e.message));
    fetch("/api/ask")
      .then((r) => r.json())
      .then(setServer)
      .catch(() => setServer({ configured: false, model: "" }));
    const saved = loadChats();
    const fresh = newChat();
    setChats([fresh, ...saved]);
    setActiveId(fresh.id);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveChats(chats);
  }, [chats, loaded]);

  const chat = chats.find((c) => c.id === activeId) ?? null;
  const turns = chat?.turns ?? [];
  const busy = turns.some((t) => t.status === "searching" || t.status === "answering");
  const hasTurns = turns.length > 0;

  // keep the newest message in view while it streams, unless the reader scrolled up
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chats, activeId]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const warmEmbedder = useCallback(() => {
    if (!index?.vectors || embedState === "loading" || embedState === "ready") return;
    setEmbedState("loading");
    loadEmbedder(index.meta.model, index.meta.dtype, setProgress)
      .then(() => setEmbedState("ready"))
      .catch(() => setEmbedState("error"));
  }, [index, embedState]);

  const patch = (chatId: string, id: number, fn: (t: Turn) => Turn) =>
    setChats((cs) => cs.map((c) => (c.id === chatId ? { ...c, turns: c.turns.map((t) => (t.id === id ? fn(t) : t)), updated: Date.now() } : c)));

  const startNewChat = () => {
    abortRef.current?.abort();
    const fresh = newChat();
    setChats((cs) => [fresh, ...cs.filter((c) => c.turns.length)]);
    setActiveId(fresh.id);
    setSources(null);
    setSidebarOpen(false);
  };

  const deleteChat = (id: string) => {
    setChats((cs) => {
      const rest = cs.filter((c) => c.id !== id);
      if (id === activeId) {
        const fresh = newChat();
        setActiveId(fresh.id);
        return [fresh, ...rest.filter((c) => c.turns.length)];
      }
      return rest;
    });
    if (sources?.chat === id) setSources(null);
  };

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || !index || !chat || busy) return;
    const chatId = chat.id;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    stick.current = true;
    pulse();

    const useMode: SearchMode = index.vectors ? mode : "keyword";
    const id = nextId.current++;
    const turn: Turn = {
      id,
      question: q,
      k,
      mode: useMode,
      hits: [],
      status: "searching",
      answer: "",
      error: null,
      baseline: compare ? { text: "", status: "answering", error: null } : null,
    };
    setChats((cs) =>
      cs.map((c) =>
        c.id === chatId
          ? { ...c, title: c.turns.length ? c.title : q.length > 48 ? q.slice(0, 46) + "…" : q, turns: [...c.turns, turn], updated: Date.now() }
          : c,
      ),
    );
    setQuestion("");

    let hits: Hit[];
    try {
      let qv: Float32Array | null = null;
      if (useMode !== "keyword") {
        setEmbedState((s) => (s === "ready" ? s : "loading"));
        const extractor = await loadEmbedder(index.meta.model, index.meta.dtype, setProgress);
        setEmbedState("ready");
        qv = await embedQuery(extractor, q);
      }
      hits = search(index, q, qv, useMode, k);
    } catch {
      setEmbedState("error");
      patch(chatId, id, (t) => ({
        ...t,
        status: "error",
        error: "The search model could not load. Check your connection, or switch search to exact words in settings.",
      }));
      return;
    }

    const configured = server?.configured ?? false;
    patch(chatId, id, (t) => ({ ...t, hits, status: configured ? "answering" : "done" }));
    if (!configured) return;

    const passages = hits.map((h) => ({ source: h.source, text: h.text }));
    const jobs: Promise<void>[] = [
      streamAnswer({ question: q, passages, withNotes: true }, (text) => patch(chatId, id, (t) => ({ ...t, answer: text })), ctrl.signal)
        .then(() => {
          patch(chatId, id, (t) => ({ ...t, status: "done" }));
          pulse();
        })
        .catch((e) => {
          if (e.name === "AbortError") return patch(chatId, id, (t) => ({ ...t, status: "done", answer: t.answer || "Stopped." }));
          patch(chatId, id, (t) => ({ ...t, status: "error", error: e.message }));
        }),
    ];
    if (compare) {
      jobs.push(
        streamAnswer(
          { question: q, withNotes: false },
          (text) => patch(chatId, id, (t) => ({ ...t, baseline: { text, status: "answering", error: null } })),
          ctrl.signal,
        )
          .then(() => patch(chatId, id, (t) => ({ ...t, baseline: t.baseline && { ...t.baseline, status: "done" } })))
          .catch((e) => {
            patch(chatId, id, (t) => ({
              ...t,
              baseline: e.name === "AbortError" ? t.baseline && { ...t.baseline, status: "done" } : { text: "", status: "error", error: e.message },
            }));
          }),
      );
    }
    await Promise.all(jobs);
  };

  const openSources = (turnId: number, cite: number | null = null) => {
    if (!chat) return;
    setSources({ chat: chat.id, turn: turnId });
    setActiveCite(cite);
    if (cite)
      setTimeout(() => document.getElementById(`src-${cite}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 260);
  };

  const sourceTurn = sources ? chats.find((c) => c.id === sources.chat)?.turns.find((t) => t.id === sources.turn) ?? null : null;
  const pct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : null;
  const saved = chats.filter((c) => c.turns.length);

  const composer = (
    <Composer
      big={!hasTurns}
      value={question}
      onChange={setQuestion}
      onSubmit={() => ask(question)}
      onStop={() => abortRef.current?.abort()}
      onFocus={warmEmbedder}
      busy={busy}
      disabled={!index}
      k={k}
      setK={setK}
      mode={mode}
      setMode={setMode}
      compare={compare}
      setCompare={setCompare}
      hasVectors={!!index?.vectors || !index}
    />
  );

  const status =
    server == null ? "Connecting…" : server.configured ? server.model.split("/").pop() : "Search only";

  return (
    <div className={`shell ${sources && sourceTurn ? "with-sources" : ""} ${sidebarOpen ? "nav-open" : ""}`}>
      <MedicalScene calm={hasTurns} />
      <MedicalBackground calm={hasTurns} />

      {/* ---------- sidebar ---------- */}
      <aside className="sidebar" aria-label="Chats">
        <div className="side-top">
          <div className="brand">
            <Mark />
            <span>{SITE.brand}</span>
          </div>
          <button type="button" className="icon-btn only-mobile" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <I name="close" />
          </button>
        </div>
        <button type="button" className="new-chat" onClick={startNewChat}>
          <I name="plus" /> New chat
        </button>

        <nav className="history" aria-label="Saved chats">
          <h2>Chats</h2>
          {saved.length === 0 && <p className="empty">Your questions will appear here.</p>}
          <ul>
            {saved.map((c) => (
              <li key={c.id} className={c.id === activeId ? "active" : ""}>
                <button
                  type="button"
                  className="hist-item"
                  onClick={() => {
                    setActiveId(c.id);
                    setSidebarOpen(false);
                    setSources(null);
                    stick.current = true;
                  }}
                >
                  <I name="chat" size={15} />
                  <span>{c.title}</span>
                </button>
                <button type="button" className="hist-del" onClick={() => deleteChat(c.id)} aria-label={`Delete chat: ${c.title}`}>
                  <I name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="side-bottom">
          <button type="button" className="side-link" onClick={() => setLibraryOpen(true)}>
            <I name="book" /> Library files
          </button>
          <p className="model">
            <span className={`dot ${server?.configured ? "on" : ""}`} aria-hidden="true" />
            {status}
          </p>
        </div>
      </aside>
      <button type="button" className="scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setSidebarOpen(false)} />

      {/* ---------- main ---------- */}
      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn only-mobile" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <I name="menu" />
          </button>
          <p className="chat-title">{hasTurns ? chat?.title : SITE.brand}</p>
          <button type="button" className="icon-btn" onClick={startNewChat} aria-label="New chat" title="New chat">
            <I name="plus" />
          </button>
        </header>

        <div className="scroll" ref={scrollRef} onScroll={onScroll}>
          {!hasTurns ? (
            <section className="landing" aria-labelledby="hello">
              <Mark size={52} />
              <h1 id="hello">{SITE.introTitle}</h1>
              <p className="lead">{SITE.introLead}</p>
              {composer}
              {embedState === "loading" && (
                <p className="loading-line" role="status">
                  Loading the search model{pct != null ? `, ${pct}%` : ""}. This happens once.
                </p>
              )}
              {indexError && (
                <p className="error-text" role="alert">
                  {indexError}
                </p>
              )}
              <ul className="starters">
                {SITE.starters.map((s) => (
                  <li key={s.q}>
                    <button
                      type="button"
                      className="chip-btn"
                      disabled={!index}
                      onClick={() => {
                        warmEmbedder();
                        ask(s.q);
                      }}
                    >
                      <strong>{s.title}</strong>
                      <span>{s.q}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="fine">{SITE.disclaimer}</p>
              <p className="hint-bg">Move your pointer over the background, or click empty space, to change the heartbeat.</p>
            </section>
          ) : (
            <ol className="thread" aria-label="Conversation">
              {turns.map((t) => (
                <li key={t.id} className="pair">
                  <div className="msg user">
                    <p className="bubble">{t.question}</p>
                  </div>
                  <div className="msg bot">
                    <Mark size={28} />
                    <div className="bot-body">
                      <BotAnswer turn={t} server={server} onCite={(n) => openSources(t.id, n)} />

                      {t.hits.length > 0 && (t.status === "done" || t.status === "error" || t.answer) && (
                        <div className="msg-actions">
                          <CoverageBadge hits={t.hits} />
                          <button type="button" className="pill" onClick={() => openSources(t.id)}>
                            <I name="doc" size={15} /> {t.hits.length} sources
                          </button>
                          {t.answer && (
                            <button
                              type="button"
                              className="pill ghost"
                              onClick={() => {
                                navigator.clipboard?.writeText(t.answer).catch(() => {});
                                setCopied(t.id);
                                setTimeout(() => setCopied(null), 1500);
                              }}
                            >
                              <I name={copied === t.id ? "check" : "copy"} size={15} /> {copied === t.id ? "Copied" : "Copy"}
                            </button>
                          )}
                        </div>
                      )}

                      {t.baseline && (
                        <details className="baseline" open>
                          <summary>Without the library, the model said</summary>
                          {t.baseline.error ? (
                            <p className="error-text">{t.baseline.error}</p>
                          ) : t.baseline.text ? (
                            <div className="answer plain">
                              <Markdown text={t.baseline.text} onCite={() => {}} maxCite={0} />
                            </div>
                          ) : (
                            <p className="typing">
                              <i />
                              <i />
                              <i />
                            </p>
                          )}
                        </details>
                      )}

                      {t.hits.length > 0 && (
                        <details className="prompt">
                          <summary>Prompt sent to the model</summary>
                          <pre>{buildPrompt(t.question, t.hits.map((h) => ({ source: h.source, text: h.text })))}</pre>
                        </details>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {hasTurns && (
          <div className="dock">
            {embedState === "loading" && (
              <p className="loading-line" role="status">
                Loading the search model{pct != null ? `, ${pct}%` : ""}. This happens once.
              </p>
            )}
            {composer}
            <p className="fine">{SITE.shortDisclaimer}</p>
          </div>
        )}
      </main>

      {/* ---------- sources panel ---------- */}
      {sources && sourceTurn && (
        <aside className="sources" aria-label="Sources for this answer">
          <header>
            <div>
              <h2>Sources</h2>
              <p>{sourceTurn.question}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setSources(null)} aria-label="Close sources">
              <I name="close" />
            </button>
          </header>
          <div className="sources-body">
            <EvidenceList hits={sourceTurn.hits} question={sourceTurn.question} mode={sourceTurn.mode} active={activeCite} idPrefix="src" />
          </div>
        </aside>
      )}

      {/* ---------- library dialog ---------- */}
      {libraryOpen && index && (
        <div className="dialog-wrap" role="presentation" onClick={() => setLibraryOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Library files" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn dialog-close" onClick={() => setLibraryOpen(false)} aria-label="Close library">
              <I name="close" />
            </button>
            <Library index={index} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- pieces ---------- */

function CoverageBadge({ hits }: { hits: Hit[] }) {
  const best = Math.max(...hits.map((h) => h.semantic ?? -1));
  if (best < 0) return null;
  const ok = best >= COVERAGE_THRESHOLD;
  return (
    <span className={`badge ${ok ? "ok" : "warn"}`} title={`Best match ${best.toFixed(2)}; the line is ${COVERAGE_THRESHOLD.toFixed(2)}`}>
      <span className="b-dot" aria-hidden="true" />
      {ok ? "Found in the library" : "Probably not in the library"}
    </span>
  );
}

function BotAnswer({ turn, server, onCite }: { turn: Turn; server: ServerInfo; onCite: (n: number) => void }) {
  if (turn.status === "searching")
    return (
      <p className="thinking">
        <span className="ecg-mini" aria-hidden="true" />
        Searching the library…
      </p>
    );
  if (turn.error && !turn.answer) return <p className="error-text">{turn.error}</p>;
  if (!server?.configured && turn.status === "done") {
    return (
      <div className="answer">
        <p>
          Answers are off because the server has no <code>LLM_API_KEY</code>. Here is what the search found: open the sources below to
          read the passages.
        </p>
        <Verdict hits={turn.hits} />
      </div>
    );
  }
  return (
    <div className="answer" aria-live="polite" aria-busy={turn.status === "answering"}>
      {turn.answer ? (
        <Markdown text={turn.answer} onCite={onCite} maxCite={turn.hits.length} />
      ) : (
        <p className="typing" aria-label="Writing an answer">
          <i />
          <i />
          <i />
        </p>
      )}
      {turn.status === "answering" && turn.answer && <span className="caret" aria-hidden="true" />}
      {turn.error && <p className="error-text">{turn.error}</p>}
    </div>
  );
}

function Composer(props: {
  big: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onFocus: () => void;
  busy: boolean;
  disabled: boolean;
  k: number;
  setK: (n: number) => void;
  mode: SearchMode;
  setMode: (m: SearchMode) => void;
  compare: boolean;
  setCompare: (b: boolean) => void;
  hasVectors: boolean;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLFormElement>(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  }, [props.value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("mousedown", close);
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("mousedown", close);
      removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <form
      ref={wrap}
      className={`composer ${props.big ? "big" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <label htmlFor="q" className="sr-only">
        Ask a health question
      </label>
      <textarea
        id="q"
        ref={ta}
        rows={1}
        value={props.value}
        maxLength={1000}
        placeholder={SITE.placeholder}
        autoFocus={props.big}
        onFocus={props.onFocus}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            props.onSubmit();
          }
        }}
      />
      <div className="composer-row">
        <button
          type="button"
          className={`tool ${open ? "on" : ""}`}
          aria-expanded={open}
          aria-controls="search-settings"
          onClick={() => setOpen(!open)}
        >
          <I name="sliders" size={17} /> Search settings
        </button>
        <span className="tool-note">
          {props.k} sources, {props.mode === "semantic" ? "by meaning" : props.mode === "hybrid" ? "meaning + words" : "exact words"}
          {props.compare ? ", compare" : ""}
        </span>
        {props.busy ? (
          <button type="button" className="send" onClick={props.onStop} aria-label="Stop answering">
            <I name="stop" />
          </button>
        ) : (
          <button type="submit" className="send" disabled={!props.value.trim() || props.disabled} aria-label="Send question">
            <I name="send" />
          </button>
        )}
      </div>

      {open && (
        <div className="popover" id="search-settings">
          <fieldset>
            <legend>Sources per answer</legend>
            <div className="seg">
              {K_OPTIONS.map((n) => (
                <label key={n}>
                  <input type="radio" name="k" checked={props.k === n} onChange={() => props.setK(n)} />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Search by</legend>
            <div className="seg">
              {(
                [
                  ["semantic", "Meaning"],
                  ["hybrid", "Meaning + words"],
                  ["keyword", "Exact words"],
                ] as [SearchMode, string][]
              ).map(([m, label]) => (
                <label key={m} className={m !== "keyword" && !props.hasVectors ? "off" : ""}>
                  <input
                    type="radio"
                    name="mode"
                    checked={props.mode === m}
                    disabled={m !== "keyword" && !props.hasVectors}
                    onChange={() => props.setMode(m)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="switch">
            <input type="checkbox" checked={props.compare} onChange={(e) => props.setCompare(e.target.checked)} />
            <span className="track" aria-hidden="true" />
            <span>Also answer without the library, to compare</span>
          </label>
        </div>
      )}
    </form>
  );
}
