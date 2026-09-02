# Security notes

- Hook callbacks are PoolManager-only (`BaseHook`).
- Backrun fills must carry `hookData = abi.encode(Kind.BackrunFill, rightId, winner)`.
- Bids are ERC-20, first-price, previous bidder refunded. Bid + surplus donate on fill.
- Bonded searchers only. Unbond delay lives on `SearcherBond`.
- `.env` is gitignored. Never commit keys.
