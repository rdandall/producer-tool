import { CalendarClient } from "@/components/calendar/calendar-client";
import { MobileCalendar } from "@/components/mobile/mobile-calendar";
import { ResponsivePage } from "@/components/mobile/responsive-page";

export default function CalendarPage() {
  return (
    <ResponsivePage
      desktop={<CalendarClient />}
      mobile={<MobileCalendar />}
    />
  );
}
