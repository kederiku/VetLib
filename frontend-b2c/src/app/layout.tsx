import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VetoLib — Prenez rendez-vous",
  description:
    "Prenez rendez-vous pour votre animal avec un vétérinaire proche de chez vous.",
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
