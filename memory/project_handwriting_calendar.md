---
name: project-handwriting-calendar
description: User's handwriting-style calendar web app project — calendar.html, single-file HTML/CSS/JS, localStorage + browser notifications
metadata:
  type: project
---

User is building a Korean handwriting-style calendar at `c:\my_code\CAL\calendar.html`. Project now lives at `c:\my_code\CAL` with Supabase auth/sync, theme sharing, separate JS modules under `js/`.

**Why:** Personal scheduling tool with handwriting aesthetic — uses Korean Google Fonts (Nanum Pen Script, Gaegu, Gamja Flower).

**How to apply:**
- Single-file HTML for the calendar (no build step) — keep additions self-contained in calendar.html.
- Auxiliary JS modules under `js/`: auth, auth-ui, events, supabaseClient, themeShare, userDataSync.
- Event item shape: `string` OR `{ t: string, th?: string|string[], tt?: true }`. `th` may be a single theme id OR an array (multi-theme) — use `getEventThemeIds/setEventThemes/getEventText` helpers in calendar.html. `tt:true` means timetable item with `(HH:00)` tag.
- localStorage keys: events `handwriting-calendar-events-v1`, themes `calendar-themes-v1`, theme filter `calendar-theme-filter-v1` (defaults to ALL themes ON), cell designs `calendar-cell-design-v1`, motto `calendar-motto-v1`, starred `calendar-starred-dates-v1`, circles `calendar-circles-v1`, memos `calendar-memos-v1`, continuous-view `calendar-continuous-view-v1`.
- Login: Supabase auth via synthesized `<id>@cal-id.local` emails. Google/Phone users get an "ID setup" modal on first sign-in (auth-ui.js `needsIdSetup`).
- Favicon: dynamically generated via canvas inside calendar.html — does NOT depend on `calendar.ico` being fresh (avoids OS taskbar cache showing yesterday's date after login reload).
- Notifications: in-page popup + browser Notification API. Fires for today's and tomorrow's events. Re-checks every 30min.
