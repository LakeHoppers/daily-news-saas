import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

import { SITE_COPY } from "@/shared/site-copy";
import type { Locale } from "@/shared/locale";
import { LocaleSwitch } from "./locale-switch";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const copy = SITE_COPY[locale];
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <span className="font-heading flex size-7 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
            N
          </span>
          <span className="font-heading text-lg font-medium tracking-tight">
            News Daily
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitch locale={locale} />
          <ThemeToggle label={copy.theme} />
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm font-medium">{copy.signIn}</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background">
                {copy.signUp}
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href={`/${locale}/dashboard`} className="text-sm font-medium">
              {copy.account}
            </Link>
            <UserButton customMenuItems={[{ label: copy.account, href: `/${locale}/dashboard` }]} />
          </Show>
        </div>
      </div>
    </header>
  );
}
