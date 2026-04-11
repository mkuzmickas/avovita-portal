import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AvoVita Patient Portal",
  description: "Secure access to your private lab results — AvoVita Wellness, Calgary",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca"),
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
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ backgroundColor: "#0a1a0d", color: "#e8d5a3" }}
      >
        {children}
      </body>
    </html>
  );
}
