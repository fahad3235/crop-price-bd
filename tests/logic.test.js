/* crop-price-bd — unit tests (node:test). Run: node --test tests/logic.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic');

const ASOF = '2026-11-23';

function goodEntry(over = {}) {
  return Object.assign({
    id: 'e1', crop: 'paddy', customCrop: '', variety: 'BRRI-28',
    market: 'Naogaon Haat', district: 'Naogaon', unit: 'maund',
    price: 1200, date: '2026-11-20', buyer: 'aratdar', notes: ''
  }, over);
}
function goodCost(over = {}) {
  return Object.assign({
    id: 'c1', crop: 'paddy', customCrop: '', season: 'Boro', year: 2026,
    totalCost: 18500, yieldMaund: 22
  }, over);
}

test('pricePerKg converts maund at 40 kg', () => {
  assert.equal(L.pricePerKg(goodEntry({ price: 1200, unit: 'maund' })), 30);
  assert.equal(L.pricePerKg(goodEntry({ price: 30, unit: 'kg' })), 30);
  assert.equal(L.pricePerMaund(goodEntry({ price: 30, unit: 'kg' })), 1200);
  assert.equal(L.pricePerMaund(goodEntry({ price: 1200, unit: 'maund' })), 1200);
});

test('validateEntry accepts a good entry', () => {
  assert.deepEqual(L.validateEntry(goodEntry(), ASOF), []);
  assert.deepEqual(L.validateEntry(goodEntry({ crop: 'other', customCrop: 'Kalijira' }), ASOF), []);
});

test('validateEntry rejects bad values', () => {
  assert.ok(L.validateEntry(goodEntry({ crop: 'rice' }), ASOF).includes('crop'));
  assert.ok(L.validateEntry(goodEntry({ crop: 'other', customCrop: '' }), ASOF).includes('custom-crop'));
  assert.ok(L.validateEntry(goodEntry({ market: '' }), ASOF).includes('market'));
  assert.ok(L.validateEntry(goodEntry({ market: 'x'.repeat(61) }), ASOF).includes('market'));
  assert.ok(L.validateEntry(goodEntry({ unit: 'ton' }), ASOF).includes('unit'));
  assert.ok(L.validateEntry(goodEntry({ price: 0 }), ASOF).includes('price'));
  assert.ok(L.validateEntry(goodEntry({ price: 1000001 }), ASOF).includes('price'));
  assert.ok(L.validateEntry(goodEntry({ price: 12.5 }), ASOF).includes('price'));
  assert.ok(L.validateEntry(goodEntry({ date: '2026-13-01' }), ASOF).includes('date'));
  assert.ok(L.validateEntry(goodEntry({ date: '2026-11-24' }), ASOF).includes('date-future'));
  assert.ok(L.validateEntry(goodEntry({ date: '2026-11-23' }), ASOF).length === 0, 'today is not future');
  assert.ok(L.validateEntry(goodEntry({ buyer: 'govt' }), ASOF).includes('buyer'));
  assert.ok(L.validateEntry(goodEntry({ notes: 'x'.repeat(201) }), ASOF).includes('notes'));
});

test('compareByCrop computes latest/min/max/spread/trend', () => {
  const es = [
    goodEntry({ id: 'a', market: 'M1', price: 1000, date: '2026-11-10' }),
    goodEntry({ id: 'b', market: 'M2', price: 1400, date: '2026-11-20' }),
    goodEntry({ id: 'c', market: 'M1', price: 1200, date: '2026-11-15' })
  ];
  const rows = L.compareByCrop(es);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.count, 3);
  assert.equal(r.markets, 2);
  assert.equal(r.minPerKg, 25); // 1000/40
  assert.equal(r.maxPerKg, 35); // 1400/40
  assert.equal(r.latestPerKg, 35);
  assert.equal(r.latestMarket, 'M2');
  assert.equal(r.spreadPerKg, 10);
  assert.equal(r.spreadPerMaund, 400);
  assert.equal(r.spreadPct, 40);
  assert.equal(r.trendPct, 40); // 25 -> 35
  assert.equal(r.firstDate, '2026-11-10');
});

test('compareByCrop separates other-crop names and groups kg entries', () => {
  const es = [
    goodEntry({ id: 'a', crop: 'onion', market: 'M1', price: 50, unit: 'kg', date: '2026-11-10' }),
    goodEntry({ id: 'b', crop: 'onion', market: 'M2', price: 60, unit: 'kg', date: '2026-11-11' }),
    goodEntry({ id: 'c', crop: 'other', customCrop: 'Kalijira', market: 'M1', price: 2000, unit: 'maund', date: '2026-11-10' })
  ];
  const rows = L.compareByCrop(es);
  assert.equal(rows.length, 2);
  const onion = rows.find(x => x.crop === 'onion');
  assert.equal(onion.latestPerKg, 60);
  assert.equal(onion.spreadPct, 20);
  const other = rows.find(x => x.crop === 'other');
  assert.equal(other.key, 'other:Kalijira');
  assert.equal(other.latestPerMaund, 2000);
});

test('compareByCrop on empty list returns empty', () => {
  assert.deepEqual(L.compareByCrop([]), []);
});

test('dashboardStats counts distinct crops/markets/districts', () => {
  const es = [
    goodEntry({ id: 'a', market: 'M1', district: 'Naogaon' }),
    goodEntry({ id: 'b', market: 'm1', district: 'naogaon' }),
    goodEntry({ id: 'c', crop: 'onion', market: 'M2', district: 'Pabna', price: 60, unit: 'kg' })
  ];
  const s = L.dashboardStats(es, [goodCost()]);
  assert.equal(s.crops, 2);
  assert.equal(s.entries, 3);
  assert.equal(s.markets, 2); // case-insensitive
  assert.equal(s.districts, 2);
  assert.equal(s.costRecords, 1);
  assert.equal(s.bestPerKg, 60);
  assert.equal(s.worstPerKg, 30);
  assert.equal(s.bestEntry.id, 'c');
});

test('validateCost accepts good cost and rejects bad', () => {
  assert.deepEqual(L.validateCost(goodCost()), []);
  assert.ok(L.validateCost(goodCost({ season: 'Summer' })).includes('season'));
  assert.ok(L.validateCost(goodCost({ year: 1999 })).includes('year'));
  assert.ok(L.validateCost(goodCost({ year: 2026.5 })).includes('year'));
  assert.ok(L.validateCost(goodCost({ totalCost: 0 })).includes('total-cost'));
  assert.ok(L.validateCost(goodCost({ totalCost: 12.5 })).includes('total-cost'));
  assert.ok(L.validateCost(goodCost({ yieldMaund: 0 })).includes('yield'));
  assert.ok(L.validateCost(goodCost({ yieldMaund: 1001 })).includes('yield'));
  assert.ok(L.validateCost(goodCost({ breakdown: { seed: -5 } })).includes('breakdown-seed'));
  assert.ok(L.validateCost(goodCost({ breakdown: { labour: 1.5 } })).includes('breakdown-labour'));
});

test('breakEven divides cost by yield', () => {
  const be = L.breakEven(goodCost({ totalCost: 18500, yieldMaund: 22 }));
  assert.ok(Math.abs(be.perMaund - 840.9090909090909) < 1e-9);
  assert.ok(Math.abs(be.perKg - 21.022727272727273) < 1e-9);
});

test('profitAt computes profit per maund and per bigha', () => {
  const p = L.profitAt(goodCost({ totalCost: 18500, yieldMaund: 22 }), 1200);
  // break-even 840.909..., profit/maund 359.0909..., per bigha 7900
  assert.ok(Math.abs(p.profitPerMaund - 359.0909090909091) < 1e-9);
  assert.ok(Math.abs(p.profitPerBigha - 7900) < 1e-6);
  const loss = L.profitAt(goodCost({ totalCost: 18500, yieldMaund: 22 }), 800);
  assert.ok(loss.profitPerMaund < 0);
  assert.ok(Math.abs(loss.profitPerBigha - (800 - 18500 / 22) * 22) < 1e-6);
});

test('latestSalePerMaund picks the newest entry for the crop', () => {
  const es = [
    goodEntry({ id: 'a', price: 1000, date: '2026-11-10' }),
    goodEntry({ id: 'b', price: 1400, date: '2026-11-20' }),
    goodEntry({ id: 'c', crop: 'onion', price: 60, unit: 'kg', date: '2026-11-21' })
  ];
  assert.equal(L.latestSalePerMaund(es, 'paddy'), 1400);
  assert.equal(L.latestSalePerMaund(es, 'onion'), 2400); // 60/kg * 40
  assert.equal(L.latestSalePerMaund(es, 'jute'), null);
  assert.equal(L.latestSalePerMaund(es, 'other', 'Kalijira'), null);
});

test('export/import round-trips and rejects bad data', () => {
  const es = [goodEntry()];
  const cs = [goodCost()];
  const json = L.exportData(es, cs);
  const back = L.parseImport(json);
  assert.equal(back.errors, undefined);
  assert.equal(back.data.entries.length, 1);
  assert.equal(back.data.costs.length, 1);
  assert.deepEqual(L.parseImport('not json').errors, ['invalid-json']);
  assert.deepEqual(L.parseImport('{"app":"x","version":1,"entries":[],"costs":[]}').errors, ['bad-header']);
  assert.deepEqual(L.parseImport('{"app":"crop-price-bd","version":2,"entries":[],"costs":[]}').errors, ['bad-header']);
  assert.deepEqual(L.parseImport('{"app":"crop-price-bd","version":1,"entries":{},"costs":[]}').errors, ['bad-shape']);
  const bad = JSON.parse(json);
  bad.entries[0].price = -5;
  assert.ok(L.parseImport(JSON.stringify(bad)).errors.length > 0);
  const dup = JSON.parse(json);
  dup.entries.push(Object.assign({}, dup.entries[0]));
  assert.deepEqual(L.parseImport(JSON.stringify(dup)).errors, ['duplicate-entry-id']);
  const badCost = JSON.parse(json);
  badCost.costs[0].yieldMaund = 0;
  assert.ok(L.parseImport(JSON.stringify(badCost)).errors.length > 0);
});

test('formatNum/formatMoney use Bengali digits in bn mode', () => {
  assert.equal(L.formatNum(1234.5, 'en', 2), '1,234.50');
  assert.equal(L.formatNum(1234.5, 'bn', 2), '১,২৩৪.৫০');
  assert.equal(L.formatInt(1234567, 'bn'), '১,২৩৪,৫৬৭');
  assert.equal(L.formatMoney(1350, 'bn', 0), '৳১,৩৫০');
  assert.equal(L.formatMoney(30, 'en', 2), '৳30.00');
});

test('isValidDateStr rejects impossible dates', () => {
  assert.equal(L.isValidDateStr('2026-02-29'), false); // 2026 not a leap year
  assert.equal(L.isValidDateStr('2024-02-29'), true);
  assert.equal(L.isValidDateStr('2026-11-23'), true);
  assert.equal(L.isValidDateStr('23-11-2026'), false);
  assert.equal(L.isValidDateStr(''), false);
});
