---
name: project-handwriting-calendar
description: User's handwriting-style calendar web app project — calendar.html, single-file HTML/CSS/JS, localStorage + browser notifications
metadata:
  type: project
---

User is building a Korean handwriting-style calendar at `c:\Users\euiky\OneDrive\Desktop\역사에 남을 그 폴더\calendar.html`.

**Why:** Personal scheduling tool with handwriting aesthetic — uses Korean Google Fonts (Nanum Pen Script, Gaegu, Gamja Flower).

**How to apply:**
- Single-file HTML (no build step, no server) — keep additions self-contained in calendar.html.
- Storage: localStorage key `handwriting-calendar-events-v1`, shape `{ "YYYY-MM-DD": ["event text", ...] }`. Notified tracker key `handwriting-calendar-notified-v1`.
- Notifications: in-page popup + browser Notification API. Fires for today's events and tomorrow's events (1 day before). Re-checks every 30min while page is open.
- User confirmed they want BOTH browser notification + in-page popup, AND BOTH localStorage auto-save + JSON export/import.
- Known limitation: notifications only work while page is open — server/push needed for background alerts (not yet requested).
