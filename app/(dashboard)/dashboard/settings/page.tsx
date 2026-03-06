import { getSetting } from "@/lib/db/settings";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const [
    sessionVersionRaw,
    sitePasswordDb,
    gmailRefreshToken,
    gmailEmail,
    googleRefreshToken,
    toneProfileRaw,
    toneSampleCountRaw,
    styleNote,
    emailSyncLimitRaw,
    noteDefaultType,
    emailFromAddress,
  ] = await Promise.all([
    getSetting("session_version"),
    getSetting("site_password"),
    getSetting("gmail_refresh_token"),
    getSetting("gmail_user_email"),
    getSetting("google_refresh_token"),
    getSetting("gmail_tone_profile"),
    getSetting("gmail_tone_sample_count"),
    getSetting("gmail_style_note"),
    getSetting("email_sync_limit"),
    getSetting("note_default_type"),
    getSetting("email_from_address"),
  ]);

  const sessionVersion = parseInt(sessionVersionRaw ?? "1", 10) || 1;
  const hasDbPassword = !!sitePasswordDb;
  const gmailConnected = !!gmailRefreshToken;
  const calendarConnected = !!googleRefreshToken;
  const hasToneProfile = !!toneProfileRaw;
  const toneSampleCount = parseInt(toneSampleCountRaw ?? "0", 10) || 0;
  const emailSyncLimit = parseInt(emailSyncLimitRaw ?? "50", 10) || 50;

  return (
    <div className="p-6 max-w-2xl space-y-2">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure PRDCR to match your workflow.
        </p>
      </div>

      <SettingsClient
        sessionVersion={sessionVersion}
        hasDbPassword={hasDbPassword}
        gmailConnected={gmailConnected}
        gmailEmail={gmailEmail ?? ""}
        calendarConnected={calendarConnected}
        hasToneProfile={hasToneProfile}
        toneSampleCount={toneSampleCount}
        styleNote={styleNote ?? ""}
        emailSyncLimit={emailSyncLimit}
        noteDefaultType={(noteDefaultType ?? "brief") as "brief" | "meeting-notes" | "project-notes" | "client-brief"}
        emailFromAddress={emailFromAddress ?? ""}
      />
    </div>
  );
}
