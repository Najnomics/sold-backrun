# Sold Backrun

[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](./LICENSE)
[![Uniswap v4](https://img.shields.io/badge/Uniswap-v4%20hook-7c8bff.svg)](https://docs.uniswap.org/contracts/v4/overview)

UHI10 — *Sustainable Liquidity & MEV Protection*

> **Every retail swap sells its own backrun. Sandwich dies because the leftover arb is already spoken for.**

---

## The idea

**Sold Backrun is a Uniswap v4 hook that turns the backrun of a swap into an on-pool product whose buyer is a searcher and whose seller is the LP.**

Today, a retail swap moves the pool. A searcher backruns it for free (or sandwiches it). The profit leaves the pool. LPs on volatile pairs eat LVR; the searcher keeps the arb.

Sold Backrun inverts that:

1. `afterSwap` **mints a backrun right** for this pool, this tick, this size.
2. Bonded searchers **bid** for that right (`AUCTION_WINDOW = 2` blocks). On a live chain, bid and fill must be atomic (`BackrunAgent.hunt()`).
3. The winner's **bid plus captured arb** settle to the hook and are **`donate`d to in-range LPs**.
4. A sandwich is unprofitable because the leftover arb is **already sold**.

This is **not** a first-in-block LVR auction (53 prior UHI submissions). Those sell *who swaps first*. This sells *who is allowed to trade after this retail swap*.

It is Atrium's own UHI10 one-liner, productized: capture arb around the swap, route it back to LPs in `afterSwap`.

## The problem it solves

- **Sandwiches** need a backrun leg. If that leg is an exclusive, paid right, the sandwich bundle has nothing left to take.
- **LVR** is the CEX-DEX basis closed by the first searcher after a block. Selling that close to a bonded searcher **internalizes** the basis instead of leaking it.
- **Delay hooks** (AsyncSwapHook and ~18 cousins) hide the swap in time. They do not pay LPs. Sold Backrun lets the swap execute **now** and sells the consequence.
- **Fair Path** (sibling repo) *prices* toxic flow. Sold Backrun *markets* the residual arb. They compose; they are not the same hook.

## How it works

The hook never NoOps the retail swap. Retail always fills against the AMM. The hook's job is the **option that retail just created**.

1. **`beforeSwap` / `afterSwap`** — empty `hookData` is retail. Fill swaps pass `abi.encode(Kind.BackrunFill, rightId, winner)` (**96 bytes only**).
2. **`afterSwap` (retail)** — mint a `Right` with `expiry = block.number + AUCTION_WINDOW` (`AUCTION_WINDOW = 2`).
3. **Searcher `bid(rightId, amount)`** — bonded searchers raise first-price in `SearcherBond.asset()`. Highest bid wins; previous bidder is refunded.
4. **Winner fill** — a second swap through the same hook with fill `hookData`. The hook takes the bid plus a `SURPLUS_BIPS` skim, then `donate`s to in-range LPs. There is **no** `fillBackrun()` function.
5. **Expiry** — if `block.number > expiry`, the fill reverts `Expired`. Retail already filled. There is **no** `BackrunExpired` event.

On Unichain Sepolia the two-block window is too tight for a separate bid tx. `BackrunAgent.hunt()` posts retail, bids, and fills **in one transaction**.

```mermaid
flowchart TD
    A[Retail swap executes] --> B["afterSwap: mint Right"]
    B --> C{bonded searcher bids?}
    C -- "yes" --> D[Highest bid wins]
    D --> E["Winner swap with BackrunFill hookData"]
    E --> F["bid + surplus skim → donate to in-range LPs"]
    C -- "no bid by expiry" --> G[Fill reverts Expired · vanilla AMM]
    F --> H[emit BackrunSold]
```

```mermaid
flowchart LR
    R[Retail fill] -- "creates" --> O[BackrunRight]
    O -- "auction" --> S[Bonded searcher]
    S -- "bid + captured arb" --> L[In-range LPs]
    S -- "cannot" --> X[Sandwich the retail swap]
```

## Auction model

Keep v1 **simple enough to demo in five minutes**. Not an EigenLayer AVS. Not a 53rd LVR TOB auction.

| Field | v1 choice | Why |
|---|---|---|
| Auction type | First-price ERC-20; `AUCTION_WINDOW = 2` blocks | Tight on purpose: keepers must bid+fill atomically |
| Eligibility | `bondedOf >= minBond` | `SearcherBond`; hook-only slash |
| Reserve | `0` | Empty auctions must not brick retail |
| Settlement | Bid in sbUSD (token0 / bond asset) | Donate can settle into the book |
| Surplus | `SURPLUS_BIPS` (50) skim on the winner fill | LPs get bid **and** leftover |
| Failure | Right expires (`block.number > expiry`); retail already filled | Retail is never held hostage |

```solidity
struct Right {
    PoolId poolId;
    uint256 expiry;
    address winner;
    uint256 bid;
    bool filled;
    bool exists;
}
```

## Complete user flow

```mermaid
sequenceDiagram
    actor Retail
    actor Searcher
    participant UI as Console
    participant PM as PoolManager
    participant Hook as SoldBackrunHook
    participant LPs as In-range LPs

    Retail->>UI: Swap
    UI->>PM: swap (hookData = retail)
    PM->>Hook: afterSwap
    Hook->>Hook: mint BackrunRight
    Hook-->>UI: emit BackrunPosted

    Searcher->>Hook: bid(rightId, amount)
    Note over Searcher,Hook: other searchers may raise

    Searcher->>PM: swap (hookData = backrunFill, rightId)
    PM->>Hook: beforeSwap
    Hook-->>PM: allow only winner
    PM->>Hook: afterSwap
    Hook->>PM: donate(bid + surplus) to LPs
    Hook-->>UI: emit BackrunSold
```

## Hook functions implemented

| Function | Permission | What it does |
|---|---|---|
| `getHookPermissions` | — | `afterInitialize`, `beforeSwap`, `afterSwap`, `afterSwapReturnDelta`. |
| `_afterInitialize` | `afterInitialize` | Dynamic-fee flag if a small backrun fee override is used; otherwise still records pool identity. |
| `_beforeSwap` | `beforeSwap` | If `hookData` is a backrun fill, require `msg` path holds the live right; else tag retail. |
| `_afterSwap` | `afterSwap` + return delta | Retail: mint right. Backrun fill: take bid + surplus, `donate`, close right. |
| `bid` | — | Bonded searcher raises on `rightId`. |
| `bond` / `unbond` | — | Eligibility capital. |

**On-chain parameters & state**

| Name | Meaning |
|---|---|
| `MIN_BOND` | Capital to bid |
| `AUCTION_WINDOW` | Blocks or flashblock slots until expiry |
| `totalBackrunPaid[poolId]` | Cumulative bid + surplus donated |
| `rights[rightId]` | Live / filled / expired spec |
| `BackrunPosted` / `BackrunBid` / `BackrunSold` | Tape for the console |

## Why this is not a sandwich

A sandwich is: front-run, victim, back-run. Sold Backrun **does not sell the front-run**. The retail swap is already in the pool when the right is minted (`afterSwap`). The only remaining extractable trade is the **close of the basis the retail swap just opened**. That close is sold. A searcher who also tries to front-run is a different product (Fair Path taxes and bonds that). This hook's claim is narrower and therefore judge-proof: **we sell the backrun, not "all MEV".**

## Integrations

| Layer | Integration | Used for |
|---|---|---|
| **Uniswap v4 core** | `PoolManager`, `donate`, `CurrencySettler` | Exclusive fill + LP payout |
| **OpenZeppelin** | `uniswap-hooks` `BaseHook` | Hook base |
| **Unichain** | Sepolia deployment | Live hook, 2-block auction, `BackrunAgent.hunt()` |
| **Frontend / SDK** | `viem`, React, `@uniswap/v4-sdk` | Retail swap, tape (`BackrunPosted` / `BackrunSold`), agent desk |

**Partner integrations (hookathon README requirement)**

- Unichain Sepolia Uniswap v4 periphery (PoolManager, Universal Router, PositionManager).
- Expiry is `block.number + AUCTION_WINDOW`. There is no flashblock oracle in this hook.

## Why it's profitable — as an idea and a business

```mermaid
flowchart LR
    A[Retail swap opens a basis] --> B[Backrun right auctioned]
    B --> C[Searcher pays to close it]
    C --> D[Bid + surplus donated to LPs]
    D --> E[Stickier LP on volatile pairs]
    E --> F[More retail volume]
    F --> A
```

**For LPs.** They are paid for the arb their inventory created, every time, without running a searcher.

**For retail.** Execution is immediate. They are not delayed, encrypted, or sent to a dark pool. The sandwich's backrun leg is missing, so the attack shrinks.

**For searchers.** A clean, exclusive, bonded product: buy the right, fill, keep any edge above the bid if we later add a searcher remainder. v1 can donate 100% of surplus to LPs and still be a better deal than racing in the clear (they get exclusivity).

**For the protocol.** Auction flow is a MEV-native revenue line. v1: 100% LPs. Later: protocol split on the *bid*, never on the retail fee.

**Why it fits UHI10.** Defense (sandwich missing a leg) + recapture (donate) in one hook. Distinct from the 53 LVR auctions because the sold object is **the backrun of this swap**, not top-of-block.

## What this is not

- Not Fair Path (no attestation fee schedule in this repo).
- Not Surplus Sink (no Protect refunds).
- Not a CoW matcher.
- Not "we detect all sandwiches." We make the backrun a scarce right.

## The console

Live: **https://uhi10-sold-backrun.vercel.app** · Agent: **https://uhi10-sold-backrun.vercel.app/agent**

Retail swap posts a right. `BackrunAgent.hunt()` posts, bids, and fills in one transaction because a two-block window cannot wait for a second mempool hop.

## Testing

`forge test` — retail post, bid/refund, unauthorized fill, expiry, fork smoke.

## Repository layout

```
src/
  SoldBackrunHook.sol
  SearcherBond.sol
  BackrunAgent.sol
test/
  SoldBackrunHook.t.sol
frontend/
script/
  DeployUnichain.s.sol
  PopulateTraffic.s.sol
```

## Hookathon gates

- Public repo (this repository)
- Valid Uniswap v4 hook
- Functioning frontend: https://uhi10-sold-backrun.vercel.app
- README partner integrations: Unichain Flashblocks (optional seam + Anvil expiry). No theoretical partners.
- Video: retail swap → bid → fill → LP pot, then a failed sandwich, no AI voice
- Original work for UHI10; not a resubmission of Fair Flow
