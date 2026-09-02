import { addresses, chain, isZero } from "../lib/clients";
import { short } from "../lib/format";

export function AboutPage() {
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <section className="card card-lg">
        <div className="prose">
          <h2 style={{ marginTop: 0 }}>The idea</h2>
          <p>
            Retail does not have to give the backrun away. <b>Sold Backrun</b>{" "}
            lets a retail swap mint an exclusive backrun right. Bonded searchers
            compete in a <b>first-price ERC-20 bid</b>. The winner fills through{" "}
            <code>hookData</code>. The bid plus a surplus skim is donated to
            in-range LPs.
          </p>
          <p>
            The live pool is Unichain Sepolia{" "}
            <b>
              {addresses.token0Symbol} / {addresses.token1Symbol}
            </b>
            . Token0 is the bond / bid asset so a winning bid donates into this
            book. These mocks are unique to Sold Backrun.
          </p>

          <h3>Mechanism</h3>
          <ul>
            <li>
              Empty <code>hookData</code> → retail fee (5 bps) and{" "}
              <code>BackrunPosted</code>.
            </li>
            <li>
              <code>bid(rightId, amount)</code> — first-price in the bond asset;
              previous high bidder refunded.
            </li>
            <li>
              Winner fill encodes kind, rightId, and searcher in{" "}
              <code>hookData</code>. Bid + surplus donate to LPs;{" "}
              <code>BackrunSold</code> is the analytics tape.
            </li>
          </ul>
          <h3>Agents</h3>
          <p>
            The auction window is two blocks. An off-chain bot that bids in a
            later transaction will miss it. <b>BackrunAgent.hunt()</b> posts the
            retail swap, bids, and fills in one transaction. Cursor agents,
            solvers, or a cron keeper all call the same function.
          </p>
        </div>
      </section>

      <section className="grid" style={{ gap: 18 }}>
        <div className="card">
          <div className="card-head">
            <h3>Deployment</h3>
            <span className="muted">{chain.name}</span>
          </div>
          <table className="maptable">
            <tbody>
              <tr>
                <td>Hook</td>
                <td className="mono">{short(addresses.hook)}</td>
              </tr>
              <tr>
                <td>Bonds</td>
                <td className="mono">
                  {isZero(addresses.bonds) ? "—" : short(addresses.bonds)}
                </td>
              </tr>
              <tr>
                <td>Swap router</td>
                <td className="mono">{short(addresses.swapRouter)}</td>
              </tr>
              <tr>
                <td>StateView</td>
                <td className="mono">{short(addresses.stateView)}</td>
              </tr>
              <tr>
                <td>PositionManager</td>
                <td className="mono">{short(addresses.positionManager)}</td>
              </tr>
              <tr>
                <td>
                  {addresses.token0Symbol} / {addresses.token1Symbol}
                </td>
                <td className="mono">
                  {short(addresses.token0)} · {short(addresses.token1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Fee schedule</h3>
          </div>
          <table className="maptable">
            <tbody>
              <tr>
                <td>Retail (posts a right)</td>
                <td>
                  <b>0.05%</b> swap fee
                </td>
              </tr>
              <tr>
                <td>Winner backrun fill</td>
                <td>
                  <b>0.30%</b> · bid + surplus → LPs
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
