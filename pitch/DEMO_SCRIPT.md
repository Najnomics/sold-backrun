# Sold Backrun — 5-Minute Demo Video Guide

A shot-by-shot script for a UHI10 submission video that combines the **pitch deck** and the **live web app**. Total runtime: **~5:00**.

- **Deck:** https://uhi10-sold-backrun-pitch.vercel.app — `F` fullscreen, `→` advance, `S` speaker notes
- **App:** https://uhi10-sold-backrun.vercel.app
- **Contracts (Unichain Sepolia, 1301):** SoldBackrunHook `0x2F5E…D0C4`

---

## 0. Before you hit record (15 min of prep)

**Recording setup**
- **OBS Studio**, **QuickTime**, or **Loom**. **1920×1080**, 30fps.
- Scene A = deck fullscreen. Scene B = maximized app. Or whole-screen + `Cmd-Tab`.

**Browser / wallet prep**
1. Connect on **Unichain Sepolia**. Faucet **sbVOL / sbUSD** now.
2. Pre-check the tape for `RightMinted` / bid / hunt events.
3. Hero path:
   - **Retail swap** large enough to mint a **BackrunRight**.
   - **Bid** in sbUSD as the searcher.
   - **Hunt** opposite within two blocks (or show expire → bid still to LPs).
4. Zoom browser ~110–125%. Do Not Disturb.

**Timing tip:** the two-block window is real. Either hunt immediately after winning the bid, or pre-run a hunt so the tape is rich and do one live mint+bid on camera.

---

## 1. The 5-minute script

> Cut points ✂️. Quotes are voiceover — adapt.

### 0:00 – 0:20 · Title ✂️ deck
> "This is **Sold Backrun** — a Uniswap v4 hook that doesn't hide the backrun. It sells it. Live on Unichain Sepolia."

### 0:20 – 0:50 · Problem → Insight
> "Every large swap leaves a predictable residual. Searchers harvest it in private. LPs get none of it. Hiding flow still leaves the next block free to hunt."

> "Our insight: after the fill, mint a BackrunRight. Let searchers bid. Hunt or expire — the bid donates to LPs either way."

### 0:50 – 1:20 · How → Trust → Fees
> "`afterSwap` mints a two-block right. Searchers lock sbUSD. The winner hunts opposite — or the bid still sinks to LPs. Retail is not taxed extra. Residual is a second market."

### 1:20 – 3:40 · LIVE APP ✂️ browser

**(1:20) Trade**
> "Live console, v4 SDK, sbVOL / sbUSD."

**(1:45) Mint the right**
> "I'll swap. Watch the tape for `RightMinted` — expiry two blocks out."

**(2:20) Bid**
> "Now I bid sbUSD for that right. Highest bid owns the hunt."

**(2:50) Hunt**
> "Opposite swap, bonded searcher in `hookData`, inside the window. The bid `donate`s to LPs."
- If the window is tight: narrate while it confirms. Fallback: expire path — "even if nobody hunts, LPs keep the bid."

**(3:20) Tape**
> "Mint, bid, hunt or expire — all on-chain. Not a CSS auction."

### 3:40 – 4:20 · Flywheel + UHI10 ✂️ deck
> "Fills mint rights, bids pay LPs, yield pulls liquidity, larger fills mint richer rights. Searchers buy a license instead of a gas war."

> "Sustainable liquidity and MEV protection: the leftover is auctioned and time-boxed."

### 4:20 – 4:50 · Deployed
> "Hook and bond live on Unichain Sepolia. Repo open. Try the desk."

### 4:50 – 5:00 · Closing
> "The leftover was always there. Now LPs get paid for it. Thanks for watching."

---

## 2. Quick shot list

| Time | Source | Content |
|------|--------|---------|
| 0:00 | Deck | Title |
| 0:20 | Deck | Problem + Insight |
| 0:50 | Deck | How + auction + fees |
| 1:20 | App | Trade |
| 1:45 | App | Swap → RightMinted |
| 2:20 | App | Bid |
| 2:50 | App | Hunt (or expire) |
| 3:20 | App | Tape |
| 3:40 | Deck | Flywheel + Why UHI10 |
| 4:20 | Deck | Deployed |
| 4:50 | Deck | Closing |

---

## 3. Pro tips

- Rehearse the **hunt within two blocks** once off-camera.
- Show **Unichain Sepolia** in the wallet.
- Lower-third: `uhi10-sold-backrun.vercel.app`
- Your voice only — no AI voice.
- Export 1080p H.264, under ~200 MB.
