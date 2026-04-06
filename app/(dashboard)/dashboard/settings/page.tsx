import { getSetting } from "@/lib/db/settings";
import { SettingsClient } from "@/components/settings/settings-client";
import { MobileSettings } from "@/components/mobile/mobile-settings";
import { ResponsivePage } from "@/components/mobile/responsive-page";

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
    emailTaskFilterRaw,
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
    getSetting("email_task_filter_addresses"),
  ]);

  const sessionVersion = parseInt(sessionVersionRaw ?? "1", 10) || 1;
  const hasDbPassword = !!sitePasswordDb;
  const gmailConnected = !!gmailRefreshToken;
  const calendarConnected = !!googleRefreshToken;
  const hasToneProfile = !!toneProfileRaw;
  const toneSampleCount = parseInt(toneSampleCountRaw ?? "0", 10) || 0;
  const emailSyncLimit = parseInt(emailSyncLimitRaw ?? "50", 10) || 50;
  const emailTaskFilterAddresses: string[] = emailTaskFilterRaw ? JSON.parse(emailTaskFilterRaw) : [];

  return (
    <ResponsivePage
      desktop={
        <div className="flex-1 overflow-y-auto">
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
            emailTaskFilterAddresses={emailTaskFilterAddresses}
          />
          </div>
        </div>
      }
      mobile={
        <MobileSettings
          gmailConnected={gmailConnected}
          gmailEmail={gmailEmail ?? ""}
          calendarConnected={calendarConnected}
          hasToneProfile={hasToneProfile}
        />
      }
    />
  );
}
