import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Fournisseurs } from "@/components/fournisseurs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Keitala",
  description: "ERP Keitala : stocks, achats, production, ventes et trésorerie.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Fournisseurs>{children}</Fournisseurs>
      </body>
    </html>
  );
}
