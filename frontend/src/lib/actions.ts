import type { Address, Hex, WalletClient } from "viem";
import {
  account,
  addresses,
  deployBlock,
  isZero,
  logsClient,
  poolKey,
  publicClient,
  walletClient,
} from "./clients";
import {
  erc20Abi,
  hookAbi,
  policyAbi,
  stateViewAbi,
  swapRouterAbi,
} from "./abi";
import { POOL_ID, type PoolState } from "./sdk";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type Balances = { token0: bigint; token1: bigint };

export type PolicyState = {
  fairUntilBlock: bigint;
  fairNow: boolean;
  block: bigint;
};

export type LastSwap = {
  attested: boolean;
  fee: number;
  taxAmount: bigint;
  taxCurrency: Address;
  sender: Address;
  blockNumber: bigint;
};

export async function readPoolState(): Promise<PoolState> {
  const [slot0, liquidity] = await Promise.all([
    publicClient.readContract({
      address: addresses.stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [POOL_ID],
    }),
    publicClient.readContract({
      address: addresses.stateView,
      abi: stateViewAbi,
      functionName: "getLiquidity",
      args: [POOL_ID],
    }),
  ]);
  const [sqrtPriceX96, tick, , lpFee] = slot0 as readonly [
    bigint,
    number,
    number,
    number,
  ];
  return {
    sqrtPriceX96,
    tick: Number(tick),
    liquidity: liquidity as bigint,
    lpFee: Number(lpFee),
  };
}

export async function readBalances(owner: Address): Promise<Balances> {
  const [b0, b1] = await Promise.all([
    publicClient.readContract({
      address: addresses.token0,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
    publicClient.readContract({
      address: addresses.token1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
  ]);
  return { token0: b0 as bigint, token1: b1 as bigint };
}

export async function readPolicy(): Promise<PolicyState> {
  const block = await publicClient.getBlockNumber();
  const target = !isZero(addresses.policy) ? addresses.policy : addresses.oracle;
  if (isZero(target)) {
    return { fairUntilBlock: 0n, fairNow: false, block };
  }
  const [fairUntilBlock, fairNow] = await Promise.all([
    publicClient.readContract({
      address: target,
      abi: policyAbi,
      functionName: "fairUntilBlock",
    }),
    publicClient.readContract({
      address: target,
      abi: policyAbi,
      functionName: "isFair",
      args: [block],
    }),
  ]);
  return { fairUntilBlock: fairUntilBlock as bigint, fairNow: fairNow as boolean, block };
}

const backrunPostedEvent = {
  type: "event",
  name: "BackrunPosted",
  inputs: [
    { name: "rightId", type: "uint256", indexed: true },
    { name: "poolId", type: "bytes32", indexed: true },
    { name: "expiry", type: "uint256", indexed: false },
  ],
} as const;

const backrunSoldEvent = {
  type: "event",
  name: "BackrunSold",
  inputs: [
    { name: "rightId", type: "uint256", indexed: true },
    { name: "searcher", type: "address", indexed: true },
    { name: "bid", type: "uint256", indexed: false },
    { name: "surplus", type: "uint256", indexed: false },
  ],
} as const;

export type SwapEvent = {
  attested: boolean;
  fee: number;
  taxAmount: bigint;
  taxCurrency: Address;
  sender: Address;
  block: bigint;
  txHash: Hex;
  logIndex: number;
};

const LOG_CHUNK = 4_000n;
const MAX_LOOKBACK = 120_000n;
const OVERLAP = 4_000n;

const eventCache = new Map<string, SwapEvent>();
let scannedTo: bigint | null = null;

async function fetchSwapLogs(from: bigint, to: bigint) {
  try {
    const [sold, posted] = await Promise.all([
      logsClient.getLogs({
        address: addresses.hook,
        event: backrunSoldEvent,
        fromBlock: from,
        toBlock: to,
      }),
      logsClient.getLogs({
        address: addresses.hook,
        event: backrunPostedEvent,
        fromBlock: from,
        toBlock: to,
      }),
    ]);
    return { sold, posted };
  } catch {
    return { sold: [], posted: [] };
  }
}

export async function readSwapEvents(limit = 12): Promise<SwapEvent[]> {
  const head = await logsClient.getBlockNumber();
  const lookbackFloor = head > MAX_LOOKBACK ? head - MAX_LOOKBACK : 0n;
  const historyFloor = deployBlock > lookbackFloor ? deployBlock : lookbackFloor;

  const from =
    scannedTo === null
      ? historyFloor
      : scannedTo - OVERLAP > historyFloor
        ? scannedTo - OVERLAP
        : historyFloor;

  for (let lo = from; lo <= head; lo += LOG_CHUNK) {
    const hi = lo + LOG_CHUNK - 1n > head ? head : lo + LOG_CHUNK - 1n;
    const { sold, posted } = await fetchSwapLogs(lo, hi);
    for (const l of posted) {
      const key = `${l.transactionHash}:${l.logIndex}:post`;
      eventCache.set(key, {
        attested: true,
        fee: 500,
        taxAmount: 0n,
        taxCurrency: addresses.token0,
        sender: ZERO,
        block: l.blockNumber ?? 0n,
        txHash: l.transactionHash as Hex,
        logIndex: l.logIndex ?? 0,
      });
    }
    for (const l of sold) {
      const key = `${l.transactionHash}:${l.logIndex}:sold`;
      const bid = (l.args.bid ?? 0n) as bigint;
      const surplus = (l.args.surplus ?? 0n) as bigint;
      eventCache.set(key, {
        attested: false,
        fee: 3000,
        taxAmount: bid + surplus,
        taxCurrency: addresses.token0,
        sender: (l.args.searcher ?? ZERO) as Address,
        block: l.blockNumber ?? 0n,
        txHash: l.transactionHash as Hex,
        logIndex: l.logIndex ?? 0,
      });
    }
  }
  scannedTo = head;

  return [...eventCache.values()]
    .sort((a, b) =>
      a.block > b.block ? -1 : a.block < b.block ? 1 : b.logIndex - a.logIndex,
    )
    .slice(0, limit);
}

export async function readTotalRecaptured(): Promise<bigint> {
  return (await publicClient.readContract({
    address: addresses.hook,
    abi: hookAbi,
    functionName: "totalBackrunPaid",
    args: [POOL_ID],
  })) as bigint;
}

export async function readLastSwap(): Promise<LastSwap> {
  const id = (await publicClient.readContract({
    address: addresses.hook,
    abi: hookAbi,
    functionName: "latestRight",
    args: [POOL_ID],
  })) as bigint;
  if (id === 0n) {
    return {
      attested: false,
      fee: 3000,
      taxAmount: 0n,
      taxCurrency: addresses.token0,
      sender: ZERO,
      blockNumber: 0n,
    };
  }
  const r = await publicClient.readContract({
    address: addresses.hook,
    abi: hookAbi,
    functionName: "rights",
    args: [id],
  });
  return {
    attested: false,
    fee: 3000,
    taxAmount: r[3],
    taxCurrency: addresses.token0,
    sender: r[2],
    blockNumber: r[1],
  };
}

const GAS = {
  approve: 80_000n,
  swap: 1_500_000n,
  liquidity: 2_500_000n,
  policy: 120_000n,
  mint: 120_000n,
} as const;

async function ensureRouterAllowance(
  token: Address,
  owner: Address,
  wc: WalletClient,
) {
  const allowance = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, addresses.swapRouter],
  })) as bigint;
  if (allowance > 10n ** 30n) return;
  const hash = await wc.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [addresses.swapRouter, (1n << 256n) - 1n],
    account: owner,
    chain: null,
    gas: GAS.approve,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export type SwapArgs = {
  zeroForOne: boolean;
  amountIn: bigint;
  minOut: bigint;
  owner?: Address;
  wc?: WalletClient;
};

export async function executeSwap({
  zeroForOne,
  amountIn,
  minOut,
  owner = account.address,
  wc = walletClient,
}: SwapArgs): Promise<Hex> {
  const inputToken = zeroForOne ? addresses.token0 : addresses.token1;
  await ensureRouterAllowance(inputToken, owner, wc);
  const hash = await wc.writeContract({
    address: addresses.swapRouter,
    abi: swapRouterAbi,
    functionName: "swapExactTokensForTokens",
    args: [
      amountIn,
      minOut,
      zeroForOne,
      poolKey,
      "0x",
      owner,
      BigInt(Math.floor(Date.now() / 1000 + 3600)),
    ],
    account: owner,
    chain: null,
    gas: GAS.swap,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function incrementFlashblock(
  owner: Address = account.address,
  wc: WalletClient = walletClient,
): Promise<Hex> {
  const target = !isZero(addresses.oracle) ? addresses.oracle : addresses.policy;
  const hash = await wc.writeContract({
    address: target,
    abi: policyAbi,
    functionName: "incrementFlashblock",
    account: owner,
    chain: null,
    gas: GAS.policy,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function faucet(
  owner: Address,
  wc: WalletClient,
  amount: bigint = 10_000n * 10n ** 18n,
): Promise<Hex> {
  const mintOne = (token: Address) =>
    wc.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "mint",
      args: [owner, amount],
      account: owner,
      chain: null,
      gas: GAS.mint,
    });
  const h0 = await mintOne(addresses.token0);
  await publicClient.waitForTransactionReceipt({ hash: h0 });
  const h1 = await mintOne(addresses.token1);
  await publicClient.waitForTransactionReceipt({ hash: h1 });
  return h1;
}

export async function mine(count: number): Promise<void> {
  await publicClient.request({
    method: "anvil_mine" as never,
    params: [`0x${count.toString(16)}`, "0x0"] as never,
  });
}

export async function addLiquidity(
  calldata: Hex,
  value: bigint,
  owner: Address = account.address,
  wc: WalletClient = walletClient,
): Promise<Hex> {
  const hash = await wc.sendTransaction({
    to: addresses.positionManager,
    data: calldata,
    value,
    account: owner,
    chain: null,
    gas: GAS.liquidity,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
