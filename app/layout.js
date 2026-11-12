import './globals.css';
import { Poppins } from 'next/font/google';
import Header from '@/components/Header';
import { Analytics } from '@vercel/analytics/next'; // 1. Added Import

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata = {
  title: 'Manhua Reader',
  description: 'Read popular manhua online in a clean, distraction-free reader.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

// Runs before paint: avoids a light/dark flash. Saved choice wins, otherwise system preference.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={poppins.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-white font-sans text-black antialiased dark:bg-black dark:text-white">
        <Header />
        {children}
        <Analytics /> {/* 2. Added Component */}
      </body>
    </html>
  );
}
