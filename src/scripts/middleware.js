import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  const { url, cookies, redirect } = context;

  // Si el usuario intenta entrar a cualquier ruta de dashboard
  if (url.pathname.startsWith("/dashboard")) {
    const session = cookies.get("session_token");
    
    // Si no hay sesión activa, lo mandamos al login
    if (!session) {
      return redirect("/login");
    }
  }

  return next();
});