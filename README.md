# Crop Price BD — ফসলের দাম বিডি

Offline, bilingual (English / বাংলা) farm-gate crop price notebook for Bangladeshi
farmers. Record what each crop actually sold for at each haat, compare markets,
and work out whether a sale covers the cost of growing the crop.

No account, no server, no network requests. All data stays in the browser's
localStorage on the farmer's own device.

## Problem

A farmer selling paddy, jute, potato or onion usually hears one price from one
buyer at one haat — and has no record of what the same crop fetched elsewhere
last week, or whether that price even covers the cost of growing it. Crop Price
BD keeps that record: every sale price, every market, and the break-even price
per bigha, so the next sale is an informed decision.

## Features

1. **Price entries (CRUD)** — crop (14 common crops + Other with a custom name),
   variety, market/haat, district, price per maund (40 kg) or per kg, date,
   buyer type (aratdar / faria / local / other), notes. Whole-taka prices only;
   future dates rejected.
2. **Compare tab** — per crop: latest price, lowest / highest, spread in ৳ and %,
   trend vs first recorded price, markets counted. All comparisons use a common
   per-kg basis, so a maund price and a kg price compare fairly.
3. **Profit tab** — production cost per bigha (total + optional breakdown:
   seed, fertilizer, labour, irrigation, other) and yield per bigha give the
   break-even price per maund; against the latest recorded sale price it shows
   profit / loss per maund and per bigha.
4. **Dashboard** — crops tracked, entries, markets, districts, cost records,
   best and lowest price recorded.
5. **Search, filter & sort** — by crop, market, district; sort by newest,
   oldest, price per kg, or market name.
6. **Data** — JSON export (download or copy), strict validated import, clearly
   labelled demo prices (6 entries + 1 cost record) that load/clear, and a
   typed-`DELETE` erase-all.
7. **Bilingual UI** — full English / বাংলা toggle, persisted across reloads,
   with Bengali digits in বাংলা mode. XSS-safe rendering throughout.

## Stack

- Plain HTML + CSS + vanilla JavaScript — no build step, no dependencies.
- `js/logic.js` — pure, DOM-free logic (also required by the Node tests).
- `js/i18n.js` — English / Bangla strings. `js/app.js` — UI wiring, localStorage.
- Tests: Node's built-in test runner + a raw-CDP headless-Chrome smoke test
  (no npm packages needed).

## Prerequisites

Any modern browser. For tests: Node.js 18+ and a headless Chromium
(the smoke test uses the Playwright-cached `headless_shell` binary).

## Install & run

```sh
# just open it — no install, no server
open index.html
# or serve locally, e.g.
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Dev commands

```sh
node --test tests/logic.test.js   # unit tests
node tests/smoke.mjs 1280         # headless-Chrome smoke test, desktop
node tests/smoke.mjs 390          # headless-Chrome smoke test, mobile
```

## Data & privacy

- Everything is stored in `localStorage` under the key `crop-price-bd-v1`.
  Nothing leaves the device; the app makes zero network requests.
- Ships EMPTY — no prices, markets or costs are pre-filled. The optional demo
  data is explicitly labelled DEMO / নমুনা and is illustrative only.
- Export format: `{ "app": "crop-price-bd", "version": 1, "entries": [...], "costs": [...] }`.
  Import is strictly validated; malformed data is rejected with the existing
  data left intact.

## Testing

- **Unit:** 14/14 Node tests green (`tests/logic.test.js`) — unit conversion
  (1 maund = 40 kg), validation rules, per-crop comparison math, break-even /
  profit math, export/import round-trip and rejection cases, Bengali digits.
- **Smoke:** 80/80 headless-Chrome checks at 1280px and 80/80 at 390px
  (`tests/smoke.mjs`) — 0 console errors, 0 failed requests, 0 non-file
  network requests. Hand-verified: paddy ৳1,200/maund → ৳30.00/kg;
  ৳1,200 → ৳1,400 spread ৳5.00/kg (+16.67%); cost ৳18,500 / 22 maund
  → break-even ৳840.91/maund; sale at ৳1,500/maund → profit ৳659.09/maund,
  ৳14,500.00/bigha. XSS markup in a market name renders as inert text.

## Deployment

Static site — publish the repo root on GitHub Pages (main branch, root).
No build step.

## Limitations

- Prices are the user's own records, not live market data — verify rates
  before selling. Demo prices are samples, not real prices.
- Break-even figures are estimates from the user's own cost entries, not
  market or agronomic advice.
- Single-device storage (localStorage); use JSON export to move data.
- 1 maund is taken as 40 kg, the standard Bangladeshi maund.

## Status

Built 2026-11-23 (factory run #424, 17:00 slot). Complete MVP, tested as above.
