import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "DnishDev · Freelance workspace",
  description: "Manage your projects, payments, deadlines and invoices in one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-MY"><body>{children}</body></html>;
}
