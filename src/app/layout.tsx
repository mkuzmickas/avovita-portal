import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart/CartContext";
import { AnalyticsProvider } from "@/lib/analytics/useAnalytics";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
const SITE_NAME = "AvoVita Wellness";
const TITLE = "AvoVita Wellness — Private Lab Testing Calgary";
const DESCRIPTION =
  "Private blood testing in Calgary. In-home specimen collection by FloLabs. Results delivered securely online.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: "%s | AvoVita Wellness",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "private lab testing Calgary",
    "in-home blood testing",
    "FloLabs phlebotomist",
    "private blood work Alberta",
    "Mayo Clinic Laboratories",
    "Armin Labs",
    "AvoVita Wellness",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: "AvoVita Wellness",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: APP_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  other: {
    "color-scheme": "dark",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0a1a0d" />
      </head>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ backgroundColor: "#0a1a0d", color: "#e8d5a3" }}
      >
        <CartProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </CartProvider>
      </body>
    </html>
  );
}
