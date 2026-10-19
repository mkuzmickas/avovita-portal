import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart/CartContext";
import { AnalyticsProvider } from "@/lib/analytics/useAnalytics";
import { PreviewAvailabilityFab } from "@/components/PreviewAvailabilityFab";
import { RepeatClientProvider } from "@/components/account/RepeatClientContext";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
const SITE_NAME = "AvoVita";
const TITLE = "AvoVita — Private Lab Testing Calgary";
const DESCRIPTION =
  "Private blood testing in Calgary. In-home specimen collection, results delivered securely online.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: "%s | AvoVita",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "private lab testing Calgary",
    "in-home blood testing",
    "private blood work Alberta",
    "Mayo Clinic Laboratories",
    "Armin Labs",
    "AvoVita",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
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
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#F7F5F0" />
      </head>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ backgroundColor: "#F7F5F0", color: "#2C2C2C" }}
      >
        <RepeatClientProvider>
          {/* AnalyticsProvider outside CartProvider so CartContext
              can call useAnalytics() when firing test_added_to_cart
              from the single source of truth (commitAdd). Fixes the
              funnel-counting bug where the event fired from only one
              of ~5 cart-add call sites, undercounting adds and
              making checkout-started appear to exceed cart-adds. */}
          <AnalyticsProvider>
            <CartProvider>
              {children}
              <PreviewAvailabilityFab />
            </CartProvider>
          </AnalyticsProvider>
        </RepeatClientProvider>
      </body>
    </html>
  );
}
