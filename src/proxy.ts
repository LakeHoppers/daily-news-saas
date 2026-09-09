import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { NextResponse } from "next/server";
import { localeRedirect, localeFromPath } from "@/shared/locale";

const isProtectedRoute = createRouteMatcher([
  "/:locale/dashboard(.*)",
  "/:locale/admin(.*)",
  "/api/me(.*)",
  "/api/billing(.*)",
  "/api/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const redirect = localeRedirect(req.nextUrl);
  if (redirect) return NextResponse.redirect(redirect);
  if (isProtectedRoute(req)) {
    if (req.nextUrl.pathname.startsWith("/api/")) await auth.protect();
    else {
      const signIn = new URL(`/${localeFromPath(req.nextUrl.pathname)}/sign-in`, req.url);
      signIn.searchParams.set("redirect_url", req.url);
      await auth.protect({ unauthenticatedUrl: signIn.href });
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
