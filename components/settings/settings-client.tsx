"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LogOut, ShieldOff, KeyRound, Loader2 } from "lucide-react";
import {
  invalidateAllSessionsAction,
  changeSitePasswordAction,
} from "@/app/actions";

interface Props {
  sessionVersion: number;
  hasDbPassword: boolean;
}

export function SettingsClient({ sessionVersion, hasDbPassword }: Props) {
  // ── Kick everyone state ────────────────────────────────────────────────
  const [kickModalOpen, setKickModalOpen] = useState(false);
  const [kickPassword, setKickPassword] = useState("");
  const [kickLoading, setKickLoading] = useState(false);
  const [kickError, setKickError] = useState("");

  // ── Change password state ──────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  // ── Log out (self only) ────────────────────────────────────────────────
  const [logoutLoading, setLogoutLoading] = useState(false);

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
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      setKickError(err instanceof Error ? err.message : "Failed");
      setKickLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPw !== confirmPw) {
      setPwError("New passwords do not match");
      return;
    }
    if (newPw.length < 4) {
      setPwError("Password must be at least 4 characters");
      return;
    }
    setPwLoading(true);
    try {
      await changeSitePasswordAction(currentPw, newPw);
      toast.success("Password changed successfully");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Session Management ─────────────────────────────────────────── */}
      <div className="border border-border/50 bg-sidebar-accent/20 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Session Management</h2>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Active session token:{" "}
            <span className="font-mono text-foreground">v{sessionVersion}</span>
          </p>
          <p>
            Invalidating sessions signs out{" "}
            <span className="font-medium text-foreground">everyone</span>,
            including you. You can immediately log back in with the same
            password.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              setKickModalOpen(true);
              setKickPassword("");
              setKickError("");
            }}
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
            {logoutLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            Log Out
          </button>
        </div>
      </div>

      {/* ── Change Password ────────────────────────────────────────────── */}
      <div className="border border-border/50 bg-sidebar-accent/20 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Site Password</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Change the password required to access PRDCR.
          {!hasDbPassword && (
            <span className="block mt-1 text-muted-foreground/70">
              Currently using the password set via environment variable.
            </span>
          )}
        </p>

        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">
              Current Password
            </label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              className="w-full bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">
              New Password
            </label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-transparent border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors"
              placeholder="••••••••"
            />
          </div>

          {pwError && (
            <p className="text-xs text-destructive">{pwError}</p>
          )}

          <button
            type="submit"
            disabled={pwLoading || !currentPw || !newPw || !confirmPw}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {pwLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Change Password
          </button>
        </form>
      </div>

      {/* ── Kick Everyone Modal ────────────────────────────────────────── */}
      {kickModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !kickLoading && setKickModalOpen(false)}
          />

          {/* Modal */}
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
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase tracking-widest">
                  Confirm with your password
                </label>
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
                {kickError && (
                  <p className="text-xs text-destructive">{kickError}</p>
                )}
              </div>

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
                  {kickLoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
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
