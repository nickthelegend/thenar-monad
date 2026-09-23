import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

// The page is a client component, which cannot export metadata, so its title lives here.
export const metadata: Metadata = { title: "Operator — Thenar" };

/**
 * 404 for something that is not an address. Any well-formed address is a
 * real page — one with nothing recorded is an answer, not an absence.
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  return children;
}
