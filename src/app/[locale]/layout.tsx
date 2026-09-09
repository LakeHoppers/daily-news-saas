import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "../globals.css";
import { enUS, trTR } from "@clerk/localizations";
import { notFound } from "next/navigation";
import { SITE_COPY } from "@/shared/site-copy";
import { isLocale } from "@/shared/locale";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { title: "News Daily", description: SITE_COPY[locale].description };
}

export default async function RootLayout({
  children, params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          localization={locale === "en" ? enUS : trTR}
          signInUrl={`/${locale}/sign-in`}
          signUpUrl={`/${locale}/sign-up`}
          signInFallbackRedirectUrl={`/${locale}/dashboard`}
          signUpFallbackRedirectUrl={`/${locale}/dashboard`}
          afterSignOutUrl={`/${locale}`}
          appearance={{
            variables: {
              colorPrimary: "#1c1917",
              colorForeground: "#1c1917",
              colorBackground: "#fefdfb",
              fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
              borderRadius: "0.5rem",
            },
          }}
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SiteHeader locale={locale} />
            {children}
            <SiteFooter locale={locale} />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
