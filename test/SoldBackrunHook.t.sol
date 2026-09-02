// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {SoldBackrunHook} from "../src/SoldBackrunHook.sol";
import {SearcherBond} from "../src/SearcherBond.sol";

contract SoldBackrunHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;
    SoldBackrunHook hook;
    SearcherBond bonds;
    address searcher = address(0xB0B);

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();
        bonds = new SearcherBond(address(this), IERC20(Currency.unwrap(currency1)), 1e18, 2);

        address flags = address(
            uint160(
                Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                    | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
            ) ^ (0x4444 << 144)
        );
        deployCodeTo("SoldBackrunHook.sol:SoldBackrunHook", abi.encode(poolManager, bonds), flags);
        hook = SoldBackrunHook(flags);
        bonds.setHook(address(hook));

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        int24 lo = TickMath.minUsableTick(60);
        int24 hi = TickMath.maxUsableTick(60);
        uint128 liq = 100e18;
        (uint256 a0, uint256 a1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), liq
        );
        positionManager.mint(poolKey, lo, hi, liq, a0 + 1, a1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES);

        deal(Currency.unwrap(currency1), searcher, 100e18);
        deal(Currency.unwrap(currency1), address(this), 100e18);
        vm.startPrank(searcher);
        IERC20(Currency.unwrap(currency1)).approve(address(bonds), type(uint256).max);
        IERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        vm.stopPrank();
        IERC20(Currency.unwrap(currency1)).approve(address(bonds), type(uint256).max);
        IERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
    }

    function _retail() internal {
        swapRouter.swapExactTokensForTokens({
            amountIn: 10e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: "",
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function test_retailPostsRight() public {
        _retail();
        uint256 id = hook.latestRight(poolId);
        assertEq(id, 1);
        (,, address winner, uint256 bidAmt, bool filled, bool exists) = hook.rights(id);
        assertTrue(exists);
        assertFalse(filled);
        assertEq(winner, address(0));
        assertEq(bidAmt, 0);
    }

    function test_unbondedBidReverts() public {
        _retail();
        vm.prank(searcher);
        vm.expectRevert(SoldBackrunHook.NotBonded.selector);
        hook.bid(1, 2e18);
    }

    function test_unauthorizedFillReverts() public {
        _retail();
        vm.prank(searcher);
        bonds.bond(5e18);
        vm.prank(searcher);
        hook.bid(1, 2e18);

        bytes memory data = abi.encode(SoldBackrunHook.Kind.BackrunFill, uint256(1), address(this));
        vm.expectRevert();
        swapRouter.swapExactTokensForTokens({
            amountIn: 5e18,
            amountOutMin: 0,
            zeroForOne: false,
            poolKey: poolKey,
            hookData: data,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function test_bidAndFillDonates() public {
        _retail();
        uint256 id = hook.latestRight(poolId);
        vm.prank(searcher);
        bonds.bond(5e18);
        vm.prank(searcher);
        hook.bid(id, 2e18);

        bytes memory data = abi.encode(SoldBackrunHook.Kind.BackrunFill, id, searcher);
        swapRouter.swapExactTokensForTokens({
            amountIn: 5e18,
            amountOutMin: 0,
            zeroForOne: false,
            poolKey: poolKey,
            hookData: data,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        (,,,, bool filled,) = hook.rights(id);
        assertTrue(filled);
        assertGt(hook.totalBackrunPaid(poolId), 2e18);
    }

    function test_initStaticFeePoolReverts() public {
        PoolKey memory staticKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        vm.expectRevert();
        poolManager.initialize(staticKey, Constants.SQRT_PRICE_1_1);
    }
}
