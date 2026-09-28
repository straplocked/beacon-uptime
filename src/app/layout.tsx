import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
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

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Beacon - Uptime Monitoring & Status Pages",
  description:
    "Monitor your services, track uptime, and share beautiful status pages with your users.",
  appleWebApp: {
    capable: true,
    title: "Beacon",
    // "black-translucent" draws the app under the iOS status bar, which is
    // why the sidebar/mobile header pad themselves with
    // env(safe-area-inset-top) in standalone mode (see globals.css).
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

// Light/dark-aware browser-chrome color. Next renders each entry as its own
// `<meta name="theme-color" media="...">` tag, so Chrome/Android/iOS pick
// the one matching the OS-level color scheme rather than one static color.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0f151d" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var m=window.matchMedia('(prefers-color-scheme:dark)');if(m.matches)d.classList.add('dark');m.addEventListener('change',function(e){e.matches?d.classList.add('dark'):d.classList.remove('dark');})}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegister />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
