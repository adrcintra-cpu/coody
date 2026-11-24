import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
export const metadata: Metadata = {
  title: 'OxyStudio · Oxyhub',
  description:
    'Planejamento editorial, inteligência de marca, produção criativa e aprovação.',
  // App icon: browser tab, home screen (iOS/Android) and installed app.
  icons: {
    // Browser tab: the official SVG symbol (ICO/PNG for older browsers).
    // Home screen and installed app keep the purple tile (192/512/apple).
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
  appleWebApp: { title: 'OxyStudio', capable: true, statusBarStyle: 'black-translucent' },
};
export const viewport = { themeColor: '#ac0bd6' };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Script src="/oxyhub-embed.js" strategy="afterInteractive" />
        <Script src="/liquid-lens.js" strategy="afterInteractive" data-selector=".glass, .attention, .panel, .brand-assist, .kanban-column, .brand-card, .asset-card, .integration-card, .art-workspace, .metrics, .week-meter, .calendar-scroll, .library-folders > button, .profile-upload, .coody-dialog, .notification-popover, [data-slot='dialog-content'], [data-slot='popover-content'], [data-slot='dropdown-menu-content'], [data-slot='select-content'], [data-slot='alert-dialog-content'], [data-slot='sheet-content'], .outline-btn, [data-slot='button'][data-variant='outline'], [data-slot='button'][data-variant='secondary'], [data-slot='select-trigger'], .create-btn, [data-slot='button'][data-variant='default'], .profile-upload-button" />
      </body>
    </html>
  );
}
