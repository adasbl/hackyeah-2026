import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { SiteHeader } from '@/components/site-header';
import { NavigationTracker } from '@/components/navigation/navigation-tracker';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Fit Pass Finder', template: '%s | Fit Pass Finder' },
  description:
    'Znajdź siłownię, basen, jogę lub ściankę i sprawdź, czy obiekt deklaruje akceptację kart MultiSport, BeActive, Medicover Sport lub PZU Sport.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <NavigationTracker />
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
