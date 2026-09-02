import { Link } from "react-router-dom";
import { addresses, explorerAddress, explorerTx, isZero } from "../lib/clients";
import { useAppData } from "../context/AppData";
import { fmt, short } from "../lib/format";

export function AgentPage() {
  const { events, recaptured, ready } = useAppData();
  const sold = events.filter((e) => !e.attested);
  const posted = events.filter((e) => e.attested);
  const agent = addresses.agent;
  const live = !isZero(agent);

  return (
    <div className="grid" style={{ gap: 20 }}>
      <section className="hero pit-board">
        <div className="pit-quotes">
          <div>
            <span>SURFACE</span>
            <b>hunt()</b>
          </div>
          <div>
            <span>WINDOW</span>
            <b>SAME BLOCK</b>
          </div>
          <div>
            <span>RIGHTS</span>
            <b>{ready ? posted.length : "—"}</b>
          </div>
          <div>
            <span>FILLS</span>
            <b>{ready ? sold.length : "—"}</b>
          </div>
        </div>
        <div className="pit-copy">
          <span className="hero-eyebrow">AGENT DESK · ON-CHAIN SEARCHER</span>
          <h1>
            A keeper calls <span className="grad">hunt</span>. Retail, bid, fill — atomic.
          </h1>
          <p>
            Unichain flashblocks are faster than a two-block auction. An off-chain
            bot that posts a bid in a later transaction will miss the window.
            <b> BackrunAgent</b> is the integration: one Solidity call mints the
            right, bids ERC-20, and fills with <code>hookData</code> in the same
            block. Cursor agents, solvers, or a cron keeper all hit the same
            function.
          </p>
          <div className="hero-cta">
            {live && explorerAddress(agent) && (
              <a className="btn btn-primary" href={explorerAddress(agent)} target="_blank" rel="noreferrer">
                Agent {short(agent)}
              </a>
            )}
            <Link to="/swap" className="btn btn-outline">
              Post a retail right
            </Link>
          </div>
        </div>
      </section>

      <section className="grid cols-3">
        <div className="card feature">
          <h3>1 · Observe</h3>
          <p>
            Listen for <code>BackrunPosted</code>. The auction expires in two
            blocks — too tight for a second mempool hop.
          </p>
        </div>
        <div className="card feature">
          <h3>2 · hunt()</h3>
          <p>
            The agent contract swaps as retail, bids from its bonded inventory,
            then fills opposite-direction with{" "}
            <code>abi.encode(Kind.BackrunFill, rightId, agent)</code>.
          </p>
        </div>
        <div className="card feature">
          <h3>3 · LPs collect</h3>
          <p>
            Bid + surplus skim donate into the pool. Tape recapture is{" "}
            <b>{fmt(recaptured, 4)}</b> on-chain.
          </p>
        </div>
      </section>

      <section className="card card-lg">
        <div className="card-head">
          <div>
            <h2>Fills from the agent</h2>
            <span className="muted">BackrunSold · newest first</span>
          </div>
        </div>
        {sold.length === 0 ? (
          <p className="empty">Waiting for hunt() fills…</p>
        ) : (
          <ul className="tape">
            {sold.slice(0, 24).map((e) => (
              <li key={`${e.txHash}:${e.logIndex}`} className="row toxic">
                <span className="tag toxic">SOLD</span>
                <span className="row-tax">+{fmt(e.taxAmount, 4)} → LPs</span>
                <span className="row-mono">blk {e.block.toString()}</span>
                <span className="row-mono">{short(e.sender)}</span>
                {explorerTx(e.txHash) && (
                  <a href={explorerTx(e.txHash)} target="_blank" rel="noreferrer">
                    tx
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
