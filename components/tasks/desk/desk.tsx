"use client";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, type MotionStyle, type PanInfo } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, CornerDownLeft, Grip, Layers, Mic, Moon, RotateCcw, Sparkles, Sun, Trash2, X, SlidersHorizontal, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { stepFloat } from "./float-physics";
import styles from "./desk-surface.module.css";

type Zone = "desk" | "waiting" | "later" | "done" | "pending" | "deleted";
type ChecklistItem = { id: string; text: string; done: boolean };
type Card = { notes?: string; dueDate?: string; checklist?: ChecklistItem[]; link?: string; id: string; title: string; project: string; detail: string; color: string; zone: Zone; x: number; y: number; remaining?: number; arranged?: boolean };
type Destination = "done" | "pending" | "later" | "waiting";
type SpeechSession = { start: () => void; stop: () => void; abort: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
const initialCards: Card[] = [
  { id: "estimate", title: "Send Sarah the revised estimate", project: "ACME FILM", detail: "Estimate v3 · Today", color: "#b39458", zone: "desk", x: .01, y: .07 },
  { id: "cut", title: "Review the first cut", project: "NORTHLINE", detail: "Cut v1 · Today", color: "#8f9e86", zone: "desk", x: .50, y: .02 },
  { id: "scout", title: "Book the location scout", project: "FIELDWORK", detail: "Locations · Friday", color: "#5eaa8e", zone: "desk", x: .99, y: .15 },
  { id: "editor", title: "Chase the editor", project: "NORTHLINE", detail: "Follow up on notes", color: "#8f9e86", zone: "desk", x: .23, y: .78 },
  { id: "frames", title: "Collect reference frames", project: "ACME FILM", detail: "Moodboard · This week", color: "#b39458", zone: "desk", x: .72, y: .88 },
  { id: "feedback", title: "Sarah’s feedback", project: "ACME FILM", detail: "Waiting on a reply", color: "#b39458", zone: "waiting", x: .1, y: .1 },
  { id: "archive", title: "Organize the shoot references", project: "FIELDWORK", detail: "Whenever there’s room", color: "#5eaa8e", zone: "later", x: .2, y: .2 },
];

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, Math.max(0, max)));

export function Desk({ embedded = false, projects = [] }: { embedded?: boolean; projects?: Array<{ title: string; color: string }> }) {
  const storageKey = embedded ? "prdcr-desk-live-v1" : "prdcr-desk-preview-v1";
  const [cards, setCards] = useState<Card[]>(embedded ? [] : initialCards);
  const [ready, setReady] = useState(false);
  const [cardSize, setCardSize] = useState<"compact" | "large">("large");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [placement, setPlacement] = useState<"side" | "center">("side");
  const [movement, setMovement] = useState<"studio" | "float">("studio");
  const [settleToken, setSettleToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [help, setHelp] = useState(false);
  const [neverShow, setNeverShow] = useState(false);
  const [drawer, setDrawer] = useState<Zone | null>(null);
  const [notice, setNotice] = useState("Your space. Start by moving a card.");
  const [paused, setPaused] = useState<string[]>([]);
  const [activeTarget, setActiveTarget] = useState<Destination | null>(null);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 1000, height: 570 });
  const [recording, setRecording] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const recognition = useRef<SpeechSession | null>(null);
  const capture = useRef<HTMLTextAreaElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const targets = useRef<Partial<Record<Destination, HTMLButtonElement | null>>>({});
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpClose = useRef<HTMLButtonElement>(null);
  const tray = useRef<HTMLElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved) && saved.every((c) => c && typeof c.id === "string" && typeof c.title === "string" && typeof c.project === "string" && typeof c.detail === "string" && typeof c.color === "string" && Number.isFinite(c.x) && Number.isFinite(c.y) && ["desk", "waiting", "later", "done", "pending", "deleted"].includes(c.zone))) {
        setCards(saved.map((c: Card) => c.zone === "pending" ? { ...c, zone: "desk", remaining: undefined } : c));
      }
      const hidden = localStorage.getItem(`${storageKey}-help`) === "hidden";
      setNeverShow(hidden);
      setHelp(!hidden);
      const savedSize = localStorage.getItem(`${storageKey}-card-size`);
      if (savedSize === "compact" || savedSize === "large") setCardSize(savedSize);
      const preferences = JSON.parse(localStorage.getItem(`${storageKey}-preferences`) ?? "{}");
      if (preferences.placement === "side" || preferences.placement === "center") setPlacement(preferences.placement);
      if (preferences.movement === "studio" || preferences.movement === "float") setMovement(preferences.movement);
    } catch { /* Preview still works when storage is unavailable. */ }
    setReady(true);
    const win = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechAvailable(Boolean(win.SpeechRecognition || win.webkitSpeechRecognition));
    return () => recognition.current?.abort();
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify(cards)); } catch { /* Session-only fallback. */ }
  }, [cards, ready, storageKey]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(`${storageKey}-card-size`, cardSize); } catch { /* Session-only fallback. */ }
  }, [cardSize, ready, storageKey]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(`${storageKey}-preferences`, JSON.stringify({ placement, movement })); } catch { /* Session-only fallback. */ }
  }, [placement, movement, ready, storageKey]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (board.current) observer.observe(board.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      setCards((previous) => {
        if (!previous.some((c) => c.zone === "pending" && !paused.includes(c.id))) return previous;
        return previous.map((c) => {
          if (c.zone !== "pending" || paused.includes(c.id)) return c;
          const remaining = Math.max(0, (c.remaining ?? 3000) - 100);
          return { ...c, remaining, zone: remaining === 0 ? "deleted" : "pending" };
        });
      });
    }, 100);
    return () => clearInterval(timer);
  }, [paused]);

  useEffect(() => { if (help) helpClose.current?.focus(); }, [help]);

  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape") { setDrawer(null); return; }
      if (event.key !== "Tab") return;
      const controls = tray.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [drawer]);

  function closeHelp() {
    setHelp(false);
    try { localStorage.setItem(`${storageKey}-help`, neverShow ? "hidden" : "show"); } catch { /* Session-only fallback. */ }
    helpButton.current?.focus();
  }

  function move(id: string, zone: Zone) {
    setCards((previous) => previous.map((card) => card.id === id ? { ...card, zone, remaining: zone === "pending" ? 3000 : undefined } : card));
    setPaused((previous) => previous.filter((item) => item !== id));
    setNotice(zone === "done" ? "One less thing on your mind." : zone === "pending" ? "Three seconds. Grab the card to keep it, or recover it from Recently discarded." : zone === "desk" ? "Back on your desk." : zone === "waiting" ? "Set aside until you hear back." : "Saved for later.");
  }

  function targetAt(point: { x: number; y: number }): Destination | null {
    for (const name of ["pending", "done", "later", "waiting"] as Destination[]) {
      const rect = targets.current[name]?.getBoundingClientRect();
      if (rect && point.x >= rect.left - 22 && point.x <= rect.right + 22 && point.y >= rect.top - 22 && point.y <= rect.bottom + 22) return name;
    }
    return null;
  }

  function addCards() {
    const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    setCards((previous) => [...previous, ...lines.map((title, index): Card => ({ id: crypto.randomUUID(), title, project: "PERSONAL", detail: "Just captured", color: "#69a68b", zone: "desk", x: .12 + (index % 3) * .28, y: .2 + (index % 2) * .35 }))]);
    setText("");
    setNotice(lines.length > 1 ? `${lines.length} thoughts, safely on your desk.` : "Thought captured. Arrange it when you’re ready.");
    capture.current?.focus();
  }

  function dictate() {
    if (recording) { recognition.current?.stop(); return; }
    const win = window as unknown as { SpeechRecognition?: new () => SpeechSession; webkitSpeechRecognition?: new () => SpeechSession };
    const Constructor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Constructor) { setNotice("Use your keyboard’s dictation, or type here. This browser doesn’t offer built-in speech capture."); capture.current?.focus(); return; }
    const session = new Constructor();
    const prefix = text.trim();
    session.continuous = true;
    session.interimResults = true;
    session.lang = "en-US";
    session.onresult = (event) => {
      const spoken = Array.from(event.results).map((result) => result[0].transcript).join(" ");
      setText([prefix, spoken].filter(Boolean).join(" "));
    };
    session.onerror = (event) => { setRecording(false); setNotice(`Dictation stopped (${event.error}). Your text is still here.`); };
    session.onend = () => { setRecording(false); recognition.current = null; };
    recognition.current = session;
    try { session.start(); setRecording(true); setNotice("Listening. Stop when you’re ready, then edit or add your thought."); } catch { setRecording(false); setNotice("Couldn’t start the microphone. You can still type your thought."); }
  }

  const selected = cards.find((card) => card.id === selectedId);
  function patchCard(id: string, changes: Partial<Card>) {
    setCards((previous) => previous.map((card) => card.id === id ? { ...card, ...changes } : card));
  }
  function openCard(id: string) {
    setSettleToken((value) => value + 1);
    setSelectedId(id);
    setHelp(false);
  }

  const done = cards.filter((c) => c.zone === "done");
  const deleted = cards.filter((c) => c.zone === "deleted");
  const pending = cards.filter((c) => c.zone === "pending");
  const cardWidth = Math.min(size.width - 12, cardSize === "large" ? 246 : size.width < 430 ? 158 : 190);
  const deskCards = cards.filter((c) => c.zone === "desk" || c.zone === "pending");

  return (
    <main className={`${styles.shell} ${embedded ? styles.embedded : ""}`}>
      <header className={styles.nav}>
        <a href={embedded ? "/dashboard/desk" : "/dashboard"} className={styles.brand}>{embedded ? "THE DESK" : "PRDCR"}{!embedded && <span>THE DESK</span>}</a>
        <span className={styles.previewBadge}>{embedded ? "YOUR PERSONAL WORKSPACE" : "DESIGN PLAYGROUND"}<span> · {embedded ? "Saved in this browser" : "Sample tasks only"}</span></span>
        <div className={styles.navActions}>
          <span className={styles.progress}><i />{done.length ? `${done.length} finished` : "A fresh start"}</span>
          <button title="Switch light and dark" aria-label="Switch light and dark" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{ready && resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button aria-label="Desk settings" title="Desk settings" onClick={() => { setSettleToken((value) => value + 1); setSettingsOpen(true); setHelp(false); }}><SlidersHorizontal size={19} /></button>
          <button ref={helpButton} aria-label="Open desk guide" title="Your desk, explained" onClick={() => setHelp(!help)}><CircleHelp size={22} /></button>
        </div>
      </header>

      <section className={styles.intro}>
        <div><p className={styles.eyebrow}>LESS IN YOUR HEAD. MORE ROOM TO CREATE.</p><h1>Room to think<span>.</span></h1></div>
        <p className={styles.introNote}>A place for your thoughts.<br />A little space to move them forward.</p>
      </section>
      <div className={styles.capture}>
        <Sparkles size={19} aria-hidden="true" />
        <textarea ref={capture} value={text} readOnly={recording} rows={1} aria-label="Capture a thought" placeholder={recording ? "Listening…" : "What’s on your mind?"} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !recording) { event.preventDefault(); addCards(); } }} />
        <span className={styles.captureHint}>One task per line</span>
        <button className={recording ? styles.recording : ""} aria-label={recording ? "Stop dictation" : "Dictate a thought"} title={speechAvailable ? "Dictate a thought" : "Dictation options"} onClick={dictate}><Mic size={20} /></button>
        <button className={styles.add} disabled={!text.trim() || recording} aria-label="Add to desk" title="Add to desk · Enter" onClick={addCards}><CornerDownLeft size={20} /></button>
      </div>

      <div className={styles.workspace}>
        <div className={`${styles.board} ${movement === "float" ? styles.floatBoard : ""}`} ref={board} data-desk-board>
          <div className={styles.boardLabel}><span className={styles.boardCaption}>YOUR DESK <span>{dragging ? "Let it glide." : movement === "float" ? "Float mode · flick to bounce" : "Pick something up. Make it yours."}</span></span>{movement === "float" && <button className={styles.settle} onClick={() => setSettleToken((value) => value + 1)}>Settle desk</button>}</div>
          {deskCards.length === 0 && <div className={styles.empty}><Sparkles size={26} /><h2>A little breathing room.</h2><p>Capture a thought above, or bring something back from Later.</p></div>}
          <AnimatePresence initial={false}>{deskCards.map((card, index) => <DeskCard key={card.id} card={size.width < 650 && !card.arranged ? { ...card, x: index % 2 ? .99 : .01, y: Math.min(.96, Math.floor(index / 2) * .46) } : card} width={cardWidth} size={size} board={board} reduced={Boolean(reduced)} move={move} movement={movement} settleToken={settleToken} onOpen={() => openCard(card.id)}
            onPause={(pause) => setPaused((previous) => pause ? [...new Set([...previous, card.id])] : previous.filter((id) => id !== card.id))}
            onPosition={(x, y) => setCards((previous) => previous.map((c) => c.id === card.id ? { ...c, x, y, arranged: true } : c))}
            onDragState={setDragging} onTarget={setActiveTarget} targetAt={targetAt} />)}</AnimatePresence>
          <div className={styles.dock}>
            <div className={styles.deskTools}>
              <button ref={(el) => { targets.current.later = el; }} className={activeTarget === "later" ? styles.targetActive : ""} onClick={() => setDrawer("later")}><Layers size={18} />Later<span>{cards.filter((c) => c.zone === "later").length}</span></button>
              <button title="Arrange cards neatly" onClick={() => {
                setSettleToken((value) => value + 1);
                const columns = Math.max(1, Math.floor(size.width / (cardWidth + 24)));
                const count = cards.filter((c) => c.zone === "desk").length;
                const rows = Math.max(1, Math.ceil(count / columns));
                setCards((previous) => { let i = 0; return previous.map((c) => { if (c.zone !== "desk") return c; const index = i++; return { ...c, arranged: true, x: columns === 1 ? .5 : (index % columns) / (columns - 1), y: rows === 1 ? .2 : Math.floor(index / columns) / (rows - 1) * .95 }; }); });
                setNotice("A little order. Move anything wherever you like.");
              }}><Sparkles size={17} /><span className={styles.tidyText}>Tidy desk</span></button>
            </div>
            <button ref={(el) => { targets.current.done = el; }} data-desk-finished className={`${styles.finished} ${activeTarget === "done" ? styles.targetActive : ""}`} onClick={() => setDrawer("done")}>
              <span className={styles.stack}><span /><span /><span /></span><Check size={22} /><span>Finished<small>{done.length ? `${done.length} ${done.length === 1 ? "task finished" : "tasks finished"}` : "Let it land here"}</small></span>
            </button>
            <button ref={(el) => { targets.current.pending = el; }} data-desk-discard className={`${styles.discard} ${activeTarget === "pending" ? styles.targetActive : ""}`} aria-label="Discard pocket — open recently discarded" title="Slide a card here to discard. Three seconds to pull it back." onClick={() => setDrawer("deleted")}>
              <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="44" strokeDasharray="276.46" strokeDashoffset={276.46 * (1 - (pending[0]?.remaining ?? 3000) / 3000)} /></svg>
              <Trash2 size={20} /><span>{pending.length ? `${Math.ceil((pending[0].remaining ?? 0) / 1000)}s` : "Discard"}</span>
            </button>
          </div>
        </div>
        <section className={styles.waiting}>
          <button ref={(el) => { targets.current.waiting = el; }} className={`${styles.waitingTitle} ${activeTarget === "waiting" ? styles.targetActive : ""}`} onClick={() => setDrawer("waiting")}>Waiting <ArrowDownLeft size={16} /></button>
          <p>Off your mind.<br />Still on your radar.</p>
          {cards.filter((c) => c.zone === "waiting").map((c) => <button className={styles.waitingCard} key={c.id} onClick={() => move(c.id, "desk")} title="Bring back to your desk"><span style={{ color: c.color }}>{c.project}</span><strong>{c.title}</strong><small>{c.detail}</small><ArrowUpRight size={15} /></button>)}
          <div className={styles.waitingFooter}><span className={styles.orbit} /><p>You don’t have to<br />hold it all at once.</p></div>
        </section>
      </div>
      <footer className={styles.footer}>
        <span role="status" aria-live="polite">{notice}</span>
        <div><span>{embedded ? "Saved in this browser" : "Sample tasks only"}</span><button onClick={() => setDrawer("deleted")}>Recently discarded{deleted.length ? ` · ${deleted.length}` : ""}</button>{!embedded && <button onClick={() => { recognition.current?.abort(); setRecording(false); setText(""); setCards(initialCards.map((c) => ({ ...c }))); setPaused([]); setNotice("Sample desk reset. Try something different."); }}><RotateCcw size={12} />Reset demo</button>}</div>
      </footer>

      {settingsOpen && <DeskDialog label="Desk settings" placement="side" onClose={() => setSettingsOpen(false)}>
        <p className={styles.eyebrow}>MAKE IT YOURS</p><h2>Desk settings</h2><p className={styles.panelIntro}>A little more control. The same room to think.</p>
        <fieldset className={styles.settingGroup}><legend>Card size</legend><div className={styles.segment}>{(["compact", "large"] as const).map((value) => <button key={value} aria-pressed={cardSize === value} onClick={() => setCardSize(value)}>{value === "compact" ? "Compact" : "Large"}</button>)}</div></fieldset>
        <fieldset className={styles.settingGroup}><legend>Open cards</legend><div className={styles.segment}>{(["side", "center"] as const).map((value) => <button key={value} aria-pressed={placement === value} onClick={() => setPlacement(value)}>{value === "side" ? "On the side" : "In the middle"}</button>)}</div><p>Click a card to see its notes, links, and next steps.</p></fieldset>
        <fieldset className={styles.settingGroup}><legend>Movement</legend><div className={styles.segment}>{(["studio", "float"] as const).map((value) => <button key={value} aria-pressed={movement === value} onClick={() => setMovement(value)}>{value === "studio" ? "Studio" : "Float"}</button>)}</div><p>{movement === "studio" ? "A short, controlled glide. Gentle attraction to destinations." : "Flick cards into the edges and let them bounce. Grab to stop, or use Settle desk."}</p>{reduced && <p>Your device’s reduced-motion preference keeps movement gentle.</p>}</fieldset>
        <div className={styles.previewNote}>{embedded ? "Your desk saves in this browser, on this device. It is separate from the original Tasks list. No email suggestions or existing tasks are imported." : "This desk is a separate playground. No email suggestions or existing tasks are imported."}</div>
      </DeskDialog>}
      {selected && <CardDetails key={selected.id} projects={embedded ? projects : initialCards.map((card) => ({ title: card.project, color: card.color }))} preview={!embedded} card={selected} placement={placement} onClose={() => setSelectedId(null)} onChange={(changes) => patchCard(selected.id, changes)} onMove={(zone) => { move(selected.id, zone); setSelectedId(null); }} />}

      {help && <section className={styles.guide} role="dialog" aria-label="Your desk, explained" onKeyDown={(event) => { if (event.key === "Escape") closeHelp(); }}>
        <button ref={helpClose} className={styles.close} aria-label="Close desk guide" onClick={closeHelp}><X size={18} /></button>
        <p className={styles.eyebrow}>A FEW SMALL MOVES</p><h2>Make yourself at home.</h2><p>Your desk has a little give. Try it.</p>
        <div className={styles.lessons}>
          {[
            { title: "Move a thought", text: "Click to open. Drag to move. Try Float in Desk settings.", icon: <Grip size={17} />, className: styles.demoMove },
            { title: "Enjoy the finish", text: "Slide it to Finished, or use its check button.", icon: <Check size={17} />, className: styles.demoFinish },
            { title: "Let something go", text: "Slide to Discard. Grab it back within 3 seconds.", icon: <Trash2 size={17} />, className: styles.demoDiscard },
          ].map((lesson) => <div key={lesson.title}><div className={`${styles.lessonAnimation} ${lesson.className}`}><i /><span>{lesson.icon}</span></div><h3>{lesson.title}</h3><p>{lesson.text}</p></div>)}
        </div>
        <div className={styles.guideBottom}><label><input type="checkbox" checked={neverShow} onChange={(event) => setNeverShow(event.target.checked)} />Never show again</label><button onClick={closeHelp}>Let me try <ChevronRight size={15} /></button></div>
        <small>Find this guide anytime with <CircleHelp size={12} />. Arrow keys move a focused card.</small>
      </section>}

      {drawer && <div className={styles.drawerBackdrop} onClick={() => setDrawer(null)}><section ref={tray} className={styles.drawer} role="dialog" aria-modal="true" aria-label={drawer === "deleted" ? "Recently discarded" : drawer} onClick={(event) => event.stopPropagation()}>
        <button autoFocus className={styles.close} aria-label="Close tray" onClick={() => setDrawer(null)}><X size={20} /></button><p className={styles.eyebrow}>A LITTLE SPACE</p><h2>{drawer === "deleted" ? "Recently discarded" : drawer === "done" ? "Look what you finished." : drawer === "later" ? "For another moment." : "Waiting on the world."}</h2>
        <p>{drawer === "deleted" ? "Discarded cards stay here until you restore them." : drawer === "done" ? "Your desk is clearer. Your work is still here." : "Bring a card onto your desk when you’re ready."}</p>
        {!cards.some((c) => c.zone === drawer) && <p className={styles.trayEmpty}>Nothing here yet. There’s no rush.</p>}
        {cards.filter((c) => c.zone === drawer).map((c) => <div className={styles.trayRow} key={c.id}><span><small style={{ color: c.color }}>{c.project}</small><strong>{c.title}</strong></span><button onClick={() => move(c.id, "desk")}>{drawer === "deleted" ? "Restore" : drawer === "done" ? "Reopen" : "To desk"}<ArrowUpRight size={15} /></button></div>)}
      </section></div>}
    </main>
  );
}

function DeskDialog({ label, placement, onClose, children }: { label: string; placement: "side" | "center"; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} aria-label={label} className={`${styles.detailDialog} ${placement === "center" ? styles.centerDialog : styles.sideDialog}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <button autoFocus className={styles.close} aria-label={`Close ${label}`} onClick={onClose}><X size={20} /></button>{children}
  </dialog>;
}

function CardDetails({ card, placement, onClose, onChange, onMove, preview, projects }: { projects: Array<{ title: string; color: string }>; preview: boolean; card: Card; placement: "side" | "center"; onClose: () => void; onChange: (changes: Partial<Card>) => void; onMove: (zone: Zone) => void }) {
  const [step, setStep] = useState("");
  const [linkError, setLinkError] = useState("");
  const checklist = card.checklist ?? [];
  let safeLink: string | undefined;
  try { const url = new URL(card.link ?? ""); if (["https:", "http:"].includes(url.protocol)) safeLink = url.href; } catch { /* Editable draft link. */ }
  function addStep() {
    if (!step.trim()) return;
    onChange({ checklist: [...checklist, { id: crypto.randomUUID(), text: step.trim(), done: false }] });
    setStep("");
  }
  return <DeskDialog label="Task details" placement={placement} onClose={onClose}>
    <p className={styles.eyebrow}>A LITTLE ROOM TO WORK</p>
    <label className={styles.fieldLabel}>Task<textarea className={styles.detailTitle} aria-label="Task title" value={card.title} rows={2} onChange={(event) => onChange({ title: event.target.value })} onBlur={() => { if (!card.title.trim()) onChange({ title: "Untitled task" }); }} /></label>
    <p className={styles.savedNote}>Saved in this browser{preview ? " · Preview task" : ""}</p>
    <div className={styles.detailMeta}>
      <label className={styles.fieldLabel}>Project<select aria-label="Task project" value={card.project} onChange={(event) => { const project = projects.find((c) => c.title === event.target.value); onChange({ project: event.target.value, color: project?.color ?? "#69a68b" }); }}>{[...new Set(["PERSONAL", ...projects.map((c) => c.title), card.project])].map((project) => <option key={project}>{project}</option>)}</select></label>
      <label className={styles.fieldLabel}>Deadline<input type="date" aria-label="Task deadline" value={card.dueDate ?? ""} onChange={(event) => onChange({ dueDate: event.target.value, detail: event.target.value ? `Due ${event.target.value}` : "No deadline" })} /></label>
    </div>
    <label className={styles.fieldLabel}>Notes<textarea aria-label="Task notes" placeholder="Context, a loose thought, something to remember…" rows={4} value={card.notes ?? ""} onChange={(event) => onChange({ notes: event.target.value })} /></label>
    <section className={styles.checklist}><h3>Next steps <span>{checklist.length ? `${checklist.filter((item) => item.done).length} / ${checklist.length}` : ""}</span></h3>
      {checklist.map((item) => <div key={item.id} className={styles.checklistRow}><input aria-label={`Complete step: ${item.text}`} type="checkbox" checked={item.done} onChange={(event) => onChange({ checklist: checklist.map((row) => row.id === item.id ? { ...row, done: event.target.checked } : row) })} /><span className={item.done ? styles.stepDone : ""}>{item.text}</span><button aria-label={`Remove step: ${item.text}`} onClick={() => onChange({ checklist: checklist.filter((row) => row.id !== item.id) })}><X size={14} /></button></div>)}
      <form className={styles.addStep} onSubmit={(event) => { event.preventDefault(); addStep(); }}><input aria-label="New checklist step" placeholder="Add a small next step" value={step} onChange={(event) => setStep(event.target.value)} /><button aria-label="Add checklist step" disabled={!step.trim()}><Plus size={17} /></button></form>
    </section>
    <label className={styles.fieldLabel}>Reference link<input type="url" aria-label="Reference link" placeholder="https://…" value={card.link ?? ""} onChange={(event) => { onChange({ link: event.target.value }); setLinkError(""); }} onBlur={() => setLinkError(card.link && !safeLink ? "Use a complete http:// or https:// link." : "")} /></label>
    {linkError && <p role="alert" className={styles.linkError}>{linkError}</p>}
    {safeLink && <a className={styles.referenceLink} href={safeLink} target="_blank" rel="noopener noreferrer">Open reference <ArrowUpRight size={14} /></a>}
    <div className={styles.detailActions}><button className={styles.completeAction} onClick={() => onMove("done")}><Check size={17} />Complete</button><button onClick={() => onMove("later")}>Later</button><button onClick={() => onMove("waiting")}>Waiting</button><button aria-label="Discard task" onClick={() => onMove("pending")}><Trash2 size={16} /></button></div>
  </DeskDialog>;
}

function DeskCard({ card, width, size, board, reduced, move, onPause, onPosition, onDragState, onTarget, targetAt, movement, settleToken, onOpen }: {
  movement: "studio" | "float"; settleToken: number; onOpen: () => void;
  card: Card; width: number; size: { width: number; height: number }; board: RefObject<HTMLDivElement | null>; reduced: boolean;
  move: (id: string, zone: Zone) => void; onPause: (paused: boolean) => void; onPosition: (x: number, y: number) => void; onDragState: (dragging: boolean) => void; onTarget: (target: Destination | null) => void; targetAt: (point: { x: number; y: number }) => Destination | null;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [held, setHeld] = useState(false);
  const [editing, setEditing] = useState(false);
  const frame = useRef<number | null>(null);
  const dragged = useRef(false);
  const positionCallback = useRef(onPosition);
  useEffect(() => { positionCallback.current = onPosition; }, [onPosition]);
  const cardRef = useRef<HTMLDivElement>(null);
  const maxX = Math.max(0, size.width - width - 12);
  const maxY = Math.max(0, size.height - 310);

  useEffect(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current); frame.current = null;
      positionCallback.current(maxX ? clamp(x.get(), maxX) / maxX : 0, maxY ? clamp(y.get() - 42, maxY) / maxY : 0);
    }
  }, [movement, settleToken, reduced, maxX, maxY, x, y]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  useEffect(() => {
    const px = card.zone === "pending" ? maxX : card.x * maxX;
    const py = card.zone === "pending" ? size.height - 290 : card.y * maxY + 42;
    const a = animate(x, px, { type: "spring", stiffness: 210, damping: 27, duration: reduced ? 0 : undefined });
    const b = animate(y, py, { type: "spring", stiffness: 210, damping: 27, duration: reduced ? 0 : undefined });
    return () => { a.stop(); b.stop(); };
  }, [card.x, card.y, card.zone, maxX, maxY, reduced, size.height, x, y]);

  function endDrag(info: PanInfo) {
    setHeld(false); onDragState(false); onTarget(null); onPause(false);
    const bounds = cardRef.current?.getBoundingClientRect();
    const center = bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : info.point;
    const projection = reduced ? 0 : .16;
    const velocityX = Math.max(-1800, Math.min(1800, info.velocity.x));
    const velocityY = Math.max(-1800, Math.min(1800, info.velocity.y));
    const target = movement === "float" ? targetAt(info.point) : targetAt(info.point) || targetAt(center) || targetAt({ x: center.x + velocityX * projection, y: center.y + velocityY * projection });
    if (target) { move(card.id, target); return; }
    if (movement === "float" && !reduced && card.zone !== "pending") {
      let vx = velocityX, vy = velocityY;
      let px = clamp(x.get(), maxX), py = clamp(y.get() - 42, maxY);
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min((now - last) / 1000, .032); last = now;
        const next = stepFloat({ x: px, y: py, vx, vy }, dt, maxX, maxY);
        px = next.x; py = next.y; vx = next.vx; vy = next.vy;
        x.set(px); y.set(py + 42);
        if (Math.hypot(vx, vy) < 12 || document.hidden) {
          frame.current = null;
          positionCallback.current(maxX ? px / maxX : 0, maxY ? py / maxY : 0);
        } else frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
      return;
    }
    const px = clamp(x.get() + velocityX * projection, maxX);
    const py = clamp(y.get() + velocityY * projection - 42, maxY);
    if (card.zone === "pending") move(card.id, "desk");
    onPosition(maxX ? px / maxX : 0, maxY ? py / maxY : 0);
    animate(x, px, { type: "spring", stiffness: 145, damping: 25 });
    animate(y, py + 42, { type: "spring", stiffness: 145, damping: 25 });
  }

  return <motion.div ref={cardRef} className={`${styles.card} ${held ? styles.held : ""} ${card.zone === "pending" ? styles.pendingCard : ""}`} data-desk-card={card.id}
    exit={{ opacity: 0, scale: reduced ? 1 : .88, transition: { duration: reduced ? 0 : .22 } }}
    style={{ x, y, width, zIndex: held || editing ? 35 : card.zone === "pending" ? 25 : 2, "--project-color": card.color } as MotionStyle}
    drag={!editing} dragConstraints={board} dragElastic={.06} dragMomentum={false}
    whileDrag={reduced ? undefined : { scale: 1.035, rotate: 2 }}
    onPointerDownCapture={() => { dragged.current = false; if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; } x.stop(); y.stop(); }}
    onClick={(event) => { if (!dragged.current && !(event.target as HTMLElement).closest("button")) { if (card.zone === "pending") move(card.id, "desk"); onPosition(maxX ? clamp(x.get(), maxX) / maxX : 0, maxY ? clamp(y.get() - 42, maxY) / maxY : 0); onOpen(); } }}
    onDragStart={() => { dragged.current = true; x.stop(); y.stop(); setHeld(true); onDragState(true); onPause(true); }}
    onDrag={(_, info) => onTarget(targetAt(info.point))} onDragEnd={(_, info) => endDrag(info)}
    onPointerEnter={() => { if (card.zone === "pending") onPause(true); }} onPointerLeave={() => { if (!held) onPause(false); }}
    tabIndex={0} aria-label={`${card.title}. Arrow keys to move; Enter to open.`}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter") { onOpen(); return; }
      if (event.key === "Escape") { setEditing(false); return; }
      const delta: Record<string, [number, number]> = { ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.07], ArrowDown: [0, .07] };
      if (delta[event.key]) { event.preventDefault(); if (card.zone === "pending") move(card.id, "desk"); onPosition(clamp(card.x + delta[event.key][0], 1), clamp(card.y + delta[event.key][1], 1)); }
    }}>
    <div className={styles.cardTop}><span>{card.project}</span><Grip size={15} aria-hidden="true" /></div>
    <div className={styles.cardTitle}><button onPointerDown={(event) => event.stopPropagation()} aria-label={`Complete ${card.title}`} title="Mark complete" onClick={() => move(card.id, "done")}><Check size={15} /></button><h2>{card.title}</h2></div>
    <div className={styles.cardBottom}><span>{card.zone === "pending" ? `Discarding in ${Math.ceil((card.remaining ?? 0) / 1000)}s · grab to keep` : card.detail}</span><button onPointerDown={(event) => event.stopPropagation()} title="Card actions" aria-label={`Actions for ${card.title}`} aria-expanded={editing} onClick={() => setEditing(!editing)}>···</button></div>
    {card.zone === "pending" && <button className={styles.keep} onPointerDown={(event) => event.stopPropagation()} onClick={() => move(card.id, "desk")}>Keep this card <RotateCcw size={12} /></button>}
    {editing && <div className={styles.cardMenu} onPointerDown={(event) => event.stopPropagation()}>{([ ["later", "Save for later"], ["waiting", "Waiting on someone"], ["pending", "Discard"] ] as const).map(([zone, label]) => <button key={zone} onClick={() => { setEditing(false); move(card.id, zone); }}>{label}</button>)}</div>}
  </motion.div>;
}
