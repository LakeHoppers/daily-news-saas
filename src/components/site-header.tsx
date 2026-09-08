import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

export async function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-heading flex size-7 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
            N
          </span>
          <span className="font-heading text-lg font-medium tracking-tight">
            News Daily
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm font-medium">Giriş yap</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background">
                Kayıt ol
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="text-sm font-medium">
              Hesabım
            </Link>
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
