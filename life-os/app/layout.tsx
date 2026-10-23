import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Victor / Life OS",
  description: "Your day in one place. Weather, calendar, email, course deadlines and a personal assistant.",
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
