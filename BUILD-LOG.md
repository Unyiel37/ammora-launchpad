# BUILD-LOG — Bosqu Launchpad (Ammora on GIWA)

- **Tanggal:** 2026-11-21 (WIB)
- **Repo:** https://github.com/Unyiel37/ammora-launchpad (branch `main`)
- **Dir:** `~/workspace/ammora-builder/app`
- **Dasar:** `~/workspace/ammora-builder/research/RESEARCH.md` (dibaca lengkap, 909 baris)
  + SDK `@ammora-protocol/sdk@0.3.9` diperiksa langsung (`dist/index.d.ts` + nilai
  runtime `giwaSepoliaAutoRouteDeployment`). Aja ana API sing dikarang.

## 1. Scaffold + install

```
cd ~/workspace/ammora-builder
npm create vite@latest app -- --template react-ts
cd app
npm install --save-exact @ammora-protocol/sdk@0.3.9 wagmi viem @tanstack/react-query
```

- Hasil: sukses. Node v24.22.1, npm 10.9.4.
- Versi terinstall: `@ammora-protocol/sdk 0.3.9`, `wagmi 3.7.11`, `viem 2.58.4`,
  `@tanstack/react-query 5.108.2`, `react 19.3.1`.
- Nilai deployment dikonfirmasi saka runtime SDK (dudu hardcode tebakan):
  chain 91342 GIWA Sepolia, RPC `https://sepolia-rpc.giwa.io`,
  Explorer `https://sepolia-explorer.giwa.io`, Registry
  `0x6d043014972b87406C4757a5f2d655A24e0b0aF9`, Factory
  `0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA`, FeePolicy
  `0x17B44C14F640fD429740FA3220f47a567c62725C`, WETH
  `0x4200000000000000000000000000000000000006`,
  `AMMORA_FEE_POLICY_VERSION 0xf879bf5d…`, finality 12 confirmations.

## 2. Build

```
npm run build   # tsc -b && vite build
```

- **PASS** (6.2 detik). Perbaikan sadurunge pass: re-export type
  `PreparedExactInputSwap` / `AmmoraV4ConfigSnapshot` saka `src/lib/ammora.ts`,
  `baseAddr` state dadi `string`, hapus import `WETH` sing ora kepake.
- Warning (non-blocking): `node:worker_threads` di-externalize kanggo browser
  (teka saka `ox`, dependensi wagmi/viem) + chunk JS 1.1 MB > 500 kB
  (peringatan ukuran; code-splitting durung dilakoni kanggo v1).

## 3. Preview + curl

```
npm run preview -- --port 4173 --host 127.0.0.1
curl -s http://127.0.0.1:4173/
```

- **HTTP 200, 484 bytes**, `<title>Bosqu Launchpad — Ammora on GIWA</title>` katon.
- Diverifikasi 2x (server di-restart antarane amarga VM service restart; verifikasi
  kapindho: HTTP 200 + judul bener). Catetan: curl mung ndeleng SPA shell —
  teks badge/komponen dirender client-side dening JS, dadi butuh browser kanggo
  verifikasi tampilan lengkap.
- Server preview dimateni sawise verifikasi (ora ana proses nyasar).

## 4. Smoke test SDK read-only nang RPC live — GAGAL (timeout RPC)

Script sementara (`smoke.tmp.mjs`, dibusak sawise jalan) nganggo SDK langsung:

```js
getChainId() → resolveAmmoraFinalizedHead() → getAmmoraV4ConfigAtBlock(25)
→ AmmoraV4LaunchCurveClient(KGPT curve).getStateAtBlock()
```

- Hasil: `TimeoutError: The request took too long to respond. URL:
  https://sepolia-rpc.giwa.io/ (eth_chainId)` — RPC ora nanggapi saka VM iki
  sajrone ~43 detik (viem retry internal). Dudu error kode: build pass lan
  SDK diimpor kanthi bener; jaringan/RPC sing timeout.
- **Ora diulang** (butuh persetujuan kanggo nyoba maneh). Kudu dicoba maneh saka
  browser/lingkungan liya utawa nalika RPC normal: yen RPC ora bisa dijangkau,
  quote read-only nang Exchange/Launchpad bakal nuduhake error quote (UI wis
  nangani: nampilake pesen error, tombol Swap tetep disabled).
- Bukti keslametan: ora ana transaksi on-chain sing dilakoni (task iki mung
  build + push).

## 5. Fitur v1 sing ana nang kode

- Header + badge GIWA Sepolia 91342 + link waitlist/docs/explorer.
- Connect wallet: wagmi injected connector (MetaMask lsp), chain GIWA Sepolia
  custom, switch-chain yen salah chain. Wallet-connect only; ora ana private
  key/seed nang kode/repo/env.
- Exchange: mode pool concentrated (KGPT ⇄ WETH, pool
  `0xD912Fa18061E5665136AE5dBc002aDa0fc0D3c28`) + mode kurva DBC (alamat kurva
  + base token bebas). Quote live read-only via `AmmoraSwapClient.prepareExactIn`
  (finalized-head block, slippage default 50 bps, deadline 20 mnt) + klasifikasi
  fill kurva via `AmmoraV4LaunchCurveClient` (mung `full` sing bisa di-swap;
  `graduation-boundary`/`partial`/status ≠ Active diblokir kanthi penjelasan).
  Swap via `prepared.execute(walletClient)` (approval ERC-20 ditangani SDK),
  verifikasi V4 core sadurunge sign, hasil receipt + `amountReceived` ditampilke.
- Launchpad: form Config ID (KOSONG default, tanpa preset mbebayani) →
  `getAmmoraV4ConfigAtBlock` nang finalized head → tampilkan enabled/hash/
  owner/feeClaimer/quoteToken/decimals/supply/threshold/creator share/mode/
  poolCreationFee. **Config #6 + hash 0x6048… diblokir nang kode** (cek ID lan
  hash). Form token (nama/simbol/desimal kudu cocog Config/metadataURI) →
  `buildCreateAmmoraV4Launch` → user sign via wallet → receipt diparse
  (`parseAmmoraV4LaunchCreatedReceipt`) + configId/hash dicocokke → token +
  curve ditampilke.
- Footer: disclaimer testnet only, no real money, no mainnet.
- TODO sing ditandhani jelas nang UI (dudu mock): author Config anyar
  (butuh kualifikasi template §8.3), atomic Config+launch+first buy,
  graduation/migrate, klaim FeeVault/LP.

## 6. Sing durung dites end-to-end

- Quote/swap/create-launch live nang browser (butuh wallet + RPC sing bisa
  dijangkau; smoke test RPC saka VM timeout — deleng §4).
- Config creation (`buildCreateAmmoraV4Config`) — TODO, sengaja ora di-mock.

## 7. Commit + push

```
git init / clone repo, git add, commit, push origin main
```

- Commit: `18304e9042d96560257bbdd13170c903e83ee897` — "v1: Bosqu Launchpad — Ammora on GIWA (Exchange + Launchpad)"
- Push: `main -> main` nang https://github.com/Unyiel37/ammora-launchpad (repo sadurunge kosong)
- `.gitignore` bawaan Vite: `node_modules`, `dist`, `*.local` dikecualikake.
  Ora ana file `.env` sing digawe/dikomit.

## 8. Fix quote 21 Nov 23:55 WIB (post-v1)

### Masalah
Situs v1 ke-load, wallet connect, chain + RPC OK, nanging quote Exchange
gagal kanggo 0,01 lan 0,001 WETH: `Quote error: Ammora contract reverted
with PriceRangeViolation`. Dudu gagal RPC — kontrak nolak (revert).

### Penyebab (terverifikasi read-only saka VM, head ~41934xxx)
- Pool KGPT ⇄ WETH `0xD912Fa18…` dudu pool V3 standar (slot0/liquidity/
  tickSpacing revert) — pool concentrated Ammora dhewe (`baseToken`,
  `quoteToken`, `sqrtPrice`, `totalLiquidity`, `reserveBase`,
  `reserveQuote`, `isActive`, `currentFeeBps`, `quoteExactIn`,
  `quoteExactInPartial`).
- State pool: `reserveBase` 10,1737927 KGPT, `reserveQuote`
  0,000000998494278301 WETH (~1e-6 WETH), spot ≈ 10.189.135 KGPT/WETH.
  Cadangan WETH meh entek → buy normal metu saka rentang harga.
- Matriks `quoteExactIn` langsung: buy WETH→KGPT gagal kanggo ≥0,00001
  WETH; mung 0,000001 WETH (→ 10,03 KGPT) lan 0,0000001 WETH (→ 1,80
  KGPT) sukses. Sell KGPT→WETH OK 1–1000 KGPT.
  `quoteExactInPartial` buy 0,01 WETH: mung isi 0,000001028 WETH →
  10,17 KGPT, sisane ora keisi.
- Kurva DBC KGPT status=3 Migrated → trading DBC KGPT ora ana.
- Bug kapindho: app ngirim `quoteBlockNumber: head` kanggo model `dbc` —
  SDK nolak: "explicit-block swap quotes currently support concentrated
  and compounding pools only". Dadi quote kurva DBC liwat `prepareSwap`
  mesthi gagal. Tanpa `quoteBlockNumber`, DBC quote sukses (DKNG buy
  0,01 → 31.092.816, full).
- Bug katelu: app nggunakake `zeroAddress` minangka payer yen wallet
  durung connect — SDK nolak ("payer must be a non-zero address"). Klaim
  "quote works without a wallet" salah kanggo path `prepareExactIn`.
  Payer placeholder `0x0000000000000000000000000000000000000001`
  terverifikasi bisa kanggo quote (pool lan kurva).

### Pasar liyane sing terverifikasi iso quote (head ~41934xxx)
- BAEKHO pool `0x35Fff2d0…` (reserves 60.425.935 BAEKHO / 0,05089 WETH):
  buy 0,01 → 16.593.588 BAEKHO (impact 1679 bps); buy 0,001 →
  1.889.098 BAEKHO (impact 258 bps); sell OK.
- DKNG curve `0xb1c4…` Active: buy 0,01 → 31.092.816, full; buy 0,001 →
  3.709.448, full; sell 1.000.000 → 0,000257 WETH.
- ICD curve `0x2dE7…` Active: buy 0,01 → 106.891.255, full.
- 2D curve `0x44f3…` Active: buy 0,01 → 99.798.387, full.
- TESTD curve `0x0540…` Active: buy 0,01 → 165.275.459, full.
- TNDM pool `0xb2D5…` (reserves 49.899.998 TNDM / 0,003992 WETH): buy
  0,001 OK (→ 11.009.805); buy 0,01 gagal PriceRangeViolation.

### Perbaikan
- `src/lib/tokens.ts`: daftar `MARKETS` (BAEKHO pool, DKNG/ICD/2D/TESTD
  curve, TNDM pool, KGPT pool) + status kesehatan terverifikasi;
  default `baekho-pool`.
- `src/lib/ammora.ts`: `prepareSwap` mung ngirim `quoteBlockNumber`
  kanggo concentrated/compounding, ora kanggo `dbc`; tambah
  `QUOTE_PAYER_PLACEHOLDER`; tambah `getPoolState` (reserves/isActive)
  lan `getPartialFill` (`quoteExactInPartial`).
- `src/components/Exchange.tsx`: dropdown Market (default BAEKHO,
  buy, 0,001 WETH); tampilke reserves pool; yen quote gagal
  `PriceRangeViolation`, tampilke penjelasan basa prasaja + info
  partial-fill + tombol "Use max fillable amount" (set amount dadi
  jumlah sing iso keisi); quote tanpa wallet nganggo placeholder payer.
- Logika keamanan ora diganti: Config #6 tetep diblokir, ora ana
  Config/launch on-chain, ora ana transaksi, testnet wae, ora ana
  private key.
- Probe scratch (`probe-*.mjs`) wis dihapus sadurunge commit.

### Verifikasi
- `npm run build` PASS (tsc + vite, ~1,5 dtk; chunk-size warning wae).
- `npm run preview` HTTP 200, title bener; string pasar anyar
  ("BAEKHO ⇄ WETH", "DKNG ⇄ WETH", "Use max fillable amount",
  "This venue's price range") ana nang bundle sing di-build.
- Quote read-only saka VM terverifikasi liwat probe (ndeleng §8 ndhuwur).
- Verifikasi pungkasan nang browser user (quote default muncul nang
  situs live) durung — kudu dicek agen utama.

## 9. Commit + push (fix quote)

- Commit fix: `a45a026` — "fix: default market BAEKHO, DBC quotes without
  quoteBlockNumber, placeholder payer, PriceRangeViolation explanation +
  partial-fill fallback" — push `main -> main`.
- Deploy: push ora auto-deploy (proyek Vercel dudu git-connected).
  `vercel deploy --temporary` kapisan GAGAL: "This project was claimed
  successfully. Run `vercel login` to continue deploying it" — proyek
  lawas wis diklaim user, ora iso di-deploy maneh tanpa login.
  Deploy kapindho minangka proyek temporary ANYAR:
  **https://turbo-delta-9ikz606.tmp.now** (project
  `prj_SuR8doH5Pu1guIfdYD9xBlNSOzf8`). Verifikasi: site HTTP 200,
  bundle `index-BnibBcbm.js` (cocog build lokal), ngandhut "BAEKHO ⇄
  WETH" + "Use max fillable amount", ora ana teks lawas "payer shown as
  zero address". **Deployment iki kadaluarsa 60 menit (~01:05 WIB) yen
  ora diklaim** — claim link ana nang output deploy (aja dishare
  publik). URL lawas (instant-bronze-nlwo4jr.tmp.now) isih v1.
