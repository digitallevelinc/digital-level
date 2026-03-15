import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((_context, next) => {
  // Auth is handled client-side with sessionStorage so each tab can keep
  // an independent Sentinel session without cross-tab cookie collisions.
  return next();
});
