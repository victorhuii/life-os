import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Victor / Life OS",
  description: "Your personal control center. Daily intelligence, connected tools, and focused work.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
