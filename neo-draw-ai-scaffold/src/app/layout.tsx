import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEO DrawAI — Neo Culture Tech",
  description:
    "Draw with your mouse, your finger, or a pinch of your hand in front of the webcam — and race the clock while an AI tries to guess your doodle. Built by Neo Culture Tech.",
  applicationName: "NEO DrawAI",
  icons: { icon: "/nct-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0B1120",
  // The canvas handles its own gestures; page-level pinch-zoom would fight it.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="nct-grid flex min-h-full flex-col">{children}</body>
    </html>
  );
}
