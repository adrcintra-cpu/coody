import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'COODY — Workspace criativo',
  description:
    'Planejamento editorial, inteligência de marca, produção criativa e aprovação.',
  // App icon: browser tab, home screen (iOS/Android) and installed app.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
  appleWebApp: { title: 'COODY', capable: true, statusBarStyle: 'black-translucent' },
};
export const viewport = { themeColor: '#ac0bd6' };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
