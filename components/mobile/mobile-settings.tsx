"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Mail,
  CalendarDays,
  LogOut,
  Shield,
  Smartphone,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface Props {
  gmailConnected: boolean;
  gmailEmail: string;
  calendarConnected: boolean;
  hasToneProfile: boolean;
}

export function MobileSettings({
  gmailConnected,
  gmailEmail,
  calendarConnected,
  hasToneProfile,
}: Props) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  async function requestNotifications() {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
    }
  }

  async function handleLogout() {
    document.cookie = "prdcr_auth=; path=/; max-age=0";
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <h1 className="text-lg font-black tracking-tight">Settings</h1>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {/* Appearance */}
        <div>
          <p className="label-xs mb-2">Appearance</p>
          <Card>
            <CardContent className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-[13px] font-medium">Theme</span>
              <ThemeToggle />
            </CardContent>
          </Card>
        </div>

        {/* Connections */}
        <div>
          <p className="label-xs mb-2">Connections</p>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">Gmail</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {gmailConnected ? gmailEmail : "Not connected"}
                  </p>
                </div>
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    gmailConnected ? "bg-emerald-500" : "bg-muted-foreground/30"
                  )}
                />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-[13px] font-medium">Google Calendar</p>
                  <p className="text-[10px] text-muted-foreground">
                    {calendarConnected ? "Connected" : "Not connected"}
                  </p>
                </div>
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    calendarConnected ? "bg-emerald-500" : "bg-muted-foreground/30"
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications */}
        <div>
          <p className="label-xs mb-2">Notifications</p>
          <Card>
            <CardContent className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-[13px] font-medium">Push Notifications</p>
                    <p className="text-[10px] text-muted-foreground">
                      {notificationsEnabled ? "Enabled" : "Tap to enable"}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={notificationsEnabled ? "outline" : "default"}
                  className="h-7 text-[11px]"
                  onClick={requestNotifications}
                  disabled={notificationsEnabled}
                >
                  {notificationsEnabled ? "On" : "Enable"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI */}
        {hasToneProfile && (
          <div>
            <p className="label-xs mb-2">AI</p>
            <Card>
              <CardContent className="px-4 py-3.5 flex items-center gap-3">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-[13px] font-medium">Tone Profile</p>
                  <p className="text-[10px] text-muted-foreground">Active</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* App info */}
        <div>
          <p className="label-xs mb-2">App</p>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-[13px] font-medium">PRDCR</p>
                  <p className="text-[10px] text-muted-foreground">Production Management</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-destructive active:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <p className="text-[13px] font-medium">Log Out</p>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
