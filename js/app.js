/* crop-price-bd — UI wiring. Depends on CropPriceLogic + CropPriceSTR. */
'use strict';

const L = window.CropPriceLogic;
const I18N = window.CropPriceSTR;
const LS_KEY = 'crop-price-bd-v1';
const LANG_KEY = 'crop-price-bd-lang';

let state = { entries: [], costs: [], demo: false };
let lang = localStorage.getItem(LANG_KEY) || 'en';
if (!I18N[lang]) lang = 'en';
let tab = 'prices';
let editingId = null;
let editingCostId = null;

const $ = id => document.getElementById(id);
const t = key => (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cropName(crop, custom) {
  if (crop === 'other') return custom || t('cropOther');
  return t('crop' + crop.charAt(0).toUpperCase() + crop.slice(1));
}
function seasonName(s) {
  const map = { 'Boro': 'seasonBoro', 'Aman': 'seasonAman', 'Aus': 'seasonAus', 'Rabi': 'seasonRabi', 'Kharif-1': 'seasonKharif1', 'Kharif-2': 'seasonKharif2' };
  return t(map[s] || 'seasonBoro');
}
function buyerName(b) {
  return { aratdar: t('buyerAratdar'), faria: t('buyerFaria'), local: t('buyerLocal'), other: t('buyerOther') }[b] || b;
}
function fmtMoney(n, d) { return L.formatMoney(n, lang, d === undefined ? 2 : d); }
function fmtInt(n) { return L.formatInt(n, lang); }
function fmtPct(n) { return (n >= 0 ? '+' : '') + L.formatNum(n, lang, 2) + '%'; }

/* ---------- persistence ---------- */
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = L.parseImport(raw);
    if (parsed.data) {
      state.entries = parsed.data.entries;
      state.costs = parsed.data.costs;
      state.demo = state.entries.some(e => e.demo) || state.costs.some(c => c.demo);
    }
  } catch (e) { /* corrupted storage: start empty */ }
}
function save() {
  localStorage.setItem(LS_KEY, L.exportData(state.entries, state.costs));
}

/* ---------- i18n / static text ---------- */
function applyI18n() {
  document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('langToggle').textContent = lang === 'en' ? 'বাংলা' : 'English';
  // rebuild selects whose option labels are translated
  buildCropOptions();
  buildCostCropOptions();
  buildBuyerOptions();
  buildSeasonOptions();
  buildFilterCropOptions();
  render();
}

function buildCropOptions() {
  const sel = $('fCrop');
  const cur = sel.value;
  sel.innerHTML = '<option value="">—</option>' + L.CROPS.map(c =>
    '<option value="' + c + '">' + esc(cropName(c)) + '</option>').join('');
  sel.value = cur && L.CROPS.includes(cur) ? cur : '';
  $('fCustomCropWrap').style.display = sel.value === 'other' ? '' : 'none';
}
function buildCostCropOptions() {
  const sel = $('cCrop');
  const cur = sel.value;
  sel.innerHTML = '<option value="">—</option>' + L.CROPS.map(c =>
    '<option value="' + c + '">' + esc(cropName(c)) + '</option>').join('');
  sel.value = cur && L.CROPS.includes(cur) ? cur : '';
  $('cCustomCropWrap').style.display = sel.value === 'other' ? '' : 'none';
}
function buildBuyerOptions() {
  const sel = $('fBuyer');
  const cur = sel.value;
  sel.innerHTML = '<option value="">—</option>' + L.BUYERS.map(b =>
    '<option value="' + b + '">' + esc(buyerName(b)) + '</option>').join('');
  sel.value = cur && L.BUYERS.includes(cur) ? cur : '';
}
function buildSeasonOptions() {
  const sel = $('cSeason');
  const cur = sel.value;
  sel.innerHTML = '<option value="">—</option>' + L.SEASONS.map(s =>
    '<option value="' + s + '">' + esc(seasonName(s)) + '</option>').join('');
  sel.value = cur && L.SEASONS.includes(cur) ? cur : '';
}
function buildFilterCropOptions() {
  const sel = $('fltCrop');
  const cur = sel.value;
  sel.innerHTML = '<option value="">' + esc(t('filterCrop')) + '</option>' + L.CROPS.map(c =>
    '<option value="' + c + '">' + esc(cropName(c)) + '</option>').join('');
  sel.value = cur || '';
}

/* ---------- rendering ---------- */
function render() {
  renderStats();
  renderPrices();
  renderCompare();
  renderProfit();
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
}

function renderStats() {
  const s = L.dashboardStats(state.entries, state.costs);
  $('stCrops').textContent = fmtInt(s.crops);
  $('stEntries').textContent = fmtInt(s.entries);
  $('stMarkets').textContent = fmtInt(s.markets);
  $('stDistricts').textContent = fmtInt(s.districts);
  $('stCosts').textContent = fmtInt(s.costRecords);
  $('stBest').textContent = s.bestEntry
    ? fmtMoney(s.bestPerKg) + t('perKgShort') + ' · ' + cropName(s.bestEntry.crop, s.bestEntry.customCrop) + ' — ' + s.bestEntry.market
    : '—';
  $('stWorst').textContent = s.worstEntry
    ? fmtMoney(s.worstPerKg) + t('perKgShort') + ' · ' + cropName(s.worstEntry.crop, s.worstEntry.customCrop) + ' — ' + s.worstEntry.market
    : '—';
}

function filteredEntries() {
  const fc = $('fltCrop').value;
  const fm = $('fltMarket').value.trim().toLowerCase();
  const fd = $('fltDistrict').value.trim().toLowerCase();
  const sort = $('fltSort').value;
  let list = state.entries.filter(e =>
    (!fc || e.crop === fc) &&
    (!fm || e.market.toLowerCase().includes(fm)) &&
    (!fd || String(e.district || '').toLowerCase().includes(fd)));
  const by = {
    newest: (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    oldest: (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    priceHigh: (a, b) => L.pricePerKg(b) - L.pricePerKg(a),
    priceLow: (a, b) => L.pricePerKg(a) - L.pricePerKg(b),
    market: (a, b) => a.market.localeCompare(b.market)
  };
  return list.sort(by[sort] || by.newest);
}

function renderPrices() {
  const list = filteredEntries();
  const box = $('priceList');
  if (!list.length) { box.innerHTML = '<p class="empty">' + esc(t('noEntries')) + '</p>'; return; }
  box.innerHTML = list.map(e => {
    const pk = L.pricePerKg(e);
    return '<article class="card" data-id="' + esc(e.id) + '">' +
      '<div class="card-head"><strong>' + esc(cropName(e.crop, e.customCrop)) + '</strong>' +
      (e.demo ? ' <span class="demo-badge">' + esc(t('demo')) + '</span>' : '') +
      '<span class="card-date">' + esc(e.date) + '</span></div>' +
      '<div class="card-price">' + esc(fmtMoney(e.price, 0)) + ' ' + esc(e.unit === 'maund' ? t('perMaund') : t('perKg')) +
      ' <span class="muted">(' + esc(fmtMoney(pk)) + t('perKgShort') + ')</span></div>' +
      '<div class="card-meta">' + esc(e.market) +
      (e.district ? ' · ' + esc(e.district) : '') +
      (e.variety ? ' · ' + esc(e.variety) : '') +
      ' · ' + esc(buyerName(e.buyer)) + '</div>' +
      (e.notes ? '<div class="card-notes">' + esc(e.notes) + '</div>' : '') +
      '<div class="card-actions"><button class="btn small" data-act="edit">' + esc(t('edit')) + '</button>' +
      '<button class="btn small danger" data-act="del">' + esc(t('del')) + '</button></div>' +
      '</article>';
  }).join('');
  box.querySelectorAll('.card').forEach(card => {
    card.querySelector('[data-act="edit"]').addEventListener('click', () => startEdit(card.dataset.id));
    card.querySelector('[data-act="del"]').addEventListener('click', () => {
      if (!window.confirm(t('confirmDelete'))) return;
      state.entries = state.entries.filter(x => x.id !== card.dataset.id);
      save(); render(); toast(t('deleted'));
    });
  });
}

function renderCompare() {
  const rows = L.compareByCrop(state.entries);
  const box = $('compareList');
  if (!rows.length) { box.innerHTML = '<p class="empty">' + esc(t('noCompare')) + '</p>'; return; }
  box.innerHTML = rows.map(r => {
    const trendCls = r.trendPct > 0 ? 'up' : (r.trendPct < 0 ? 'down' : '');
    return '<article class="card">' +
      '<div class="card-head"><strong>' + esc(cropName(r.crop, r.customCrop)) + '</strong>' +
      '<span class="muted">' + fmtInt(r.count) + ' ' + esc(t('entriesCount')) + ' · ' + fmtInt(r.markets) + ' ' + esc(t('marketsCount')) + '</span></div>' +
      '<div class="cmp-grid">' +
      '<div><span class="lbl">' + esc(t('latest')) + '</span><strong>' + esc(fmtMoney(r.latestPerKg)) + t('perKgShort') + '</strong><span class="muted"> · ' + esc(r.latestMarket) + ' · ' + esc(r.latestDate) + '</span></div>' +
      '<div><span class="lbl">' + esc(t('min')) + '</span><strong>' + esc(fmtMoney(r.minPerKg)) + t('perKgShort') + '</strong></div>' +
      '<div><span class="lbl">' + esc(t('max')) + '</span><strong>' + esc(fmtMoney(r.maxPerKg)) + t('perKgShort') + '</strong></div>' +
      '<div><span class="lbl">' + esc(t('spread')) + '</span><strong>' + esc(fmtMoney(r.spreadPerKg)) + t('perKgShort') + ' (' + esc(fmtPct(r.spreadPct)) + ')</strong></div>' +
      '<div><span class="lbl">' + esc(t('trend')) + '</span><strong class="' + trendCls + '">' + esc(fmtPct(r.trendPct)) + '</strong><span class="muted"> · ' + esc(r.firstDate) + '</span></div>' +
      '</div></article>';
  }).join('');
}

function renderProfit() {
  const box = $('costList');
  if (!state.costs.length) {
    box.innerHTML = '<p class="empty">' + esc(t('noCosts')) + '</p>';
  } else {
    box.innerHTML = state.costs.map(c => {
      const be = L.breakEven(c);
      const sale = L.latestSalePerMaund(state.entries, c.crop, c.customCrop);
      const p = sale == null ? null : L.profitAt(c, sale);
      const cls = p ? (p.profitPerMaund >= 0 ? 'up' : 'down') : '';
      const label = p ? (p.profitPerMaund >= 0 ? t('profit') : t('loss')) : '';
      return '<article class="card" data-id="' + esc(c.id) + '">' +
        '<div class="card-head"><strong>' + esc(cropName(c.crop, c.customCrop)) + '</strong>' +
        (c.demo ? ' <span class="demo-badge">' + esc(t('demo')) + '</span>' : '') +
        '<span class="muted">' + esc(seasonName(c.season)) + ' ' + fmtInt(c.year) + '</span></div>' +
        '<div class="cmp-grid">' +
        '<div><span class="lbl">' + esc(t('totalCost')) + '</span><strong>' + esc(fmtMoney(c.totalCost, 0)) + '</strong></div>' +
        '<div><span class="lbl">' + esc(t('yieldMaund')) + '</span><strong>' + esc(L.formatNum(c.yieldMaund, lang, 1)) + '</strong></div>' +
        '<div><span class="lbl">' + esc(t('breakEven')) + '</span><strong>' + esc(fmtMoney(be.perMaund)) + t('perMaundShort') + '</strong></div>' +
        '<div><span class="lbl">' + esc(t('salePrice')) + '</span><strong>' + (sale == null ? esc(t('noSale')) : esc(fmtMoney(sale)) + t('perMaundShort')) + '</strong></div>' +
        (p ? '<div><span class="lbl">' + esc(t('profitMaund')) + '</span><strong class="' + cls + '">' + esc(fmtMoney(p.profitPerMaund)) + ' (' + esc(label) + ')</strong></div>' +
        '<div><span class="lbl">' + esc(t('profitBigha')) + '</span><strong class="' + cls + '">' + esc(fmtMoney(p.profitPerBigha)) + '</strong></div>' : '') +
        '</div>' +
        '<div class="card-actions"><button class="btn small" data-act="edit-cost">' + esc(t('edit')) + '</button>' +
        '<button class="btn small danger" data-act="del-cost">' + esc(t('del')) + '</button></div>' +
        '</article>';
    }).join('');
    box.querySelectorAll('.card').forEach(card => {
      card.querySelector('[data-act="edit-cost"]').addEventListener('click', () => startEditCost(card.dataset.id));
      card.querySelector('[data-act="del-cost"]').addEventListener('click', () => {
        if (!window.confirm(t('confirmDelete'))) return;
        state.costs = state.costs.filter(x => x.id !== card.dataset.id);
        save(); render(); toast(t('deleted'));
      });
    });
  }
}

/* ---------- forms ---------- */
function fieldError(id, msg) {
  const el = $(id);
  el.textContent = msg || '';
}
function errFor(code) {
  const map = {
    crop: 'errCrop', 'custom-crop': 'errCustomCrop', market: 'errMarket',
    price: 'errPrice', date: 'errDate', 'date-future': 'errDateFuture',
    buyer: 'errBuyer', notes: 'errNotes'
  };
  return t(map[code] || 'errPrice');
}

function readEntryForm() {
  return {
    crop: $('fCrop').value,
    customCrop: $('fCustomCrop').value.trim(),
    variety: $('fVariety').value.trim(),
    market: $('fMarket').value.trim(),
    district: $('fDistrict').value.trim(),
    unit: $('fUnit').value,
    price: $('fPrice').value === '' ? NaN : Number($('fPrice').value),
    date: $('fDate').value,
    buyer: $('fBuyer').value,
    notes: $('fNotes').value.trim()
  };
}

function submitEntry(ev) {
  ev.preventDefault();
  const e = readEntryForm();
  const errs = L.validateEntry(e);
  ['fErrCrop', 'fErrMarket', 'fErrPrice', 'fErrDate', 'fErrBuyer', 'fErrNotes'].forEach(id => fieldError(id, ''));
  if (errs.length) {
    for (const code of errs) {
      if (code === 'crop' || code === 'custom-crop') fieldError('fErrCrop', errFor(code));
      else if (code === 'market') fieldError('fErrMarket', errFor(code));
      else if (code === 'price') fieldError('fErrPrice', errFor(code));
      else if (code === 'date' || code === 'date-future') fieldError('fErrDate', errFor(code));
      else if (code === 'buyer') fieldError('fErrBuyer', errFor(code));
      else if (code === 'notes') fieldError('fErrNotes', errFor(code));
    }
    return;
  }
  if (editingId) {
    const idx = state.entries.findIndex(x => x.id === editingId);
    if (idx >= 0) state.entries[idx] = Object.assign({}, state.entries[idx], e);
    editingId = null;
    $('formTitle').textContent = t('addPrice');
  } else {
    state.entries.push(Object.assign({ id: L.uid(), demo: false }, e));
  }
  save(); resetEntryForm(); render(); toast(t('saved'));
}

function resetEntryForm() {
  $('entryForm').reset();
  $('fCustomCropWrap').style.display = 'none';
  $('fDate').value = L.todayStr();
  ['fErrCrop', 'fErrMarket', 'fErrPrice', 'fErrDate', 'fErrBuyer', 'fErrNotes'].forEach(id => fieldError(id, ''));
}

function startEdit(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  $('formTitle').textContent = t('editPrice');
  $('fCrop').value = e.crop;
  $('fCustomCropWrap').style.display = e.crop === 'other' ? '' : 'none';
  $('fCustomCrop').value = e.customCrop || '';
  $('fVariety').value = e.variety || '';
  $('fMarket').value = e.market;
  $('fDistrict').value = e.district || '';
  $('fUnit').value = e.unit;
  $('fPrice').value = e.price;
  $('fDate').value = e.date;
  $('fBuyer').value = e.buyer;
  $('fNotes').value = e.notes || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('fMarket').focus();
}

function readCostForm() {
  const bd = {};
  ['seed', 'fertilizer', 'labour', 'irrigation', 'other'].forEach(p => {
    const v = $('bd-' + p).value;
    if (v !== '') bd[p] = Number(v);
  });
  return {
    crop: $('cCrop').value,
    customCrop: $('cCustomCrop').value.trim(),
    season: $('cSeason').value,
    year: $('cYear').value === '' ? NaN : Number($('cYear').value),
    totalCost: $('cTotal').value === '' ? NaN : Number($('cTotal').value),
    yieldMaund: $('cYield').value === '' ? NaN : Number($('cYield').value),
    breakdown: Object.keys(bd).length ? bd : undefined
  };
}
function costErrFor(code) {
  const map = {
    crop: 'errCrop', 'custom-crop': 'errCustomCrop', season: 'errSeason',
    year: 'errYear', 'total-cost': 'errCost', yield: 'errYield'
  };
  if (code.indexOf('breakdown') === 0) return t('errBreakdown');
  return t(map[code] || 'errCost');
}
function submitCost(ev) {
  ev.preventDefault();
  const c = readCostForm();
  const errs = L.validateCost(c);
  ['cErrCrop', 'cErrSeason', 'cErrYear', 'cErrCost', 'cErrYield'].forEach(id => fieldError(id, ''));
  if (errs.length) {
    for (const code of errs) {
      if (code === 'crop' || code === 'custom-crop') fieldError('cErrCrop', costErrFor(code));
      else if (code === 'season') fieldError('cErrSeason', costErrFor(code));
      else if (code === 'year') fieldError('cErrYear', costErrFor(code));
      else if (code === 'total-cost') fieldError('cErrCost', costErrFor(code));
      else if (code === 'yield') fieldError('cErrYield', costErrFor(code));
      else fieldError('cErrCost', costErrFor(code));
    }
    return;
  }
  if (editingCostId) {
    const idx = state.costs.findIndex(x => x.id === editingCostId);
    if (idx >= 0) state.costs[idx] = Object.assign({}, state.costs[idx], c);
    editingCostId = null;
    $('costFormTitle').textContent = t('addCost');
  } else {
    state.costs.push(Object.assign({ id: L.uid(), demo: false }, c));
  }
  save(); resetCostForm(); render(); toast(t('saved'));
}
function resetCostForm() {
  $('costForm').reset();
  $('cCustomCropWrap').style.display = 'none';
  $('cYear').value = new Date().getFullYear();
  ['cErrCrop', 'cErrSeason', 'cErrYear', 'cErrCost', 'cErrYield'].forEach(id => fieldError(id, ''));
}
function startEditCost(id) {
  const c = state.costs.find(x => x.id === id);
  if (!c) return;
  editingCostId = id;
  $('costFormTitle').textContent = t('addCost');
  $('cCrop').value = c.crop;
  $('cCustomCropWrap').style.display = c.crop === 'other' ? '' : 'none';
  $('cCustomCrop').value = c.customCrop || '';
  $('cSeason').value = c.season;
  $('cYear').value = c.year;
  $('cTotal').value = c.totalCost;
  $('cYield').value = c.yieldMaund;
  if (c.breakdown) {
    ['seed', 'fertilizer', 'labour', 'irrigation', 'other'].forEach(p => {
      $('bd-' + p).value = c.breakdown[p] == null ? '' : c.breakdown[p];
    });
  }
  $('cTotal').focus();
}

/* ---------- demo data ---------- */
function demoData() {
  const d = (o) => Object.assign({ demo: true, id: L.uid() }, o);
  return {
    entries: [
      d({ crop: 'paddy', customCrop: '', variety: 'BRRI-28', market: 'Naogaon Haat', district: 'Naogaon', unit: 'maund', price: 1350, date: '2026-11-20', buyer: 'aratdar', notes: '' }),
      d({ crop: 'paddy', customCrop: '', variety: 'BRRI-28', market: 'Rajshahi Bazar', district: 'Rajshahi', unit: 'maund', price: 1280, date: '2026-11-19', buyer: 'faria', notes: '' }),
      d({ crop: 'jute', customCrop: '', variety: 'Tossa', market: 'Faridpur Haat', district: 'Faridpur', unit: 'maund', price: 3100, date: '2026-11-18', buyer: 'aratdar', notes: '' }),
      d({ crop: 'potato', customCrop: '', variety: 'Diamant', market: 'Munshiganj Bazar', district: 'Munshiganj', unit: 'kg', price: 28, date: '2026-11-21', buyer: 'local', notes: '' }),
      d({ crop: 'onion', customCrop: '', variety: '', market: 'Pabna Haat', district: 'Pabna', unit: 'kg', price: 55, date: '2026-11-20', buyer: 'faria', notes: '' }),
      d({ crop: 'chilli', customCrop: '', variety: '', market: 'Bogura Bazar', district: 'Bogura', unit: 'kg', price: 120, date: '2026-11-21', buyer: 'local', notes: '' })
    ],
    costs: [
      d({ crop: 'paddy', customCrop: '', season: 'Boro', year: 2026, totalCost: 18500, yieldMaund: 22, breakdown: { seed: 1500, fertilizer: 5200, labour: 8000, irrigation: 3000, other: 800 } })
    ]
  };
}
function loadDemo() {
  if (state.demo) return;
  const dd = demoData();
  state.entries = state.entries.concat(dd.entries);
  state.costs = state.costs.concat(dd.costs);
  state.demo = true;
  save(); render(); toast(t('demoLoaded'));
}
function clearDemo() {
  state.entries = state.entries.filter(e => !e.demo);
  state.costs = state.costs.filter(c => !c.demo);
  state.demo = state.entries.some(e => e.demo) || state.costs.some(c => c.demo);
  save(); render(); toast(t('demoCleared'));
}

/* ---------- data tab ---------- */
function doExport(download) {
  if (!state.entries.length && !state.costs.length) { toast(t('exportEmpty')); return; }
  const json = L.exportData(state.entries, state.costs);
  if (download) {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crop-price-bd-export.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else {
    navigator.clipboard.writeText(json).then(() => toast(t('copied')), () => { $('importBox').value = json; });
  }
}
function doImport() {
  const raw = $('importBox').value.trim();
  if (!raw) return;
  const parsed = L.parseImport(raw);
  if (parsed.errors) { fieldError('importErr', t('errImport') + parsed.errors.join('; ')); return; }
  fieldError('importErr', '');
  state.entries = parsed.data.entries;
  state.costs = parsed.data.costs;
  state.demo = state.entries.some(e => e.demo) || state.costs.some(c => c.demo);
  save(); render(); toast(t('imported'));
}
function doErase() {
  if ($('eraseBox').value.trim() !== 'DELETE') { fieldError('eraseErr', t('errErase')); return; }
  fieldError('eraseErr', '');
  state.entries = []; state.costs = []; state.demo = false;
  $('eraseBox').value = '';
  save(); render(); toast(t('erased'));
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ---------- init ---------- */
function init() {
  load();
  // cost form crop select mirrors price form crop list
  const cCrop = $('cCrop');
  cCrop.innerHTML = '<option value="">—</option>' + L.CROPS.map(c =>
    '<option value="' + c + '">' + esc(cropName(c)) + '</option>').join('');
  $('cYear').value = new Date().getFullYear();
  $('fDate').value = L.todayStr();
  $('langToggle').addEventListener('click', () => {
    lang = lang === 'en' ? 'bn' : 'en';
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  $('fCrop').addEventListener('change', () => { $('fCustomCropWrap').style.display = $('fCrop').value === 'other' ? '' : 'none'; });
  $('cCrop').addEventListener('change', () => { $('cCustomCropWrap').style.display = $('cCrop').value === 'other' ? '' : 'none'; });
  $('entryForm').addEventListener('submit', submitEntry);
  $('entryCancel').addEventListener('click', () => { editingId = null; $('formTitle').textContent = t('addPrice'); resetEntryForm(); });
  $('costForm').addEventListener('submit', submitCost);
  $('costCancel').addEventListener('click', () => { editingCostId = null; $('costFormTitle').textContent = t('addCost'); resetCostForm(); });
  ['fltCrop', 'fltMarket', 'fltDistrict', 'fltSort'].forEach(id => {
    $(id).addEventListener('input', renderPrices);
    $(id).addEventListener('change', renderPrices);
  });
  $('exportDl').addEventListener('click', () => doExport(true));
  $('exportCopy').addEventListener('click', () => doExport(false));
  $('importBtn').addEventListener('click', doImport);
  $('demoLoad').addEventListener('click', loadDemo);
  $('demoClear').addEventListener('click', clearDemo);
  $('eraseBtn').addEventListener('click', doErase);
  applyI18n();
}

document.addEventListener('DOMContentLoaded', init);
