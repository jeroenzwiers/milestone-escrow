import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Milestone Escrow",
  description: "Milestone payments that release when the work is verified.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
