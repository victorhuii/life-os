import type { Metadata } from "next";
import { DashboardThemeProvider } from "@/components/life/Theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "V.E.C.T.O.R.",
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><DashboardThemeProvider>{children}</DashboardThemeProvider></body>
    </html>
  );
}
