"use client";

import { Mail, CheckCircle2, Zap, ListChecks, AlertTriangle } from "lucide-react";

export function GmailConnect({ error, detail }: { error?: string; detail?: string }) {
  const features = [
    {
      icon: Mail,
      text: "View and reply to emails without leaving the tool",
    },
    {
      icon: ListChecks,
      text: "Auto-extract tasks from incoming emails with a one-click approval queue",
    },
    {
      icon: Zap,
      text: "AI drafts replies in your voice — learns from your email history",
    },
    {
      icon: AlertTriangle,
      text: "Get warned when a client suggests a date that conflicts with your schedule",
    },
  ];

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        {/* Icon + header */}
        <div className="space-y-3">
          <div className="w-12 h-12 flex items-center justify-center border border-border">
            <Mail className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Connect Gmail</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bring your email workflow into PRDCR. One OAuth connection, full control.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <ul className="space-y-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <li key={i} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-sm text-muted-foreground">{f.text}</span>
              </li>
            );
          })}
        </ul>

        {/* Permissions note */}
        <div className="border border-border p-3 space-y-1">
          <p className="text-xs font-medium text-foreground">Permissions requested</p>
          <p className="text-xs text-muted-foreground">
            Read emails · Send replies · Modify labels. We never store your full email
            history — only the inbox messages you sync.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="border border-destructive/50 bg-destructive/10 p-3 space-y-1">
            <p className="text-xs font-medium text-destructive">
              {error === "token_exchange_failed" ? "Authentication failed" : error}
            </p>
            {detail && (
              <p className="text-xs text-muted-foreground font-mono break-all">{detail}</p>
            )}
          </div>
        )}

        {/* Connect button */}
        <a
          href="/api/auth/gmail"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Connect with Google
        </a>

        <p className="text-xs text-muted-foreground text-center">
          You can disconnect at any time from settings.
        </p>
      </div>
    </div>
  );
}
