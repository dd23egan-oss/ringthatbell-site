const { chromium } = require('playwright');
// serve the repo first:  python3 -m http.server 8765  (from the repo root)
const B = 'http://localhost:8765';
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const page = await b.newPage();
  page.on('pageerror', e => errs.push(e.message));
  // the container can't reach Google: answer every API call with a clean error
  const core = require(__dirname + '/stub.js');
  await page.route('**script.google.com/**', r => { const fn = (r.request().url().match(/fn=([A-Za-z0-9_]+)/) || [])[1]; r.fulfill({ contentType: 'application/json', body: JSON.stringify(fn === 'getCoreData' ? { ok: true, data: core } : { ok: false, error: 'offline test' }) }); });
  const state = async () => page.evaluate(() => ({ path: location.pathname, title: document.title,
    view: (document.querySelector('.view.on') || {}).id }));
  for (const p of ['/schedule', '/draft-dollars', '/record-book', '/blog']) {
    await page.goto(B + p); await page.waitForTimeout(700);
    console.log(p.padEnd(16), JSON.stringify(await state()));
  }
  await page.goto(B + '/blog/week10-trade-deadline'); await page.waitForTimeout(800);
  console.log('post'.padEnd(16), JSON.stringify(await state()), '| post shown:', await page.evaluate(() => !!document.querySelector('#blogBody .bpost')));
  await page.click('#blogBack'); await page.waitForTimeout(300);
  console.log('back btn'.padEnd(16), JSON.stringify(await state()), '| list shown:', await page.evaluate(() => !!document.querySelector('#blogBody .bcard')));
  await page.click('.bcard'); await page.waitForTimeout(300);
  console.log('card click'.padEnd(16), JSON.stringify(await state()));
  await page.goBack(); await page.waitForTimeout(400);
  console.log('browser back'.padEnd(16), JSON.stringify(await state()), '| list shown:', await page.evaluate(() => !!document.querySelector('#blogBody .bcard')));
  await page.goForward(); await page.waitForTimeout(400);
  console.log('browser fwd'.padEnd(16), JSON.stringify(await state()), '| post shown:', await page.evaluate(() => !!document.querySelector('#blogBody .bpost')));
  await page.evaluate(() => show('schedule')); await page.waitForTimeout(300);
  console.log('nav->schedule'.padEnd(16), JSON.stringify(await state()));
  await page.goto(B + '/blog?post=week10-trade-deadline'); await page.waitForTimeout(700);
  console.log('old ?post link'.padEnd(16), JSON.stringify(await state()), '| post shown:', await page.evaluate(() => !!document.querySelector('#blogBody .bpost')));
  console.log(errs.length ? 'JS errors:\n ' + errs.join('\n ') : 'JS errors: none');
  await b.close();
})();
