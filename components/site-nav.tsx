"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";
import { useBlockNumber } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ThenarWordmark } from "@/components/brand";
import { useSession } from "@/components/session";
import { addressUrl, IS_DEPLOYED, CURRENCY, appChain } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";

/**
 * Every page, in three groups a person can read.
 *
 * Ten sections in a row, named after the protocol's own nouns ("Floor",
 * "Foundry", "Labs"), made the site read as a control panel: the words meant
 * nothing to someone who came to do a task, and the row ran off the edge.
 * Grouped by what a visitor came for, with a line saying what each page is,
 * nothing is removed and everything is findable.
 */
const GROUPS: { label: string; items: { href: string; label: string; hint: string }[] }[] = [
  {
    label: "Earn",
    items: [
      { href: "/hub", label: "Find a task", hint: "Do a task with a robot arm and get paid" },
      { href: "/post", label: "Post a task", hint: "Fund a task for others to record" },
      { href: "/portfolio", label: "My earnings", hint: "Your runs and what they paid" },
      { href: "/leaderboard", label: "Top operators", hint: "Who has earned the most" },
      { href: "/passkey", label: "Your passkey", hint: "The one-time step before you can earn" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/corpus", label: "Buy the data", hint: "Every recorded run, ready for training" },
      { href: "/agents", label: "For AI agents", hint: "Agents pay per task, in USDC on Monad" },
      { href: "/corpus-token", label: "Owner shares", hint: "People who record the data own it" },
      { href: "/inventory", label: "Object library", hint: "Every object and room a task can use" },
      { href: "/space", label: "Live floor", hint: "Who is working on what, right now" },
    ],
  },
  {
    label: "Protocol",
    items: [
      { href: "/lab", label: "Labs", hint: "A research lab's budget, spent only on tasks" },
      { href: "/foundry", label: "Model foundry", hint: "Models trained on the data, and who gets paid" },
      { href: "/spec/so101", label: "The arms", hint: "The SO-101 and the THENAR-6, drivable" },
      { href: "/contracts", label: "Contracts", hint: "Every contract on Monad, read live" },
      { href: "/status", label: "Status", hint: "Is everything working" },
      { href: "/changelog", label: "Changelog", hint: "What changed, from the git history" },
    ],
  },
];

const inGroup = (pathname: string | null, g: (typeof GROUPS)[number]) =>
  g.items.some((i) => pathname === i.href || pathname?.startsWith(`${i.href}/`) || (i.href === "/spec/so101" && pathname === "/spec"));

export function SiteNav() {
  const pathname = usePathname();
  const s = useSession();
  const { data: block } = useBlockNumber({ watch: true, query: { enabled: IS_DEPLOYED } });

  // Which menu is open: a group label, "all" for the phone menu, or none.
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Hooks above, early returns below: a hook after a conditional return is a
  // hook that does not always run. The landing page carries its own nav, and
  // the station is a full-screen instrument.
  if (pathname === "/") return null;
  if (pathname?.startsWith("/station/")) return null;

  const item = (i: (typeof GROUPS)[number]["items"][number]) => {
    const active = pathname === i.href || pathname?.startsWith(`${i.href}/`);
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={() => setOpen(null)}
        aria-current={active ? "page" : undefined}
        className={cn("flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-ink-2", active && "bg-ink-2")}
      >
        <span className={cn("text-[14px]", active ? "text-signal" : "text-scribe")}>{i.label}</span>
        <span className="text-[12px] leading-snug text-scribe-3">{i.hint}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule bg-ink-1">
        <div ref={bar} className="relative mx-auto flex h-14 max-w-[1400px] items-stretch gap-3 px-4 sm:gap-6 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center self-center" aria-label="Thenar home">
            <ThenarWordmark />
          </Link>

          <nav className="hidden min-w-0 flex-1 items-stretch sm:flex" aria-label="Sections">
            {GROUPS.map((g) => (
              <div key={g.label} className="relative flex">
                <button
                  type="button"
                  aria-expanded={open === g.label}
                  aria-haspopup="true"
                  onClick={() => setOpen(open === g.label ? null : g.label)}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap px-3 font-mono text-[12px] font-medium uppercase tracking-[0.14em] transition-colors sm:px-4",
                    inGroup(pathname, g) || open === g.label ? "text-scribe" : "text-scribe-3 hover:text-scribe-2",
                  )}
                >
                  {g.label}
                  <span aria-hidden className={cn("text-[9px] transition-transform", open === g.label && "rotate-180")}>▼</span>
                </button>
                {inGroup(pathname, g) ? <span aria-hidden className="pointer-events-none absolute inset-x-3 bottom-0 h-[2px] bg-signal sm:inset-x-4" /> : null}
                {open === g.label ? (
                  <div className="absolute left-0 top-full z-50 mt-px w-[290px] border border-rule bg-ink-1 py-1 shadow-lg">
                    {g.items.map(item)}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          <button
            type="button"
            aria-expanded={open === "all"}
            onClick={() => setOpen(open === "all" ? null : "all")}
            className="flex flex-1 items-center justify-start font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-2 sm:hidden"
          >
            Menu {open === "all" ? "✕" : "▼"}
          </button>
          {open === "all" ? (
            <div className="absolute inset-x-0 top-full z-50 max-h-[80vh] overflow-y-auto border-b border-rule bg-ink-1 sm:hidden">
              {GROUPS.map((g) => (
                <div key={g.label} className="border-t border-rule py-1">
                  <span className="block px-4 pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-scribe-3">{g.label}</span>
                  {g.items.map(item)}
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <span className="hidden items-baseline gap-2 font-mono text-[12px] text-scribe-3 xl:flex">
              {appChain.name}
              {block ? (
                <span className="text-scribe-2 tabular-nums" title="Latest block">
                  #{block.toString()}
                </span>
              ) : null}
            </span>

            <span className="hidden sm:flex"><ThemeToggle /></span>

            {s.connected ? (
              <div className="flex items-stretch border border-rule-strong">
                <span className="flex items-center border-r border-rule-strong px-2.5 font-mono text-[12px] tabular-nums text-signal sm:px-3">
                  {fmtMon(s.balance, 3)}
                  <span className="ml-1 text-[12px] text-scribe-3">{CURRENCY}</span>
                </span>
                <a
                  href={s.address ? addressUrl(s.address) : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden items-center px-3 font-mono text-[12px] text-scribe-2 transition-colors hover:text-scribe sm:flex"
                  title="View on the explorer"
                >
                  {s.address ? shortHash(s.address) : ""}
                </a>
                <button
                  onClick={() => s.disconnect()}
                  className="border-l border-rule-strong px-2.5 font-mono text-[12px] uppercase tracking-[0.1em] text-scribe-3 transition-colors hover:text-reject"
                  title="Sign out"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={s.connect}
                disabled={s.connecting}
                className="border border-scribe bg-scribe px-4 py-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
              >
                {s.connecting ? "Signing in…" : "Sign in"}
              </button>
            )}
          </div>
        </div>
      </header>

      {!IS_DEPLOYED ? (
        <Banner tone="reject">
          No contract address is configured. Set <code>NEXT_PUBLIC_AXON_ADDRESS</code> and restart.
        </Banner>
      ) : null}

      {s.connectError && !s.connected ? (
        <Banner tone="reject">
          That wallet refused the connection. Unlock it and try again.
        </Banner>
      ) : null}
    </>
  );
}

function Banner({ tone, children }: { tone: "reject" | "signal"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-y-1 border-b px-5 py-2 text-[13px]",
        tone === "reject"
          ? "border-reject bg-reject-dim text-reject"
          : "border-signal bg-signal-dim text-signal",
      )}
    >
      {children}
    </div>
  );
}
