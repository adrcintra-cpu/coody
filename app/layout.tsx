import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'COODY — Workspace criativo',
  description:
    'Planejamento editorial, inteligência de marca, produção criativa e aprovação.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
  },
};
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
