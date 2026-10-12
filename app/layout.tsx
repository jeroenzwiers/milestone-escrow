import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Milestone Escrow",
  description: "Give it a goal and a budget: AI agents assemble a team, PayPal holds the money, and each provider is paid when their work is verified.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
