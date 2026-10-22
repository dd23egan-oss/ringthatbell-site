# Ring That Bell Fantasy Football — website

Live at https://ringthatbellfootball.com (GitHub Pages).

- `index.html` — the whole site (single-page app). `404.html` is an identical copy so every path (e.g. `/draft-dollars`) serves the app with the URL intact.
- Data is NOT stored here. Every page fetches live JSON from the league's Google Apps Script API, which reads the Google Sheet.
- To change the site: edit `index.html`, commit to `main`, and GitHub Pages redeploys automatically in about a minute.
