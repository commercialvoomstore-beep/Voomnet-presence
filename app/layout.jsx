import './globals.css';
import './cc.css';

export const metadata = {
  title: 'VOOMNET Presence 2026',
  description:
    'Plateforme de supervision et de gestion des présences VOOMNET TECHNOLOGY — prototype white enterprise.',
  icons: { icon: '/voomnet-mark.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
