import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Mahoraga Workspace 7.0.0-alpha.2",
  description: "One reasoning and execution workspace for cloud intelligence and an owner-paired Mahoraga runtime. Enhanced UI for v7.0.0-alpha.2 with sandbox-to-promote pipeline, monitor, admin checklist, ownership surface, relay handshake, and readiness.refresh recovery for stale canary evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
