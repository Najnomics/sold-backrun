// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {SoldBackrunHook} from "./SoldBackrunHook.sol";
import {SearcherBond} from "./SearcherBond.sol";

interface IMintable is IERC20 {
    function mint(address to, uint256 amount) external;
}

/// @title BackrunAgent
/// @notice On-chain searcher agent. One call posts a retail right, bids, and
///         fills in the *same block* so the 2-block auction window cannot expire
///         between mempool transactions. This is the agent surface for the hook:
///         keepers / LLM agents / solvers call `hunt`.
contract BackrunAgent {
    using PoolIdLibrary for PoolKey;

    IUniswapV4Router04 public immutable router;
    SoldBackrunHook public immutable hook;
    SearcherBond public immutable bonds;
    IERC20 public immutable token0;
    IERC20 public immutable token1;
    IERC20 public immutable bidToken;
    PoolKey public key;

    event Hunt(uint256 indexed rightId, uint256 bid, bool retailZeroForOne);

    constructor(
        IUniswapV4Router04 router_,
        SoldBackrunHook hook_,
        SearcherBond bonds_,
        IERC20 token0_,
        IERC20 token1_,
        PoolKey memory key_
    ) {
        router = router_;
        hook = hook_;
        bonds = bonds_;
        token0 = token0_;
        token1 = token1_;
        bidToken = IERC20(bonds_.asset());
        key = key_;
    }

    function arm(uint256 mintAmt) external {
        IMintable(address(token0)).mint(address(this), mintAmt);
        IMintable(address(token1)).mint(address(this), mintAmt);
        token0.approve(address(router), type(uint256).max);
        token1.approve(address(router), type(uint256).max);
        bidToken.approve(address(hook), type(uint256).max);
        bidToken.approve(address(bonds), type(uint256).max);
        if (bonds.bondedOf(address(this)) < bonds.minBond()) {
            bonds.bond(bonds.minBond());
        }
    }

    /// @notice Retail swap → bid → opposite-direction fill, atomic.
    function hunt(bool retailZeroForOne, uint256 retailIn, uint256 fillIn, uint256 bidAmt) public {
        router.swapExactTokensForTokens(
            retailIn, 0, retailZeroForOne, key, bytes(""), address(this), block.timestamp + 3600
        );
        uint256 id = hook.latestRight(key.toId());
        hook.bid(id, bidAmt);
        bytes memory fillData = abi.encode(SoldBackrunHook.Kind.BackrunFill, id, address(this));
        router.swapExactTokensForTokens(
            fillIn, 0, !retailZeroForOne, key, fillData, address(this), block.timestamp + 3600
        );
        emit Hunt(id, bidAmt, retailZeroForOne);
    }

    function huntMany(uint256 n, uint256 retailIn, uint256 fillIn, uint256 bidAmt) external {
        for (uint256 i; i < n; ++i) {
            hunt(i % 2 == 0, retailIn, fillIn, bidAmt + i * 1 ether);
        }
    }
}
