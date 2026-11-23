// Headless-Chrome smoke test for Crop Price BD.
// Drives the Playwright-cached headless_shell over CDP with Node's built-in
// WebSocket (no npm deps). Run from the project root:
//   node tests/smoke.mjs [1280|390]
// Exits 0 only if every check passes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const PORT = 9235;
const WIDTH = parseInt(process.argv[2] || '1280', 10);
const HEIGHT = WIDTH <= 480 ? 844 : 800;
const URL = 'file://' + path.join(ROOT, 'index.html');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await fn()) return true; } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error('timeout waiting for ' + label);
}

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=' + PORT,
  '--window-size=' + WIDTH + ',' + HEIGHT,
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      break;
    } catch { await sleep(250); }
  }
  if (!targets) throw new Error('DevTools endpoint never came up');

  const pageTarget = targets.find((t) => t.type === 'page');
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const failedReqs = [];
  const nonFileReqs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Network.loadingFailed') {
      failedReqs.push(msg.params.errorText);
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request?.url || '';
      if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('chrome')) nonFileReqs.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) { pending.delete(mid); reject(new Error('CDP timeout: ' + method)); }
    }, 20000);
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const clickTab = async (name) => evalJs(`document.querySelector('[data-tab="${name}"]').click()`);
  const setVal = async (id, v) => evalJs(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(v)}`);
  const setSelect = async (id, v) => evalJs(
    `(function(){var s=document.getElementById(${JSON.stringify(id)}); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change', { bubbles: true }));})()`);
  const errText = async (id) => evalJs(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const cardText = async (frag) => evalJs(
    `[...document.querySelectorAll('#priceList .card')].find(c => c.textContent.includes(${JSON.stringify(frag)}))?.textContent || ''`);
  const clickCardBtn = async (listId, frag, btnText) => evalJs(
    `(function(){var card=[...document.querySelectorAll(${JSON.stringify('#' + listId + ' .card')})].find(c => c.textContent.includes(${JSON.stringify(frag)})); if(!card) return 'no-card'; var b=[...card.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(btnText)}); if(!b) return 'no-btn'; b.click(); return 'ok';})()`);
  const submitEntryForm = async () => evalJs(`document.getElementById('entryForm').requestSubmit()`);
  const fillEntry = async (o) => {
    await setSelect('fCrop', o.crop);
    if (o.customCrop) await setVal('fCustomCrop', o.customCrop);
    await setVal('fVariety', o.variety || '');
    await setVal('fMarket', o.market);
    await setVal('fDistrict', o.district || '');
    await setSelect('fUnit', o.unit || 'maund');
    await setVal('fPrice', o.price != null ? String(o.price) : '');
    await setVal('fDate', o.date || '2026-11-20');
    await setSelect('fBuyer', o.buyer || 'aratdar');
    await setVal('fNotes', o.notes || '');
    await submitEntryForm();
    await sleep(400);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 480 });
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'page load');
  await sleep(500);
  await evalJs('localStorage.clear()');
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'reload');
  await sleep(500);
  await evalJs('window.confirm = () => true');

  console.log(`smoke @ ${WIDTH}x${HEIGHT}: ${URL}`);
  check('page title', (await evalJs('document.title')).includes('Crop Price BD'));
  check('app heading rendered', (await evalJs('document.querySelector("h1").textContent')) === 'Crop Price BD');
  check('stats start at 0 entries', (await evalJs('document.getElementById("stEntries").textContent')) === '0');
  check('stats start at 0 crops', (await evalJs('document.getElementById("stCrops").textContent')) === '0');
  check('empty state visible', (await evalJs('document.querySelector("#priceList .empty") !== null')));
  check('no console errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no failed requests on load', failedReqs.length === 0, failedReqs.join(' | '));
  check('no non-file network requests on load', nonFileReqs.length === 0, nonFileReqs.join(' | '));
  check('no horizontal overflow', (await evalJs('document.documentElement.scrollWidth <= window.innerWidth')));

  // --- validation: empty submit rejected ---
  await submitEntryForm();
  await sleep(300);
  check('empty crop shows inline error', (await errText('fErrCrop')) !== '');
  check('empty market shows inline error', (await errText('fErrMarket')) !== '');
  check('empty price shows inline error', (await errText('fErrPrice')) !== '');
  check('empty buyer shows inline error', (await errText('fErrBuyer')) !== '');
  check('no entry created on invalid submit', (await evalJs('document.getElementById("stEntries").textContent')) === '0');

  // --- validation: future date rejected ---
  await setSelect('fCrop', 'paddy');
  await setVal('fMarket', 'Naogaon Haat');
  await setVal('fPrice', '1200');
  await setVal('fDate', '2027-01-01');
  await setSelect('fBuyer', 'aratdar');
  await submitEntryForm();
  await sleep(300);
  check('future date shows inline error', (await errText('fErrDate')) !== '');
  check('still 0 entries after future date', (await evalJs('document.getElementById("stEntries").textContent')) === '0');

  // --- validation: fractional price rejected ---
  await setVal('fDate', '2026-11-20');
  await setVal('fPrice', '1200.5');
  await submitEntryForm();
  await sleep(300);
  check('fractional price shows inline error', (await errText('fErrPrice')) !== '');
  check('still 0 entries after fractional price', (await evalJs('document.getElementById("stEntries").textContent')) === '0');

  // --- add entry 1: paddy 1200/maund Naogaon, 2026-11-20 ---
  await fillEntry({ crop: 'paddy', variety: 'BRRI-28', market: 'Naogaon Haat', district: 'Naogaon', unit: 'maund', price: 1200, date: '2026-11-20', buyer: 'aratdar' });
  check('entries = 1', (await evalJs('document.getElementById("stEntries").textContent')) === '1');
  check('crops = 1', (await evalJs('document.getElementById("stCrops").textContent')) === '1');
  check('markets = 1', (await evalJs('document.getElementById("stMarkets").textContent')) === '1');
  check('card shows paddy', (await cardText('Paddy')).includes('Paddy'));
  check('card shows price ৳1,200 per maund', (await cardText('Paddy')).includes('৳1,200'));
  check('card shows per-kg conversion ৳30.00/kg', (await cardText('Paddy')).includes('৳30.00/kg'));
  check('card shows market', (await cardText('Paddy')).includes('Naogaon Haat'));

  // --- add entry 2: paddy 1400/maund Rajshahi, 2026-11-21 (higher) ---
  await fillEntry({ crop: 'paddy', variety: 'BRRI-28', market: 'Rajshahi Bazar', district: 'Rajshahi', unit: 'maund', price: 1400, date: '2026-11-21', buyer: 'faria' });
  check('entries = 2', (await evalJs('document.getElementById("stEntries").textContent')) === '2');
  check('markets = 2', (await evalJs('document.getElementById("stMarkets").textContent')) === '2');
  check('best price shows ৳35.00/kg', (await evalJs('document.getElementById("stBest").textContent')).includes('৳35.00/kg'));
  check('worst price shows ৳30.00/kg', (await evalJs('document.getElementById("stWorst").textContent')).includes('৳30.00/kg'));

  // --- add entry 3: onion 50/kg Pabna ---
  await fillEntry({ crop: 'onion', market: 'Pabna Haat', district: 'Pabna', unit: 'kg', price: 50, date: '2026-11-21', buyer: 'local' });
  check('entries = 3', (await evalJs('document.getElementById("stEntries").textContent')) === '3');
  check('crops = 2', (await evalJs('document.getElementById("stCrops").textContent')) === '2');
  check('best price now onion ৳50.00/kg', (await evalJs('document.getElementById("stBest").textContent')).includes('৳50.00/kg'));

  // --- persistence across reload ---
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'reload 2');
  await sleep(500);
  await evalJs('window.confirm = () => true');
  check('entries persist after reload = 3', (await evalJs('document.getElementById("stEntries").textContent')) === '3');

  // --- filter by crop ---
  await setSelect('fltCrop', 'onion');
  await sleep(300);
  check('filter onion shows 1 card', (await evalJs('document.querySelectorAll("#priceList .card").length')) === 1);
  await setSelect('fltCrop', '');
  await sleep(300);
  check('filter cleared shows 3 cards', (await evalJs('document.querySelectorAll("#priceList .card").length')) === 3);

  // --- compare tab: paddy spread ৳5.00/kg (16.67%), trend +16.67% ---
  await clickTab('compare'); await sleep(300);
  check('compare shows 2 crop cards', (await evalJs('document.querySelectorAll("#compareList .card").length')) === 2);
  const paddyCmp = await evalJs(`[...document.querySelectorAll('#compareList .card')].find(c => c.textContent.includes('Paddy'))?.textContent || ''`);
  check('paddy latest ৳35.00/kg', paddyCmp.includes('৳35.00/kg'));
  check('paddy spread ৳5.00/kg', paddyCmp.includes('৳5.00/kg'));
  check('paddy trend +16.67%', paddyCmp.includes('+16.67%'));
  check('paddy 2 markets', paddyCmp.includes('2 markets'));

  // --- XSS: markup in market name is inert ---
  await clickTab('prices'); await sleep(200);
  await fillEntry({ crop: 'jute', market: '<img src=x onerror=alert(1)>', unit: 'maund', price: 3000, date: '2026-11-19', buyer: 'aratdar' });
  check('markup entry added, entries = 4', (await evalJs('document.getElementById("stEntries").textContent')) === '4');
  check('no <img> element rendered from market', (await evalJs('document.querySelector("#priceList .card img")')) === null);
  check('market text kept literally', (await cardText('<img')).includes('<img src=x onerror=alert(1)>'));
  check('delete markup entry', (await clickCardBtn('priceList', '<img', 'Delete')) === 'ok');
  await sleep(300);
  check('markup entry deleted, entries = 3', (await evalJs('document.getElementById("stEntries").textContent')) === '3');

  // --- edit flow: change paddy Rajshahi price 1400 -> 1500 ---
  check('edit button found', (await clickCardBtn('priceList', 'Rajshahi Bazar', 'Edit')) === 'ok');
  await sleep(300);
  check('edit pre-fills market', (await evalJs('document.getElementById("fMarket").value')) === 'Rajshahi Bazar');
  check('edit pre-fills price 1400', (await evalJs('document.getElementById("fPrice").value')) === '1400');
  await setVal('fPrice', '1500');
  await submitEntryForm();
  await sleep(400);
  check('edit updates Rajshahi card to ৳37.50/kg', (await cardText('Rajshahi Bazar')).includes('৳37.50/kg'));
  check('best price still onion ৳50.00/kg', (await evalJs('document.getElementById("stBest").textContent')).includes('৳50.00/kg'));
  check('entries still 3 after edit', (await evalJs('document.getElementById("stEntries").textContent')) === '3');

  // --- profit tab: add cost paddy Boro 2026, 18500/bigha, 22 maund ---
  await clickTab('profit'); await sleep(300);
  check('profit empty state visible', (await evalJs('document.querySelector("#costList .empty") !== null')));
  await setSelect('cCrop', 'paddy');
  await setSelect('cSeason', 'Boro');
  await setVal('cYear', '2026');
  await setVal('cTotal', '18500');
  await setVal('cYield', '22');
  await setVal('bd-seed', '1500');
  await evalJs(`document.getElementById('costForm').requestSubmit()`);
  await sleep(400);
  check('cost records = 1', (await evalJs('document.getElementById("stCosts").textContent')) === '1');
  const costTxt = await evalJs(`document.querySelector('#costList .card')?.textContent || ''`);
  check('break-even ৳840.91/maund', costTxt.includes('৳840.91/maund'));
  check('latest sale ৳1,500.00/maund', costTxt.includes('৳1,500.00/maund'));
  check('profit/maund ৳659.09', costTxt.includes('৳659.09'));
  check('profit/bigha ৳14,500.00', costTxt.includes('৳14,500.00'));

  // --- profit validation: yield 0 rejected ---
  await setSelect('cCrop', 'onion');
  await setSelect('cSeason', 'Rabi');
  await setVal('cYear', '2026');
  await setVal('cTotal', '10000');
  await setVal('cYield', '0');
  await evalJs(`document.getElementById('costForm').requestSubmit()`);
  await sleep(300);
  check('yield 0 shows inline error', (await errText('cErrYield')) !== '');
  check('still 1 cost record', (await evalJs('document.getElementById("stCosts").textContent')) === '1');

  // --- language toggle + persistence ---
  await evalJs('document.getElementById("langToggle").click()');
  await sleep(300);
  check('BN heading', (await evalJs('document.querySelector("h1").textContent')) === 'ফসলের দাম বিডি');
  check('BN entries count ৩', (await evalJs('document.getElementById("stEntries").textContent')) === '৩');
  check('BN best price uses Bengali digits', (await evalJs('document.getElementById("stBest").textContent')).includes('৳৫০.০০'));
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'reload 3');
  await sleep(500);
  await evalJs('window.confirm = () => true');
  check('BN persists after reload', (await evalJs('document.querySelector("h1").textContent')) === 'ফসলের দাম বিডি');
  await evalJs('document.getElementById("langToggle").click()');
  await sleep(300);
  check('back to EN', (await evalJs('document.querySelector("h1").textContent')) === 'Crop Price BD');

  // --- demo load / clear ---
  await clickTab('data'); await sleep(200);
  await evalJs('document.getElementById("demoLoad").click()');
  await sleep(400);
  check('demo load toast', (await evalJs('document.getElementById("toast").textContent')) === 'Demo data loaded.');
  await clickTab('prices'); await sleep(200);
  check('demo load: entries = 9', (await evalJs('document.getElementById("stEntries").textContent')) === '9');
  check('demo badges present in price list (6)', (await evalJs('document.querySelectorAll("#priceList .demo-badge").length')) === 6);
  await clickTab('data'); await sleep(200);
  await evalJs('document.getElementById("demoClear").click()');
  await sleep(400);
  check('demo clear toast', (await evalJs('document.getElementById("toast").textContent')) === 'Demo data cleared.');
  await clickTab('prices'); await sleep(200);
  check('demo clear: entries = 3', (await evalJs('document.getElementById("stEntries").textContent')) === '3');

  // --- export/import round-trip via import box ---
  await clickTab('data'); await sleep(200);
  await evalJs('document.getElementById("exportCopy").click()');
  await sleep(400);
  // Headless file:// denies clipboard reads; the app falls back to putting
  // the JSON in the import box when clipboard.writeText fails.
  const exported = await evalJs(`(async () => { try { const t = await navigator.clipboard.readText(); if (t) return t; } catch (e) {} return document.getElementById('importBox').value || 'CLIPBOARD-DENIED'; })()`);
  check('export copy produced JSON', exported !== 'CLIPBOARD-DENIED' && exported.includes('"app": "crop-price-bd"'), String(exported).slice(0, 80));
  if (exported !== 'CLIPBOARD-DENIED') {
    await setVal('importBox', exported);
    await evalJs('document.getElementById("importBtn").click()');
    await sleep(400);
    check('import round-trip toast', (await evalJs('document.getElementById("toast").textContent')) === 'Imported.');
    check('import round-trip keeps 3 entries', (await evalJs('document.getElementById("stEntries").textContent')) === '3');
  }
  // malformed import rejected, data intact
  await setVal('importBox', '{"app":"crop-price-bd","version":1,"entries":[{"id":"x","crop":"paddy","market":"M","unit":"maund","price":-5,"date":"2026-11-20","buyer":"aratdar"}],"costs":[]}');
  await evalJs('document.getElementById("importBtn").click()');
  await sleep(400);
  check('malformed import shows error', (await errText('importErr')) !== '');
  check('malformed import keeps 3 entries', (await evalJs('document.getElementById("stEntries").textContent')) === '3');

  // --- erase with typed DELETE ---
  await setVal('eraseBox', 'DELETE');
  await evalJs('document.getElementById("eraseBtn").click()');
  await sleep(400);
  check('erase toast', (await evalJs('document.getElementById("toast").textContent')) === 'All data erased.');
  await clickTab('prices'); await sleep(200);
  check('erase: entries = 0', (await evalJs('document.getElementById("stEntries").textContent')) === '0');
  check('erase: costs = 0', (await evalJs('document.getElementById("stCosts").textContent')) === '0');

  check('no console errors at end', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no failed requests at end', failedReqs.length === 0, failedReqs.join(' | '));
  check('no non-file network requests at end', nonFileReqs.length === 0, nonFileReqs.join(' | '));

  // --- screenshot ---
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) {
    fs.writeFileSync(path.join(ROOT, 'tests', `smoke-${WIDTH}.png`), Buffer.from(shot.result.data, 'base64'));
    console.log('  screenshot saved: tests/smoke-' + WIDTH + '.png');
  }

  console.log(`\nsmoke @ ${WIDTH}: ${pass} passed, ${fail} failed`);
  chrome.kill();
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error('SMOKE ERROR:', err.message);
  try { chrome.kill(); } catch { /* ignore */ }
  process.exit(1);
}
