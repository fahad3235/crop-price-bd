/* crop-price-bd — pure logic (no DOM). Works in Node and in the browser. */
'use strict';

const MAUND_KG = 40;
const MAX_PRICE = 1000000; // whole taka per unit
const MAX_COST = 100000000; // whole taka per bigha
const MAX_NOTE = 200;

const CROPS = [
  'paddy', 'jute', 'potato', 'onion', 'wheat', 'maize', 'chilli',
  'turmeric', 'lentil', 'mustard', 'sugarcane', 'brinjal', 'tomato', 'other'
];
const BUYERS = ['aratdar', 'faria', 'local', 'other'];
const UNITS = ['maund', 'kg'];
const SEASONS = ['Boro', 'Aman', 'Aus', 'Rabi', 'Kharif-1', 'Kharif-2'];

/* ---------- helpers ---------- */
function isWhole(n) { return Number.isInteger(n); }
function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function todayStr(asof) {
  const d = asof ? new Date(asof) : new Date();
  return d.toISOString().slice(0, 10);
}
function isFuture(s, asof) { return s > todayStr(asof); }
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/* ---------- prices ---------- */
function pricePerKg(e) {
  return e.unit === 'maund' ? e.price / MAUND_KG : e.price;
}
function pricePerMaund(e) {
  return e.unit === 'maund' ? e.price : e.price * MAUND_KG;
}

function validateEntry(e, asof) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['not-object'];
  if (!CROPS.includes(e.crop)) errs.push('crop');
  if (e.crop === 'other' && (!e.customCrop || !String(e.customCrop).trim())) errs.push('custom-crop');
  if (!e.market || !String(e.market).trim() || String(e.market).trim().length > 60) errs.push('market');
  if (e.district !== undefined && e.district !== null && String(e.district).length > 60) errs.push('district');
  if (!UNITS.includes(e.unit)) errs.push('unit');
  if (!isWhole(e.price) || e.price < 1 || e.price > MAX_PRICE) errs.push('price');
  if (!isValidDateStr(e.date)) errs.push('date');
  else if (isFuture(e.date, asof)) errs.push('date-future');
  if (!BUYERS.includes(e.buyer)) errs.push('buyer');
  if (e.notes !== undefined && e.notes !== null && String(e.notes).length > MAX_NOTE) errs.push('notes');
  return errs;
}

/* Per-crop comparison. Returns array sorted by crop name. */
function compareByCrop(entries) {
  const byCrop = {};
  for (const e of entries) {
    const key = e.crop === 'other' ? 'other:' + String(e.customCrop || '').trim() : e.crop;
    (byCrop[key] = byCrop[key] || []).push(e);
  }
  return Object.keys(byCrop).sort().map(key => {
    const list = byCrop[key].slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const perKg = list.map(pricePerKg);
    const min = Math.min(...perKg);
    const max = Math.max(...perKg);
    const first = perKg[0];
    const latest = perKg[perKg.length - 1];
    const latestEntry = list[list.length - 1];
    const spread = max - min;
    return {
      key, crop: list[0].crop, customCrop: list[0].customCrop || '',
      count: list.length,
      markets: new Set(list.map(x => x.market.trim())).size,
      latestPerKg: latest, latestPerMaund: latest * MAUND_KG,
      latestDate: latestEntry.date, latestMarket: latestEntry.market,
      minPerKg: min, maxPerKg: max,
      spreadPerKg: spread, spreadPerMaund: spread * MAUND_KG,
      spreadPct: min > 0 ? (spread / min) * 100 : 0,
      trendPct: first > 0 ? ((latest - first) / first) * 100 : 0,
      firstPerKg: first, firstDate: list[0].date
    };
  });
}

/* Dashboard stats. */
function dashboardStats(entries, costs) {
  const crops = new Set(entries.map(e => e.crop === 'other' ? 'other:' + String(e.customCrop || '').trim() : e.crop));
  const markets = new Set(entries.map(e => e.market.trim().toLowerCase()));
  const districts = new Set(entries.map(e => String(e.district || '').trim().toLowerCase()).filter(Boolean));
  let best = null;
  for (const e of entries) {
    const pk = pricePerKg(e);
    if (!best || pk > best.perKg) best = { perKg: pk, entry: e };
  }
  let worst = null;
  for (const e of entries) {
    const pk = pricePerKg(e);
    if (!worst || pk < worst.perKg) worst = { perKg: pk, entry: e };
  }
  // Potential extra earnings: for each crop, (max - min) per kg x a notional
  // 100 kg sale is NOT a real claim, so we report only the spread itself.
  return {
    crops: crops.size, entries: entries.length, markets: markets.size,
    districts: districts.size, costRecords: costs.length,
    bestPerKg: best ? best.perKg : null, bestEntry: best ? best.entry : null,
    worstPerKg: worst ? worst.perKg : null, worstEntry: worst ? worst.entry : null
  };
}

/* ---------- production cost / profit ---------- */
function validateCost(c, asof) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['not-object'];
  if (!CROPS.includes(c.crop)) errs.push('crop');
  if (c.crop === 'other' && (!c.customCrop || !String(c.customCrop).trim())) errs.push('custom-crop');
  if (!SEASONS.includes(c.season)) errs.push('season');
  if (!isWhole(c.year) || c.year < 2000 || c.year > 2100) errs.push('year');
  if (!isWhole(c.totalCost) || c.totalCost < 1 || c.totalCost > MAX_COST) errs.push('total-cost');
  if (typeof c.yieldMaund !== 'number' || !(c.yieldMaund > 0) || c.yieldMaund > 1000) errs.push('yield');
  if (c.breakdown) {
    const parts = ['seed', 'fertilizer', 'labour', 'irrigation', 'other'];
    for (const p of parts) {
      const v = c.breakdown[p];
      if (v !== undefined && v !== null && (!isWhole(v) || v < 0 || v > MAX_COST)) errs.push('breakdown-' + p);
    }
  }
  return errs;
}

/* Break-even price per maund and per kg for a cost record. */
function breakEven(c) {
  const perMaund = c.totalCost / c.yieldMaund;
  return { perMaund, perKg: perMaund / MAUND_KG };
}

/* Profit at a given sale price (per maund) for a cost record. */
function profitAt(c, salePerMaund) {
  const be = breakEven(c);
  const perMaund = salePerMaund - be.perMaund;
  return {
    breakEvenPerMaund: be.perMaund, breakEvenPerKg: be.perKg,
    profitPerMaund: perMaund, profitPerKg: perMaund / MAUND_KG,
    profitPerBigha: perMaund * c.yieldMaund
  };
}

/* Latest sale price per maund for a crop key, or null. */
function latestSalePerMaund(entries, crop, customCrop) {
  const list = entries.filter(e =>
    e.crop === crop && (crop !== 'other' || String(e.customCrop || '').trim() === String(customCrop || '').trim()));
  if (!list.length) return null;
  list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return pricePerMaund(list[list.length - 1]);
}

/* ---------- import / export ---------- */
function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { errors: ['invalid-json'] }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { errors: ['not-object'] };
  if (obj.app !== 'crop-price-bd' || obj.version !== 1) return { errors: ['bad-header'] };
  if (!Array.isArray(obj.entries) || !Array.isArray(obj.costs)) return { errors: ['bad-shape'] };
  const errors = [];
  const entries = [];
  obj.entries.forEach((e, i) => {
    const errs = validateEntry(e);
    if (errs.length) { errors.push('entries[' + i + ']: ' + errs.join(',')); return; }
    if (typeof e.id !== 'string' || !e.id) { errors.push('entries[' + i + ']: id'); return; }
    entries.push(e);
  });
  const costs = [];
  obj.costs.forEach((c, i) => {
    const errs = validateCost(c);
    if (errs.length) { errors.push('costs[' + i + ']: ' + errs.join(',')); return; }
    if (typeof c.id !== 'string' || !c.id) { errors.push('costs[' + i + ']: id'); return; }
    costs.push(c);
  });
  if (errors.length) return { errors };
  const seenE = new Set();
  for (const e of entries) { if (seenE.has(e.id)) return { errors: ['duplicate-entry-id'] }; seenE.add(e.id); }
  const seenC = new Set();
  for (const c of costs) { if (seenC.has(c.id)) return { errors: ['duplicate-cost-id'] }; seenC.add(c.id); }
  return { data: { entries, costs } };
}

function exportData(entries, costs) {
  return JSON.stringify({ app: 'crop-price-bd', version: 1, entries, costs }, null, 2);
}

/* ---------- formatting ---------- */
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
function toBn(s) { return String(s).replace(/[0-9]/g, d => BN_DIGITS[+d]); }
function formatNum(n, lang, decimals) {
  const d = decimals === undefined ? 2 : decimals;
  const s = Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return lang === 'bn' ? toBn(s) : s;
}
function formatInt(n, lang) {
  const s = Number(n).toLocaleString('en-US');
  return lang === 'bn' ? toBn(s) : s;
}
function formatMoney(n, lang, decimals) {
  return '৳' + formatNum(n, lang, decimals === undefined ? 2 : decimals);
}

const api = {
  MAUND_KG, MAX_PRICE, MAX_COST, MAX_NOTE, CROPS, BUYERS, UNITS, SEASONS,
  isValidDateStr, isFuture, todayStr, uid,
  pricePerKg, pricePerMaund, validateEntry, compareByCrop, dashboardStats,
  validateCost, breakEven, profitAt, latestSalePerMaund,
  parseImport, exportData, formatNum, formatInt, formatMoney, toBn
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CropPriceLogic = api;
