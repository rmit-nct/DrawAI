import type { Metadata } from "next";
import "./globals.css";
import { Geist, Baloo_2 } from "next/font/google";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const baloo = Baloo_2({ subsets: ["latin"], variable: "--font-heading", weight: ["600", "700", "800"] });
const coarse = localFont({ src: "../fonts/Coarserounded-8LYZ.otf", variable: "--font-topic" });

export const metadata: Metadata = {
  title: "NEO DrawAI",
  description: "Real-time collaborative drawing with webcam gestures and AI guessing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", "font-sans", geist.variable, baloo.variable, coarse.variable)}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
