import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/not-authorized",
]);

// Routes that handle their own auth (e.g., support Bearer token from extension)
const isSelfAuthRoute = createRouteMatcher([
  "/api/translate",
]);

export default clerkMiddleware(async (auth, request) => {
  // Skip middleware auth for public routes and self-auth routes
  // Self-auth routes handle their own authentication (e.g., Bearer token from extension)
  if (!isPublicRoute(request) && !isSelfAuthRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
