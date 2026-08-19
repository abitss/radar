import './globals.css';

export const metadata = {
  title: 'RADAR | AI Competitive Intelligence',
  description: 'Always-on competitive and market intelligence for startup founders.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
