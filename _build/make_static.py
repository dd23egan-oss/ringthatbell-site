#!/usr/bin/env python3
"""Build the GitHub Pages site from the Apps Script master (Index.html).

Usage:  python3 _build/make_static.py [path/to/Index.html]
        (default master: /mnt/user-data/outputs/Index.html, else the snapshot
         _build/Index.master.html that every build refreshes)

What it does to the master:
  1. bakes the CONFIG defaults and swaps google.script.run for a fetch()
     adapter that calls the league's Apps Script JSON API;
  2. adds history routing (every page has its own address) and a build stamp;
  3. writes one real HTML file per page (/<slug>/index.html) and per blog post
     (/blog/<post-id>/index.html), each with its own <title>, description and
     Open Graph tags, so links shared in WhatsApp/iMessage/Slack preview with
     the page's name and description (link previewers don't run JavaScript);
  4. writes index.html (home) and 404.html (fallback for any other path).

Lives in _build/ so GitHub Pages (Jekyll) does not publish it.
"""
import datetime
import html
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SNAPSHOT = os.path.join(HERE, 'Index.master.html')
MASTER = sys.argv[1] if len(sys.argv) > 1 else (
    '/mnt/user-data/outputs/Index.html' if os.path.exists('/mnt/user-data/outputs/Index.html') else SNAPSHOT)

SITE_URL = 'https://ringthatbellfootball.com'
SITE_NAME = 'Ring That Bell Fantasy Football'
OG_IMAGE = SITE_URL + '/og-image.jpg'
API_URL = ('https://script.google.com/macros/s/'
           'AKfycbzkXxO6P94GnRy9l3Uu9982gwv2D_BP1JF31diQ2KLCoAc-cr7jSWFenzf7KrXeHgevBQ/exec')

# page id -> (url slug, title, description)
PAGES = {
    'home': ('', SITE_NAME,
             'The official home of the Ring That Bell Fantasy Football League, est. 2014: standings, '
             'schedule, trades, keepers, devy picks, records and every season of league history.'),
    'thisweek': ('this-week', "This Week's Matchups",
                 "This week's Ring That Bell matchups: scores, projections and the head-to-head "
                 'history behind every game.'),
    'current': ('current-season', 'Season Standings',
                'Current Ring That Bell standings, the playoff picture, magic numbers and '
                'clinching scenarios.'),
    'schedule': ('schedule', 'Schedule',
                 "Every week's Ring That Bell matchups and results, filterable by owner and season."),
    'budgets': ('draft-dollars', 'Draft Dollars',
                "Every owner's draft dollars for the next two seasons, draft-dollar history by year "
                'and the full trade history.'),
    'keepers': ('keeper-options', 'Keeper Prices & Options',
                'Keeper and franchise-tag prices for every rostered player, plus taxi and devy '
                'options and the keeper cost calculator.'),
    'taxisquads': ('taxi-squads', 'Taxi Squads',
                   "Every owner's taxi squad: who's stashed and what they cost to keep."),
    'devydraft': ('devy-draft', 'Devy Picks & Players',
                  'Upcoming devy picks, active college devy players, every devy pick ever made and '
                  'the devy draft report card.'),
    'devy': ('devy-players', 'Active Devy Players',
             'The college players Ring That Bell owners are holding as devy picks, by owner, '
             'school and position.'),
    'draft': ('draft-history', 'Draft History',
              'Every Ring That Bell auction draft since 2014: who went where, for how much, '
              'and who was kept.'),
    'seasons': ('seasons', 'Standings by Season',
                'Final standings for every Ring That Bell season since 2014, overall and by '
                'division.'),
    'h2h': ('head-to-head', 'Owner Head-to-Head Records',
            'All-time head-to-head records between every pair of Ring That Bell owners.'),
    'records': ('record-book', 'League Record Book',
                'The Ring That Bell record book: career, season, single-week, matchup and streak '
                'records since 2014.'),
    'topplayers': ('top-players', 'Most Started & Top Scoring Players',
                   'The players Ring That Bell owners have started most, and the top scorers '
                   'in league history.'),
    'lineups': ('lineups', 'Historic Starting Lineups',
                'Every Ring That Bell starting lineup and positional scoring, by owner and season.'),
    'trophy': ('trophy-room', 'Trophy Room',
               'Champions, runners-up, scoring titles and league honors from every Ring That '
               'Bell season.'),
    'constitution': ('constitution', 'League Constitution',
                     'The Ring That Bell constitution: divisions, playoffs, keepers, devy, taxi '
                     'squads, draft dollars and trade rules.'),
    'divisions': ('division-history', 'Division vs Division',
                  'How the Premier, Second and Third divisions (and the old East, Central and '
                  'West) stack up, all time and year by year.'),
    'blog': ('blog', 'League Blog',
             'Ring That Bell blog: playoff races, trade-deadline guides and league storylines.'),
    'pickem': ('pickem', "Pick'em",
               "Ring That Bell pick'em: this week's lines, everyone's picks, standings and results."),
    'owners': ('owners', 'Owner Profiles',
               'Career records, championships, playoff history and head-to-head results for every '
               'Ring That Bell owner.'),
}


def esc(t):
    return html.escape(t, quote=True)


def head_meta(title, desc, url, og_type='website'):
    full = title if title == SITE_NAME else title + ' | ' + SITE_NAME
    short = title if title == SITE_NAME else title + ' | Ring That Bell'
    return '\n'.join([
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>%s</title>' % esc(full),
        '<meta name="description" content="%s">' % esc(desc),
        '<link rel="canonical" href="%s">' % esc(url),
        '<meta property="og:site_name" content="%s">' % esc(SITE_NAME),
        '<meta property="og:type" content="%s">' % og_type,
        '<meta property="og:title" content="%s">' % esc(short),
        '<meta property="og:description" content="%s">' % esc(desc),
        '<meta property="og:url" content="%s">' % esc(url),
        '<meta property="og:image" content="%s">' % OG_IMAGE,
        '<meta property="og:image:width" content="600">',
        '<meta property="og:image:height" content="600">',
        '<meta name="twitter:card" content="summary">',
        '<meta name="twitter:title" content="%s">' % esc(short),
        '<meta name="twitter:description" content="%s">' % esc(desc),
        '<meta name="twitter:image" content="%s">' % OG_IMAGE,
    ])


def js_str(t):
    return "'" + t.replace('\\', '\\\\').replace("'", "\\'") + "'"


def adapter_js(build):
    slugs = ', '.join('%s: %s' % (k, js_str(v[0])) for k, v in PAGES.items())
    titles = ', '.join('%s: %s' % (k, js_str(v[1])) for k, v in PAGES.items())
    return r"""var CONFIG = { LeagueName: 'Ring That Bell Fantasy Football', EstablishedYear: '2014', Tagline: 'It just means more', HeroImageURL: '', LogoURL: '', PrimaryColor: '#0f5c2e', AccentColor: '#C9A227', CountdownTarget: '', FooterText: '' };
try { var _cc = localStorage.getItem('rtb_cfg_v1'); if (_cc) CONFIG = JSON.parse(_cc); } catch (eCfg) { }

// ---------- static-site adapter ----------
// The pages are served from GitHub Pages; the data still comes live from the
// Google Sheet through the league's Apps Script JSON API.
var RTB_BUILD = '__BUILD__';
window.RTB_BUILD = RTB_BUILD;
var API_URL = '__API__';
var google = { script: {} };
Object.defineProperty(google.script, 'run', {
  get: function () {
    var ok = function () { }, fail = function (e) { try { console.error(e); } catch (x) { } };
    var base = {
      withSuccessHandler: function (f) { if (f) ok = f; return proxy; },
      withFailureHandler: function (f) { if (f) fail = f; return proxy; },
      withUserObject: function () { return proxy; }
    };
    var proxy = new Proxy(base, {
      get: function (t, name) {
        if (name in t) return t[name];
        if (typeof name !== 'string') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          var qs = API_URL + '?fn=' + encodeURIComponent(name) +
            (args.length ? '&args=' + encodeURIComponent(JSON.stringify(args)) : '');
          fetch(qs).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          }).then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'API error');
            // run the success handler outside the promise chain: a render bug
            // must not be reported as an API failure
            setTimeout(function () { ok(j.data); }, 0);
          }).catch(function (e) { fail(e); });
        };
      }
    });
    return proxy;
  }
});
// Refresh branding config in the background; baked defaults paint first.
setTimeout(function () {
  google.script.run.withSuccessHandler(function (cfg) {
    if (!cfg) return;
    try { localStorage.setItem('rtb_cfg_v1', JSON.stringify(cfg)); } catch (eS) { }
    CONFIG = cfg;
    try { applyConfig(); } catch (eA) { }
  }).withFailureHandler(function () { }).getConfig();
}, 50);

// ---------- URL routing: every page has its own address ----------
var SITE_BASE = /\.github\.io$/.test(location.hostname) ? '/ringthatbell-site' : '';
var PAGE_SLUGS = { __SLUGS__ };
var PAGE_TITLES = { __TITLES__ };
function setPageTitle_(page) {
  var t = PAGE_TITLES[page];
  try { document.title = (!t || page === 'home') ? 'Ring That Bell Fantasy Football' : t + ' | Ring That Bell'; } catch (e) { }
}
function pageFromPath() {
  var p = location.pathname;
  if (SITE_BASE && p.indexOf(SITE_BASE) === 0) p = p.slice(SITE_BASE.length);
  p = p.replace(/^\/+|\/+$/g, '').replace(/\/index\.html$/, '').toLowerCase();
  if (!p || p === 'index.html' || p === '404.html') return 'home';
  if (/^blog\//.test(p)) return 'blog';
  for (var k in PAGE_SLUGS) if (PAGE_SLUGS[k] === p) return k;
  return PAGE_SLUGS.hasOwnProperty(p) ? p : 'home';
}
var ROUTING_BACK = false;
window.addEventListener('popstate', function () {
  ROUTING_BACK = true;
  try { show(pageFromPath()); } finally { ROUTING_BACK = false; }
});
function routePush(page) {
  var replace = show._aliased; show._aliased = 0;
  setPageTitle_(page);
  if (ROUTING_BACK || !window.history || !history.pushState) return;
  var slug = PAGE_SLUGS.hasOwnProperty(page) ? PAGE_SLUGS[page] : page;
  var url = (SITE_BASE + '/' + slug).replace(/\/+$/, '');
  if (!url) url = '/';
  // a blog post's own address counts as being on the blog page
  var here = location.pathname.replace(/\/+$/, '') || '/';
  if (page === 'blog' && /\/blog\/[^\/]+$/.test(here)) return;
  try {
    if (here !== url) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  } catch (eH) { }
}
""".replace('__BUILD__', build).replace('__API__', API_URL) \
   .replace('__SLUGS__', slugs).replace('__TITLES__', titles)


def must_replace(s, old, new):
    if s.count(old) != 1:
        raise SystemExit('anchor not found exactly once: %r' % old[:80])
    return s.replace(old, new)


def blog_posts(master):
    """Pull id/title/teaser for each post from the master's BLOG_POSTS list."""
    block = master[master.index('var BLOG_POSTS = ['):]
    block = block[:block.index('];')]
    out = []
    for m in re.finditer(r"id:\s*'([^']+)'.*?title:\s*'((?:[^'\\]|\\.)*)'.*?teaser:\s*'((?:[^'\\]|\\.)*)'",
                         block, re.S):
        out.append((m.group(1), m.group(2).replace("\\'", "'"), m.group(3).replace("\\'", "'")))
    return out


def build():
    master = open(MASTER, encoding='utf-8').read()
    # keep a copy of the master next to this script so the site can always be rebuilt
    if os.path.abspath(MASTER) != SNAPSHOT:
        shutil.copyfile(MASTER, SNAPSHOT)
    stamp = datetime.datetime.now().strftime('%m%d.%H%M')
    s = master
    s = must_replace(s, 'var CONFIG = <?!= config ?>;', adapter_js(stamp))
    s = must_replace(s, "var CURPAGE = 'home';", 'var CURPAGE = pageFromPath();')
    s = must_replace(
        s,
        "function show(page) {\n  if (page === 'devy') { page = 'devydraft'; dvSub = 'roster'; show._aliased = 1; }\n  CURPAGE = page;\n",
        "function show(page) {\n  if (page === 'devy') { page = 'devydraft'; dvSub = 'roster'; show._aliased = 1; }\n  CURPAGE = page;\n  routePush(page);\n")
    # every page file gets its own <head> meta right after <head>
    s = must_replace(s, '<head>\n', '<head>\n__META__\n')

    def write(rel, meta):
        path = os.path.join(SITE, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(s.replace('__META__', meta))

    # clear previously generated page folders (keeps CNAME, README, _build, images)
    gen_dirs = set(v[0] for v in PAGES.values() if v[0]) | {'blog'}
    for d in gen_dirs:
        dp = os.path.join(SITE, d)
        if os.path.isdir(dp):
            shutil.rmtree(dp)

    n = 0
    for page, (slug, title, desc) in PAGES.items():
        url = SITE_URL + ('/' + slug + '/' if slug else '/')
        meta = head_meta(title, desc, url)
        if page == 'home':
            write('index.html', meta)
            write('404.html', meta)
            n += 2
        else:
            write(os.path.join(slug, 'index.html'), meta)
            n += 1
    for pid, title, teaser in blog_posts(master):
        url = SITE_URL + '/blog/' + pid + '/'
        write(os.path.join('blog', pid, 'index.html'), head_meta(title, teaser, url, 'article'))
        n += 1
    print('build %s: wrote %d pages' % (stamp, n))


if __name__ == '__main__':
    build()
