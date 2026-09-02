import { useState } from "react";
import { useAppData } from "../context/AppData";
import { useToast } from "../context/Toast";
import { addresses, explorerTx, isLocal, isZero } from "../lib/clients";
import { incrementFlashblock, mine } from "../lib/actions";
import { short } from "../lib/format";

export function AttestationPage() {
  const { policy, signer, needsConnect, connect, refresh } = useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const fair = policy?.fairNow ?? false;
  const oracle = !isZero(addresses.oracle) ? addresses.oracle : addresses.policy;
  const configured = !isZero(oracle);

  async function pulse() {
    if (!signer) return;
    setBusy("incrementFlashblock…");
    try {
      const hash = await incrementFlashblock(signer.owner, signer.wc);
      if (isLocal) await mine(1);
      toast.ok("TEE builder heartbeat — flashblock incremented", explorerTx(hash));
      await refresh();
    } catch (e) {
      toast.err((e as Error).message.slice(0, 120));
    } finally {
      setBusy(null);
    }
  }

  async function advance(n: number) {
    setBusy(`Mining ${n} blocks…`);
    try {
      await mine(n);
      toast.info(`Mined ${n} blocks`);
      await refresh();
    } catch (e) {
      toast.err((e as Error).message.slice(0, 120));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <section className="card card-lg">
        <div className="card-head">
          <div>
            <h2>Attestation oracle</h2>
            <span className="muted">{configured ? short(oracle) : "not configured"}</span>
          </div>
        </div>

        <div className={`status-big ${fair ? "fair" : "toxic"}`}>
          <span className="sd" />
          <div>
            <strong>{fair ? "FAIR / TEE ACTIVE" : "NO ORACLE HEARTBEAT"}</strong>
            <small>
              {policy
                ? `current block ${policy.block.toString()} · fair until ${policy.fairUntilBlock.toString()}`
                : "reading oracle…"}
            </small>
          </div>
        </div>

        <p className="lead" style={{ fontSize: "0.9rem" }}>
          Sold Backrun prices via a first-price backrun auction, not a mock fair
          window. If an oracle is deployed, <code style={{ fontFamily: "var(--font-mono)" }}>incrementFlashblock()</code>{" "}
          is an owner-gated TEE builder heartbeat with no duration argument.
        </p>

        {needsConnect ? (
          <button className="btn btn-primary btn-lg" style={{ marginTop: 8 }} onClick={connect}>
            Connect wallet
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn btn-primary" disabled={!!busy || !configured} onClick={pulse}>
              {busy ?? "incrementFlashblock"}
            </button>
            {isLocal && (
              <button className="btn btn-outline" disabled={!!busy} onClick={() => advance(1)}>
                Mine 1 block
              </button>
            )}
          </div>
        )}
        {!configured && (
          <p className="fineprint">
            This deployment has no oracle/policy in deployed.json. Bond and bid
            on-chain; retail swaps still post rights.
          </p>
        )}
      </section>

      <section className="card card-lg">
        <div className="card-head">
          <h2>Lifecycle</h2>
        </div>
        <ol className="steps">
          <li>
            Retail swap (empty hookData) mints a backrun right.
          </li>
          <li>
            Bonded searchers <b>bid</b> first-price in the bond ERC-20.
          </li>
          <li>
            Winner fill via hookData donates bid + surplus to LPs.
          </li>
          <li>
            <code style={{ fontFamily: "var(--font-mono)" }}>BackrunSold</code>{" "}
            feeds the analytics tape as recaptured value.
          </li>
        </ol>
      </section>
    </div>
  );
}
