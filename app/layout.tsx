import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RegateApp",
  description: "Resultados históricos de regatas de Argentina",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-center gap-2.5 text-ink">
              <LogoMark />
              <span className="text-lg font-semibold tracking-tight">RegateApp</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <Link href="/" className="transition-colors hover:text-ink">Campeonatos</Link>
              <Link href="/buscar" className="transition-colors hover:text-ink">Buscar timonel</Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <p className="mx-auto w-full max-w-5xl px-5 py-6 text-xs text-muted">
            Resultados de regatas de Argentina. Datos de Viramos.
          </p>
        </footer>
      </body>
    </html>
  );
}
