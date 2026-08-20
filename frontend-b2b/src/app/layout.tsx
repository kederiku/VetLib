import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VetoLib Pro — Espace clinique",
  description:
    "VetoLib Pro : gérez votre clinique vétérinaire, vos praticiens et vos rendez-vous.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="font-sans">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
