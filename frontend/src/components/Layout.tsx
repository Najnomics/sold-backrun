import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { addresses, chain, explorerTx, isLocal } from "../lib/clients";
import { useAppData } from "../context/AppData";
import { useToast } from "../context/Toast";
import { faucet } from "../lib/actions";
import { fmt, short } from "../lib/format";
import {
  IconBook,
  IconChart,
  IconDrop,
  IconHome,
  IconShield,
  IconSwap,
} from "./icons";

const NAV = [
  { to: "/", label: "PIT", icon: IconHome, end: true },
  { to: "/swap", label: "FILL", icon: IconSwap },
  { to: "/liquidity", label: "LP", icon: IconDrop },
  { to: "/analytics", label: "TAPE", icon: IconChart },
  { to: "/attestation", label: "BOND", icon: IconShield },
  { to: "/about", label: "SPEC", icon: IconBook },
];

export function Layout() {
  const loc = useLocation();
  return (
    <div className="pit-app">
      <aside className="pit-rail">
        <div className="pit-mark">SB</div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) => `pit-ico ${isActive ? "on" : ""}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </aside>
      <div className="pit-stage">
        <div className="pit-ticker">
          SOLD BACKRUN · RETAIL MINTS THE RIGHT · BONDED SEARCHERS BID ERC-20 · WINNER FILL DONATES TO LPS ·{" "}
          {loc.pathname.toUpperCase()} · {chain.name.toUpperCase()}
        </div>
        <header className="pit-head">
          <div>
            <div className="pit-kicker">Auction desk</div>
            <div className="pit-title">Sold Backrun</div>
          </div>
          <div className="pit-tools">
            <FaucetButton />
            <NetworkChip />
            <WalletChip />
          </div>
        </header>
        <main className="content">
          <Suspense fallback={<div className="skel" style={{ height: 240 }} />}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="pit-foot">
          <span>bid + surplus → donate</span>
          <a href={`https://sepolia.uniscan.xyz/address/${addresses.hook}`} target="_blank" rel="noreferrer">
            {addresses.hook.slice(0, 10)}…
          </a>
        </footer>
      </div>
    </div>
  );
}

function FaucetButton() {
  const { signer, refresh } = useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (isLocal || !signer) return null;
  return (
    <button
      className="btn btn-ghost"
      disabled={busy}
      onClick={async () => {
        if (!signer) return;
        setBusy(true);
        try {
          const hash = await faucet(signer.owner, signer.wc);
          toast.ok("Minted 10,000 of each test token", explorerTx(hash));
          await refresh();
        } catch (e) {
          toast.err((e as Error).message.slice(0, 100));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "MINT…" : "FAUCET"}
    </button>
  );
}

function NetworkChip() {
  return (
    <span className="chip">
      <span className={`net-dot ${isLocal ? "local" : ""}`} />
      {isLocal ? "ANVIL" : chain.name.toUpperCase()}
    </span>
  );
}

function WalletChip() {
  const { signer, balances, connect, disconnect, needsConnect } = useAppData();
  if (needsConnect) {
    return (
      <button className="btn btn-primary" onClick={connect}>
        CONNECT
      </button>
    );
  }
  return (
    <span className="chip wallet-chip" onClick={isLocal ? undefined : disconnect}>
      {short(signer?.owner)}
      {balances && (
        <span className="bals">
          {fmt(balances.token0, 2)} {String(addresses.token0Symbol)}
        </span>
      )}
    </span>
  );
}
