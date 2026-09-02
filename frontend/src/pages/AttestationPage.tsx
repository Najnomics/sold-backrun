import { addresses, explorerAddress, isZero } from "../lib/clients";
import { short } from "../lib/format";
import { Link } from "react-router-dom";

export function AttestationPage() {
  const bonds = addresses.bonds;
  const agent = addresses.agent;
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <section className="card card-lg">
        <div className="card-head">
          <div>
            <h2>Searcher bond</h2>
            <span className="muted">
              {isZero(bonds) ? "not configured" : short(bonds)}
            </span>
          </div>
        </div>
        <p className="lead" style={{ fontSize: "0.9rem" }}>
          Only addresses with <code style={{ fontFamily: "var(--font-mono)" }}>bondedOf &gt;= minBond</code>{" "}
          may bid. The bond asset is <b>sbUSD</b> (token0 of this pool), so a
          winning bid can donate into the same book. Unbond is delayed so a
          sandwich cannot exit in the same block as the violation.
        </p>
        <p className="lead" style={{ fontSize: "0.9rem" }}>
          This console does not post a bond from the browser. The live{" "}
          <Link to="/agent">BackrunAgent</Link> is already bonded and calls{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>hunt()</code> atomically.
          You can also <code style={{ fontFamily: "var(--font-mono)" }}>bond</code> from
          a wallet against the contract below.
        </p>
        {explorerAddress(bonds) && (
          <a className="btn btn-primary" href={explorerAddress(bonds)} target="_blank" rel="noreferrer">
            Bond contract
          </a>
        )}
      </section>
      <section className="card card-lg">
        <div className="card-head">
          <h2>Lifecycle</h2>
        </div>
        <ol className="steps">
          <li>Retail swap (empty hookData) mints a right. Expiry is this block + 2.</li>
          <li>A bonded searcher bids first-price in the bond ERC-20.</li>
          <li>
            Because two blocks is tighter than a second mempool hop,{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>BackrunAgent.hunt()</code>{" "}
            posts, bids, and fills in one transaction.
          </li>
          <li>
            Winner fill donates bid + surplus.{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>BackrunSold</code> hits the tape.
          </li>
        </ol>
        {!isZero(agent) && explorerAddress(agent) && (
          <p className="fineprint">
            Live agent {short(agent)} —{" "}
            <a href={explorerAddress(agent)} target="_blank" rel="noreferrer">
              Uniscan
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
