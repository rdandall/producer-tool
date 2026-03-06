import { getSetting } from "@/lib/db/settings";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const sessionVersion =
    parseInt((await getSetting("session_version")) ?? "1", 10) || 1;
  const hasDbPassword = !!(await getSetting("site_password"));

  return (
    <div className="p-6 max-w-2xl space-y-2">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage access and security for PRDCR.
        </p>
      </div>

      <SettingsClient
        sessionVersion={sessionVersion}
        hasDbPassword={hasDbPassword}
      />
    </div>
  );
}
