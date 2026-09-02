import { useEffect, useMemo, useRef, useState } from "react";
import { parseUnits } from "viem";
import { useAppData } from "../context/AppData";
import { useToast } from "../context/Toast";
import { addresses, explorerTx, isLocal } from "../lib/clients";
import { dualQuote, type DualQuote } from "../lib/sdk";
import { executeSwap, faucet, mine } from "../lib/actions";
import { fmt, feePct } from "../lib/format";

const SLIPPAGE_BIPS = 50n; // 0.50%

export function SwapPage() {
  const { pool, balances, signer, needsConnect, connect, refresh } =
    useAppData();
  const toast = useToast();

  const [zeroForOne, setZeroForOne] = useState(true);
  const [amount, setAmount] = useState("100");
  const [protect, setProtect] = useState(true);
  const [quote, setQuote] = useState<DualQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const inSym = zeroForOne ? addresses.token0Symbol : addresses.token1Symbol;
  const outSym = zeroForOne ? addresses.token1Symbol : addresses.token0Symbol;
  const inBal = balances
    ? zeroForOne
      ? balances.token0
      : balances.token1
    : 0n;

  const amountRaw = useMemo(() => {
    try {
      return amount && Number(amount) > 0 ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  useEffect(() => {
    if (!pool || amountRaw === 0n) {
      setQuote(null);
      return;
    }
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await dualQuote(zeroForOne, amountRaw, pool);
        if (id === seq.current) setQuote(q);
      } catch {
        if (id === seq.current) setQuote(null);
      } finally {
        if (id === seq.current) setQuoting(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [pool, amountRaw, zeroForOne]);

  const chosen = quote ? (protect ? quote.attested : quote.toxic) : null;

  async function doSwap() {
    if (!signer || !pool || amountRaw === 0n || !chosen) return;
    setBusy("Submitting retail swap (posts a right)…");
    try {
      const minOut =
        (chosen.netOut * (10_000n - SLIPPAGE_BIPS)) / 10_000n;
      const hash = await executeSwap({
        zeroForOne,
        amountIn: amountRaw,
        minOut,
        owner: signer.owner,
        wc: signer.wc,
      });
      if (isLocal) await mine(1);
      toast.ok(
        "Retail swap posted a backrun right — empty hookData",
        explorerTx(hash),
      );
      await refresh();
    } catch (e) {
      toast.err(shortErr(e));
    } finally {
      setBusy(null);
    }
  }

  async function getTokens() {
    if (!signer) return;
    setBusy("Minting test tokens…");
    try {
      const hash = await faucet(signer.owner, signer.wc);
      toast.ok("Minted 10,000 of each test token", explorerTx(hash));
      await refresh();
    } catch (e) {
      toast.err(shortErr(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <section className="card card-lg">
        <div className="card-head">
          <div>
            <h2>Swap</h2>
            <span className="muted">v4 SDK quote · dynamic-fee hooked pool</span>
          </div>
        </div>

        <div className="io">
          <label>You pay</label>
          <div className="io-row">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.0"
            />
            <span className="token-badge">
              <span className="tok-dot" /> {String(inSym)}
            </span>
          </div>
          <div className="io-sub">
            <span>Balance: {fmt(inBal, 4)}</span>
            <span style={{ display: "flex", gap: 12 }}>
              {!isLocal && signer && (
                <button className="linkbtn" onClick={getTokens} disabled={!!busy}>
                  Faucet
                </button>
              )}
              <button
                className="linkbtn"
                onClick={() => setAmount(fmt(inBal, 6).replace(/,/g, ""))}
              >
                Max
              </button>
            </span>
          </div>
        </div>

        <button
          className="flip"
          onClick={() => setZeroForOne((v) => !v)}
          aria-label="Flip direction"
        >
          ↓
        </button>

        <div className="io">
          <label>You receive (est.)</label>
          <div className="io-row">
            <input
              readOnly
              value={chosen ? fmt(chosen.netOut, 6).replace(/,/g, "") : quoting ? "…" : "0.0"}
            />
            <span className="token-badge">
              <span className="tok-dot" /> {String(outSym)}
            </span>
          </div>
          <div className="io-sub">
            <span>
              {quote
                ? `1 ${String(inSym)} ≈ ${chosen?.executionPrice} ${String(outSym)}`
                : "—"}
            </span>
            <span>impact {chosen ? `${chosen.priceImpactPct}%` : "—"}</span>
          </div>
        </div>

        <label className="toggle" style={{ marginTop: 14 }}>
          <input
            type="checkbox"
            checked={protect}
            onChange={(e) => setProtect(e.target.checked)}
          />
          <span className="switch" />
          <span className="toggle-txt">
            <strong>Retail swap (empty hookData)</strong>
            <small>
              Posts a backrun right. Bonded searchers bid off-console; winner
              fill uses hookData. This console always sends empty hookData.
            </small>
          </span>
        </label>

        {chosen && (
          <div className="savings">
            {protect ? (
              <>
                You keep <b>+{fmt(quote!.savings, 4)} {String(outSym)}</b> versus
                the public corridor by trading fair.
              </>
            ) : (
              <>
                This swap donates{" "}
                <b>{fmt(quote!.toxic.recapture, 4)} {String(outSym)}</b> back to
                LPs as recapture.
              </>
            )}
          </div>
        )}

        {needsConnect ? (
          <button className="btn btn-primary btn-lg" style={{ marginTop: 16 }} onClick={connect}>
            Connect wallet to swap
          </button>
        ) : (
          <button
            className={`btn btn-lg ${protect ? "btn-primary" : "btn-danger"}`}
            style={{ marginTop: 16 }}
            disabled={!chosen || !!busy || amountRaw === 0n}
            onClick={doSwap}
          >
            {busy ?? "Swap (post backrun right)"}
          </button>
        )}
        <p className="fineprint">
          Quotes come from the Uniswap v4 SDK using live pool state. A retail
          swap mints a backrun right. Bond/bid: stake in SearcherBond, then call{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>bid(rightId, amount)</code>{" "}
          on the hook — not wired in this v1 console.
        </p>
      </section>

      <section className="grid" style={{ gap: 18 }}>
        <div className="corridors">
          <Corridor
            kind="attested"
            selected={protect}
            title="Retail"
            fee={quote ? feePct(quote.attested.feePips) : "0.05%"}
            out={quote ? fmt(quote.attested.netOut, 6) : "—"}
            impact={quote ? `${quote.attested.priceImpactPct}%` : "—"}
            recapture="0"
            outSym={String(outSym)}
            foot="Empty hookData. Mints a backrun right."
            onClick={() => setProtect(true)}
          />
          <Corridor
            kind="toxic"
            selected={!protect}
            title="Backrun fill (searcher)"
            fee={quote ? feePct(quote.toxic.feePips) : "0.30%"}
            out={quote ? fmt(quote.toxic.netOut, 6) : "—"}
            impact={quote ? `${quote.toxic.priceImpactPct}%` : "—"}
            recapture={quote ? fmt(quote.toxic.recapture, 4) : "—"}
            outSym={String(outSym)}
            foot="Winner hookData. Bid + surplus → LPs. Not sent from this form."
            onClick={() => setProtect(false)}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Bond / Bid (v1 note)</h3>
          </div>
          <p className="lead" style={{ fontSize: "0.88rem" }}>
            Bond in the SearcherBond contract, then bid first-price in the bond
            ERC-20. The winner fills with hookData. This page only posts the
            retail right (empty hookData). Bid UI ships later.
          </p>
        </div>
      </section>
    </div>
  );
}

function Corridor({
  kind,
  selected,
  title,
  fee,
  out,
  impact,
  recapture,
  outSym,
  foot,
  onClick,
}: {
  kind: "attested" | "toxic";
  selected: boolean;
  title: string;
  fee: string;
  out: string;
  impact: string;
  recapture: string;
  outSym: string;
  foot: string;
  onClick: () => void;
}) {
  const cls = kind === "attested" ? "fair" : "toxic";
  return (
    <div
      className={`corridor ${cls} ${selected ? "sel" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="corridor-top">
        <span className="corridor-title">{title}</span>
        <span className={`tag ${cls}`}>{kind === "attested" ? "FAIR" : "TAXED"}</span>
      </div>
      <div className="corridor-fee">
        {fee} <small>swap fee</small>
      </div>
      <ul className="kv">
        <li>
          <span>Est. received</span>
          <b>
            {out} {outSym}
          </b>
        </li>
        <li>
          <span>Price impact</span>
          <b>{impact}</b>
        </li>
        <li>
          <span>Recaptured → LPs</span>
          <b>
            {recapture} {outSym}
          </b>
        </li>
      </ul>
      <div className="corridor-foot">{foot}</div>
    </div>
  );
}

function shortErr(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  return m.length > 120 ? `${m.slice(0, 120)}…` : m;
}
