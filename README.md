# Ring That Bell Fantasy Football — website

Live at https://ringthatbellfootball.com (GitHub Pages).

- `index.html` — the whole site (single-page app). Every page also has its own copy at `/<page>/index.html` (and every blog post at `/blog/<post-id>/index.html`) carrying that page's title, description and preview image, so shared links preview properly in WhatsApp, iMessage and Slack. `404.html` serves the app for any other path.
- `og-image.jpg` — the logo used in link previews.
- `_build/` — not published. `make_static.py` builds all of the above from the Apps Script master (`Index.master.html` is a snapshot of it); `test/` has an offline browser test.
- Data is NOT stored here. Every page fetches live JSON from the league's Google Apps Script API, which reads the Google Sheet.
- To change the site: edit `index.html`, commit to `main`, and GitHub Pages redeploys automatically in about a minute.
