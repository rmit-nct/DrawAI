import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEO DrawAI",
  description: "Real-time collaborative drawing with webcam gestures and AI guessing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
