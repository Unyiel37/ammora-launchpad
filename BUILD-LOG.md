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
