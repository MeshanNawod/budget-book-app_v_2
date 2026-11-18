<div align="center">

# Budget Book (v2)

Record income, expenses and bills, see who holds the money, print a complete budget book, and sell tickets with QR codes.

[![Live demo](https://img.shields.io/badge/Live_demo-Open_in_browser-2ea44f?style=for-the-badge&logo=githubpages&logoColor=white)](https://meshannawod.github.io/budget-book-app_v_2/)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) ![PWA](https://img.shields.io/badge/PWA-offline_ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)

<img src="docs/screenshot.png" alt="Budget Book start screen" width="860">

</div>

- **Budget:** works on its own, with your data stored only on your device. Open `index.html`, or put this folder on GitHub Pages.
- **Tickets:** printed ticket books with QR codes, a portal for sellers, an entrance scanner and online sales. These need a free Supabase database; follow **HOSTING.md**.

## Files
- `index.html`: the whole app
- `config.js`: your ticket database address (fill it in after HOSTING.md, Part B step 5)
- `sw.js`, `manifest.json`, `favicon.ico`, `icons/`: let the app install and work offline
- `supabase/schema.sql`: paste into Supabase once
- `supabase/functions/payhere/index.ts`: optional card-payment function

## Install on a phone
Open your site link. On Android (Chrome), tap ⋮ → **Install app**. On iPhone (Safari), tap Share → **Add to Home Screen**.

## Keep your data safe
Save a budget backup often from **Settings → Save backup**. Restore it on any device with **Restore backup**.
