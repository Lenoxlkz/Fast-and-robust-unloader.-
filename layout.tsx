import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { I18nProvider } from '@/components/I18nProvider';

export const metadata: Metadata = {
  title: 'Liquid Fast Download',
  description: 'Anti-detect web crawler & scraper avoiding CloudFlare and CORS.',
  openGraph: {
    title: 'Liquid Fast Download',
    description: 'Anti-detect web crawler & scraper avoiding CloudFlare and CORS.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liquid Fast Download',
    description: 'Anti-detect web crawler & scraper avoiding CloudFlare and CORS.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
