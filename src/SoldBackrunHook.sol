// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {SearcherBond} from "./SearcherBond.sol";

/// @title SoldBackrunHook
/// @notice Retail swaps mint an exclusive backrun right. Bonded searchers bid in
///         the bond asset. The winner's fill donates the bid plus a surplus skim
///         to in-range LPs. The bid is never left as idle ETH on the hook.
contract SoldBackrunHook is BaseHook, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;
    using CurrencySettler for Currency;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    error NotDynamicFee();
    error NotBonded();
    error NotWinner();
    error Expired();
    error AlreadyFilled();
    error BidTooLow();
    error UnknownRight();
    error WrongPool();
    error BadHookData();
    error ZeroAmount();

    uint24 public constant RETAIL_FEE = 500;
    uint24 public constant BACKRUN_FEE = 3_000;
    uint256 public constant AUCTION_WINDOW = 2;
    uint256 public constant SURPLUS_BIPS = 50;

    SearcherBond public immutable bonds;
    IERC20 public immutable bidToken;

    enum Kind {
        Retail,
        BackrunFill
    }

    struct Right {
        PoolId poolId;
        uint256 expiry;
        address winner;
        uint256 bid;
        bool filled;
        bool exists;
    }

    uint256 public nextRightId = 1;
    mapping(uint256 => Right) public rights;
    mapping(PoolId => uint256) public latestRight;
    mapping(PoolId => uint256) public totalBackrunPaid;

    event BackrunPosted(uint256 indexed rightId, PoolId indexed poolId, uint256 expiry);
    event BackrunBid(uint256 indexed rightId, address indexed searcher, uint256 bid);
    event BackrunSold(uint256 indexed rightId, address indexed searcher, uint256 bid, uint256 surplus);

    constructor(IPoolManager _poolManager, SearcherBond _bonds) BaseHook(_poolManager) {
        bonds = _bonds;
        bidToken = IERC20(_bonds.asset());
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _afterInitialize(address, PoolKey calldata key, uint160, int24) internal pure override returns (bytes4) {
        if (!key.fee.isDynamicFee()) revert NotDynamicFee();
        return this.afterInitialize.selector;
    }

    /// @notice First-price bid in `bidToken`. Previous high bidder is refunded.
    function bid(uint256 rightId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Right storage r = rights[rightId];
        if (!r.exists) revert UnknownRight();
        if (r.filled) revert AlreadyFilled();
        if (block.number > r.expiry) revert Expired();
        if (bonds.bondedOf(msg.sender) < bonds.minBond()) revert NotBonded();
        if (amount <= r.bid) revert BidTooLow();

        bidToken.safeTransferFrom(msg.sender, address(this), amount);

        address prev = r.winner;
        uint256 prevBid = r.bid;
        r.winner = msg.sender;
        r.bid = amount;
        if (prev != address(0) && prevBid != 0) {
            bidToken.safeTransfer(prev, prevBid);
        }
        emit BackrunBid(rightId, msg.sender, amount);
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata hookData)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        (Kind kind, uint256 rightId, address searcher) = _decode(hookData);
        uint24 fee = RETAIL_FEE;
        if (kind == Kind.BackrunFill) {
            Right storage r = rights[rightId];
            if (!r.exists) revert UnknownRight();
            if (r.filled) revert AlreadyFilled();
            if (block.number > r.expiry) revert Expired();
            if (r.winner == address(0) || r.winner != searcher) revert NotWinner();
            if (PoolId.unwrap(r.poolId) != PoolId.unwrap(key.toId())) revert WrongPool();
            fee = BACKRUN_FEE;
        }
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128 hookDeltaUnspecified) {
        PoolId poolId = key.toId();
        (Kind kind, uint256 rightId, address searcher) = _decode(hookData);

        if (kind == Kind.Retail) {
            uint256 id = nextRightId++;
            rights[id] = Right({
                poolId: poolId,
                expiry: block.number + AUCTION_WINDOW,
                winner: address(0),
                bid: 0,
                filled: false,
                exists: true
            });
            latestRight[poolId] = id;
            emit BackrunPosted(id, poolId, block.number + AUCTION_WINDOW);
            return (this.afterSwap.selector, 0);
        }

        Right storage r = rights[rightId];
        if (r.winner != searcher) revert NotWinner();
        if (PoolId.unwrap(r.poolId) != PoolId.unwrap(poolId)) revert WrongPool();
        if (r.filled) revert AlreadyFilled();
        if (block.number > r.expiry) revert Expired();

        r.filled = true;
        (uint256 surplus, int128 taxDelta) = _donateSurplus(key, params, delta);
        uint256 bidPaid = _donateBid(key, r.bid);
        totalBackrunPaid[poolId] += bidPaid + surplus;
        emit BackrunSold(rightId, r.winner, r.bid, surplus);
        return (this.afterSwap.selector, taxDelta);
    }

    function _decode(bytes calldata hookData) internal pure returns (Kind kind, uint256 rightId, address searcher) {
        if (hookData.length == 0) return (Kind.Retail, 0, address(0));
        if (hookData.length != 96) revert BadHookData();
        return abi.decode(hookData, (Kind, uint256, address));
    }

    function _donateBid(PoolKey calldata key, uint256 amount) internal returns (uint256 paid) {
        if (amount == 0) return 0;
        address asset = address(bidToken);
        uint256 amt0 = asset == Currency.unwrap(key.currency0) ? amount : 0;
        uint256 amt1 = asset == Currency.unwrap(key.currency1) ? amount : 0;
        if (amt0 == 0 && amt1 == 0) return 0;
        Currency feeCurrency = Currency.wrap(asset);
        poolManager.donate(key, amt0, amt1, "");
        feeCurrency.settle(poolManager, address(this), amount, false);
        return amount;
    }

    function _donateSurplus(PoolKey calldata key, SwapParams calldata params, BalanceDelta delta)
        internal
        returns (uint256 surplus, int128 hookDelta)
    {
        bool specifiedTokenIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        Currency feeCurrency = specifiedTokenIs0 ? key.currency1 : key.currency0;
        int128 swapAmount = specifiedTokenIs0 ? delta.amount1() : delta.amount0();
        if (swapAmount < 0) swapAmount = -swapAmount;
        surplus = uint256(uint128(swapAmount)) * SURPLUS_BIPS / 10_000;
        if (surplus == 0) return (0, 0);
        feeCurrency.take(poolManager, address(this), surplus, false);
        poolManager.donate(key, specifiedTokenIs0 ? 0 : surplus, specifiedTokenIs0 ? surplus : 0, "");
        feeCurrency.settle(poolManager, address(this), surplus, false);
        hookDelta = surplus.toInt128();
    }
}
