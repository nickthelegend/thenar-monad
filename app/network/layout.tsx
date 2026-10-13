import type { Metadata } from "next";

export const metadata: Metadata = { title: "Monad, read live — Thenar" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
