import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Roboto_Slab } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const robotoSlab = Roboto_Slab({
  variable: "--font-roboto-slab",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Beacon - Uptime Monitoring & Status Pages",
  description:
    "Monitor your services, track uptime, and share beautiful status pages with your users.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${robotoSlab.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var m=window.matchMedia('(prefers-color-scheme:dark)');if(m.matches)d.classList.add('dark');m.addEventListener('change',function(e){e.matches?d.classList.add('dark'):d.classList.remove('dark');})}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">

        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
