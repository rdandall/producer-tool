"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LogOut,
  ShieldOff,
  KeyRound,
  Loader2,
  Mail,
  FileText,
  Sparkles,
  Unlink,
  RotateCcw,
  X,
  Plus,
} from "lucide-react";
import {
  invalidateAllSessionsAction,
  changeSitePasswordAction,
  setEmailSyncLimitAction,
  setNoteDefaultTypeAction,
  setEmailFromAddressAction,
  saveStyleNoteAction,
  clearToneProfileAction,
  disconnectGmailAction,
  disconnectCalendarAction,
  saveEmailTaskFilterAction,
} from "@/app/actions";

type NoteType = "brief" | "meeting-notes" | "project-notes" | "client-brief";

const NOTE_TYPE_OPTIONS: { value: NoteType; label: string }[] = [
  { value: "brief",         label: "Edit Brief" },
  { value: "meeting-notes", label: "Meeting Notes" },
  { value: "project-notes", label: "Project Notes" },
  { value: "client-brief",  label: "Client Brief" },
];

interface Props {
  sessionVersion: number;
  hasDbPassword: boolean;
  gmailConnected: boolean;
  gmailEmail: string;
  calendarConnected: boolean;
  hasToneProfile: boolean;
  toneSampleCount: number;
  styleNote: string;
  emailSyncLimit: number;
  noteDefaultType: NoteType;
  emailFromAddress: string;
  emailTaskFilterAddresses: string[];
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border/50 bg-sidebar-accent/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground uppercase tracking-widest block">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SettingsClient({
  sessionVersion,
  hasDbPassword,
  gmailConnected,
  gmailEmail,
  calendarConnected,
  hasToneProfile,
  toneSampleCount,
  styleNote: initialStyleNote,
  emailSyncLimit: initialSyncLimit,
  noteDefaultType: initialNoteDefaultType,
  emailFromAddress: initialFromAddress,
  emailTaskFilterAddresses: initialFilterAddresses,
}: Props) {

  // ── Connections state ──────────────────────────────────────────────────
  const [gmailLoading, setGmailLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [gmailIsConnected, setGmailIsConnected] = useState(gmailConnected);
  const [calendarIsConnected, setCalendarIsConnected] = useState(calendarConnected);

  // ── Email & AI state ───────────────────────────────────────────────────
  const [syncLimit, setSyncLimit] = useState(String(initialSyncLimit));
  const [syncLimitLoading, setSyncLimitLoading] = useState(false);
  const [styleNote, setStyleNote] = useState(initialStyleNote);
  const [styleNoteLoading, setStyleNoteLoading] = useState(false);
  const [toneProfileExists, setToneProfileExists] = useState(hasToneProfile);
  const [clearToneLoading, setClearToneLoading] = useState(false);

  // ── Email task filter allowlist state ─────────────────────────────────
  const [filterAddresses, setFilterAddresses] = useState<string[]>(initialFilterAddresses);
  const [newFilterAddress, setNewFilterAddress] = useState("");
  const [filterSaving, setFilterSaving] = useState(false);

  // ── Notes & Briefs state ───────────────────────────────────────────────
  const [noteDefaultType, setNoteDefaultType] = useState<NoteType>(initialNoteDefaultType);
  const [noteTypeLoading, setNoteTypeLoading] = useState(false);
  const [fromAddress, setFromAddress] = useState(initialFromAddress);
  const [fromAddressLoading, setFromAddressLoading] = useState(false);

  // ── Access & Security state ────────────────────────────────────────────
  const [kickModalOpen, setKickModalOpen] = useState(false);
  const [kickPassword, setKickPassword] = useState("");
  const [kickLoading, setKickLoading] = useState(false);
  const [kickError, setKickError] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  const [logoutLoading, setLogoutLoading] = useState(false);

  // ── Connections handlers ───────────────────────────────────────────────
  async function handleDisconnectGmail() {
    if (!confirm("Disconnect Gmail? You'll need to re-authenticate to use email features.")) return;
    setGmailLoading(true);
    try {
      await disconnectGmailAction();
      setGmailIsConnected(false);
      toast.success("Gmail disconnected");
    } catch {
      toast.error("Failed to disconnect Gmail");
    } finally {
      setGmailLoading(false);
    }
  }

  async function handleDisconnectCalendar() {
    if (!confirm("Disconnect Google Calendar? You'll need to re-authenticate to use calendar features.")) return;
    setCalendarLoading(true);
    try {
      await disconnectCalendarAction();
      setCalendarIsConnected(false);
      toast.success("Google Calendar disconnected");
    } catch {
      toast.error("Failed to disconnect Calendar");
    } finally {
      setCalendarLoading(false);
    }
  }

  // ── Email & AI handlers ────────────────────────────────────────────────
  async function handleSaveSyncLimit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseInt(syncLimit, 10);
    if (isNaN(val) || val < 10 || val > 500) {
      toast.error("Enter a number between 10 and 500");
      return;
    }
    setSyncLimitLoading(true);
    try {
      await setEmailSyncLimitAction(val);
      toast.success("Sync limit saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSyncLimitLoading(false);
    }
  }

  async function handleSaveStyleNote(e: React.FormEvent) {
    e.preventDefault();
    setStyleNoteLoading(true);
    try {
      await saveStyleNoteAction(styleNote);
      toast.success("Style note saved");
    } catch {
      toast.error("Failed to save style note");
    } finally {
      setStyleNoteLoading(false);
    }
  }

  async function handleClearToneProfile() {
    if (!confirm("Clear the tone profile? AI will re-learn your style after the next tone analysis.")) return;
    setClearToneLoading(true);
    try {
      await clearToneProfileAction();
      setToneProfileExists(false);
      toast.success("Tone profile cleared");
    } catch {
      toast.error("Failed to clear tone profile");
    } finally {
      setClearToneLoading(false);
    }
  }

  // ── Email task filter handlers ─────────────────────────────────────────
  async function handleAddFilterAddress(e: React.FormEvent) {
    e.preventDefault();
    const addr = newFilterAddress.trim().toLowerCase();
    if (!addr) return;
    if (filterAddresses.includes(addr)) {
      toast.error("Address already in list");
      return;
    }
    const updated = [...filterAddresses, addr];
    setFilterSaving(true);
    try {
      await saveEmailTaskFilterAction(updated);
      setFilterAddresses(updated);
      setNewFilterAddress("");
      toast.success("Sender added");
    } catch {
      toast.error("Failed to save");
    } finally {
      setFilterSaving(false);
    }
  }

  async function handleRemoveFilterAddress(addr: string) {
    const updated = filterAddresses.filter((a) => a !== addr);
    setFilterSaving(true);
    try {
      await saveEmailTaskFilterAction(updated);
      setFilterAddresses(updated);
      toast.success("Sender removed");
    } catch {
      toast.error("Failed to save");
    } finally {
      setFilterSaving(false);
    }
  }

  // ── Notes & Briefs handlers ────────────────────────────────────────────
  async function handleSaveNoteType(type: NoteType) {
    setNoteDefaultType(type);
    setNoteTypeLoading(true);
    try {
      await setNoteDefaultTypeAction(type);
      toast.success("Default document type saved");
    } catch {
      toast.error("Failed to save document type");
    } finally {
      setNoteTypeLoading(false);
    }
  }

  async function handleSaveFromAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!fromAddress.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setFromAddressLoading(true);
    try {
      await setEmailFromAddressAction(fromAddress);
      toast.success("From address saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setFromAddressLoading(false);
    }
  }

  // ── Access & Security handlers ─────────────────────────────────────────
  async function handleLogout() {
    setLogoutLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function handleKickEveryone(e: React.FormEvent) {
    e.preventDefault();
    setKickLoading(true);
    setKickError("");
    try {
      await invalidateAllSessionsAction(kickPassword);
      toast.success("All sessions invalidated. Signing you out...");
      setTimeout(() => { window.location.href = "/login"; }, 1200);
    } catch (err) {
      setKickError(err instanceof Error ? err.message : "Failed");
      setKickLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPw !== confirmPw) { setPwError("New passwords do not match"); return; }
    if (newPw.length < 4) { setPwError("Password must be at least 4 characters"); return; }
    setPwLoading(true);
    try {
      await changeSitePasswordAction(currentPw, newPw);
      toast.success("Password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPwLoading(false);
    }
  }

  // ── Shared class helpers ───────────────────────────────────────────────
  const inputCls = "w-full bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors";
  const saveBtnCls = "flex items-center gap-2 px-4 py-2 text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40";

  return (
    <div className="space-y-4">

      {/* ── 1. Connections ──────────────────────────────────────────────── */}
      <Section icon={Mail} title="Connections">
        <div className="space-y-4">
          {/* Gmail */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Gmail</p>
              {gmailIsConnected
                ? <p className="text-xs text-muted-foreground mt-0.5">{gmailEmail || "Connected"}</p>
                : <p className="text-xs text-muted-foreground/50 mt-0.5">Not connected</p>
              }
            </div>
            {gmailIsConnected ? (
              <button
                onClick={handleDisconnectGmail}
                disabled={gmailLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/60 transition-colors disabled:opacity-40"
              >
                {gmailLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                Disconnect
              </button>
            ) : (
              <a
                href="/api/auth/gmail"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-primary/50 text-primary hover:bg-primary/5 transition-colors"
              >
                Connect
              </a>
            )}
          </div>

          <div className="border-t border-border/30" />

          {/* Google Calendar */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Google Calendar</p>
              {calendarIsConnected
                ? <p className="text-xs text-muted-foreground mt-0.5">Connected</p>
                : <p className="text-xs text-muted-foreground/50 mt-0.5">Not connected</p>
              }
            </div>
            {calendarIsConnected ? (
              <button
                onClick={handleDisconnectCalendar}
                disabled={calendarLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/60 transition-colors disabled:opacity-40"
              >
                {calendarLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                Disconnect
              </button>
            ) : (
              <a
                href="/api/auth/google"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-primary/50 text-primary hover:bg-primary/5 transition-colors"
              >
                Connect
              </a>
            )}
          </div>
        </div>
      </Section>

      {/* ── 2. Email & AI ───────────────────────────────────────────────── */}
      <Section icon={Sparkles} title="Email & AI">

        {/* Sync limit */}
        <form onSubmit={handleSaveSyncLimit} className="space-y-2">
          <Field label="Emails synced per refresh">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={500}
                value={syncLimit}
                onChange={(e) => setSyncLimit(e.target.value)}
                className="w-24 bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors"
              />
              <button type="submit" disabled={syncLimitLoading} className={saveBtnCls}>
                {syncLimitLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
            <p className="text-xs text-muted-foreground/50 mt-1">
              10–500. Higher values take longer to sync.
            </p>
          </Field>
        </form>

        <div className="border-t border-border/30" />

        {/* Style note */}
        <form onSubmit={handleSaveStyleNote} className="space-y-2">
          <Field label="Writing style note">
            <textarea
              value={styleNote}
              onChange={(e) => setStyleNote(e.target.value)}
              rows={3}
              placeholder="e.g. Keep replies concise and direct. Use first names. Avoid corporate jargon."
              className={`${inputCls} resize-none font-mono text-xs`}
            />
          </Field>
          <p className="text-xs text-muted-foreground/50">
            Included in every AI reply draft as additional context about your voice.
          </p>
          <button type="submit" disabled={styleNoteLoading} className={saveBtnCls}>
            {styleNoteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Style Note
          </button>
        </form>

        <div className="border-t border-border/30" />

        {/* Tone profile */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-foreground">AI Tone Profile</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {toneProfileExists
                ? `Learned from ${toneSampleCount > 0 ? `${toneSampleCount} sent emails` : "your sent history"}.`
                : "No tone profile yet. Run tone analysis from the email compose panel."}
            </p>
          </div>
          {toneProfileExists && (
            <button
              onClick={handleClearToneProfile}
              disabled={clearToneLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/60 transition-colors disabled:opacity-40 shrink-0"
            >
              {clearToneLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Clear
            </button>
          )}
        </div>

        <div className="border-t border-border/30" />

        {/* Task extraction allowlist */}
        <div className="space-y-3">
          <Field label="Task Extraction — Allowed Senders">
            <p className="text-xs text-muted-foreground/60 mb-2 leading-relaxed">
              Only emails from these addresses are scanned for task suggestions during sync. Keeps noise out of your task queue.
            </p>
            {/* Existing chips */}
            {filterAddresses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {filterAddresses.map((addr) => (
                  <span
                    key={addr}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] bg-sidebar-accent/40 border border-border/50 text-foreground/80"
                  >
                    {addr}
                    <button
                      onClick={() => handleRemoveFilterAddress(addr)}
                      disabled={filterSaving}
                      className="text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-40"
                      title="Remove"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {filterAddresses.length === 0 && (
              <p className="text-[11px] text-muted-foreground/40 mb-2 italic">
                No senders added yet — task extraction won&apos;t run automatically.
              </p>
            )}
            {/* Add new */}
            <form onSubmit={handleAddFilterAddress} className="flex items-center gap-2">
              <input
                type="email"
                value={newFilterAddress}
                onChange={(e) => setNewFilterAddress(e.target.value)}
                placeholder="client@example.com"
                className="flex-1 bg-transparent border border-border px-3 py-1.5 text-xs outline-none focus:border-foreground transition-colors"
              />
              <button
                type="submit"
                disabled={filterSaving || !newFilterAddress.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-40"
              >
                {filterSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add
              </button>
            </form>
          </Field>
        </div>
      </Section>

      {/* ── 3. Notes & Briefs ───────────────────────────────────────────── */}
      <Section icon={FileText} title="Notes & Briefs">

        {/* Default doc type */}
        <Field label="Default document type">
          <div className="flex flex-wrap gap-1.5">
            {NOTE_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSaveNoteType(opt.value)}
                disabled={noteTypeLoading}
                className={`px-3 py-1.5 text-xs border transition-colors disabled:opacity-50 ${
                  noteDefaultType === opt.value
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/50 mt-2">
            Pre-selected when you open Notes &amp; Briefs.
          </p>
        </Field>

        <div className="border-t border-border/30" />

        {/* Email from address */}
        <form onSubmit={handleSaveFromAddress} className="space-y-2">
          <Field label='Email "From" address'>
            <input
              type="text"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="e.g. PRDCR <noreply@prdcr.co>"
              className={inputCls}
            />
          </Field>
          <p className="text-xs text-muted-foreground/50">
            Sender shown when you email a note via Resend. Leave blank to use the{" "}
            <code className="font-mono text-[10px]">RESEND_FROM_EMAIL</code> env var.
          </p>
          <button type="submit" disabled={fromAddressLoading} className={saveBtnCls}>
            {fromAddressLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </form>
      </Section>

      {/* ── 4. Access & Security ────────────────────────────────────────── */}
      <Section icon={ShieldOff} title="Access & Security">

        {/* Session management */}
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Active session token:{" "}
              <span className="font-mono text-foreground">v{sessionVersion}</span>
            </p>
            <p>
              Invalidating sessions signs out{" "}
              <span className="font-medium text-foreground">everyone</span>,
              including you. You can log back in immediately.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { setKickModalOpen(true); setKickPassword(""); setKickError(""); }}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-destructive/60 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Invalidate All Sessions
            </button>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
            >
              {logoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              Log Out
            </button>
          </div>
        </div>

        <div className="border-t border-border/30" />

        {/* Change password */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Site Password</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Change the password required to access PRDCR.
            {!hasDbPassword && (
              <span className="block mt-1 text-muted-foreground/60">
                Currently using the password set via environment variable.
              </span>
            )}
          </p>
          <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
            <Field label="Current Password">
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                className={inputCls}
                placeholder="••••••••"
              />
            </Field>
            <Field label="New Password">
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                className={inputCls}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Confirm New Password">
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                className={inputCls}
                placeholder="••••••••"
              />
            </Field>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <button
              type="submit"
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              className={saveBtnCls}
            >
              {pwLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Change Password
            </button>
          </form>
        </div>
      </Section>

      {/* ── Kick Everyone Modal ────────────────────────────────────────── */}
      {kickModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !kickLoading && setKickModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm border border-border bg-background p-6 space-y-5 mx-4">
            <div>
              <h3 className="text-sm font-bold">Invalidate All Sessions</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                This immediately signs out{" "}
                <span className="text-foreground font-medium">everyone</span>{" "}
                currently logged in, including you. You can log back in right
                away with the same password.
              </p>
            </div>
            <form onSubmit={handleKickEveryone} className="space-y-3">
              <Field label="Confirm with your password">
                <input
                  type="password"
                  value={kickPassword}
                  onChange={(e) => setKickPassword(e.target.value)}
                  autoFocus
                  autoComplete="current-password"
                  className={`w-full bg-transparent border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors ${
                    kickError ? "border-destructive" : "border-border"
                  }`}
                  placeholder="••••••••"
                />
                {kickError && <p className="text-xs text-destructive mt-1">{kickError}</p>}
              </Field>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setKickModalOpen(false)}
                  disabled={kickLoading}
                  className="flex-1 py-2 text-xs border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={kickLoading || !kickPassword}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {kickLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Sign Everyone Out
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
