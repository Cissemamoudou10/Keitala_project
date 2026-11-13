import type { Metadata } from "next";
import "./globals.css";

// Police, jetons de la charte et coquille : tâches S0-11 et S0-12.
export const metadata: Metadata = {
  title: "Keitala",
  description: "ERP Keitala : stocks, achats, production, ventes et trésorerie.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
