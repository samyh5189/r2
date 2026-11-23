import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Overpass } from "next/font/google";
import "./globals.css";

const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
// Highway-sign lettering for headings and the number-plate references.
const display = Overpass({ variable: "--font-display", subsets: ["latin"], weight: ["600", "800", "900"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "EasyRide Admin", template: "%s · EasyRide Admin" },
  description: "Fleet, bookings and revenue console",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
