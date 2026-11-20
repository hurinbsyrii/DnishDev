import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevDash · Freelance workspace",
  description: "Manage your projects, payments, deadlines and invoices in one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-MY">
      {/* Browser extensions can add attributes to the body before hydration. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
