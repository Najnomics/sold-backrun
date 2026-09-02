# Product + security audit (UHI10)

See Fair Path `AUDIT.md` for the shared v4 rules. This repo’s extra fixes:

- Bids are ERC-20 (not ETH left on the hook). Previous bidder is refunded under `nonReentrant`.
- Fill `hookData` must be `abi.encode(Kind.BackrunFill, rightId, winner)` (96 bytes).
- Bid + surplus donate on the winner fill.

Tests: retail post, bid/refund, unauthorized fill, expiry, fork smoke.

## Residual (accepted)

- Fill `hookData` names a winner address; it is not an ECDSA identity.
- `BackrunAgent.hunt()` is permissionless on Sepolia and can spend the agent’s inventory. That is a demo keeper, not a production access-control model.
- `AUCTION_WINDOW = 2` means sequential mempool bid/fill txs will miss; atomic `hunt()` is required on a live chain.
