import { validateToken } from "./auth";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

const PUBLIC_PATHS = new Set(["/health", "/auth/pair", "/auth/verify"]);

export function extractToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function requireAuth(req: Request, pathname: string): Response | null {
  if (PUBLIC_PATHS.has(pathname)) return null;
  const token = extractToken(req);
  if (!token || !validateToken(token)) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

export async function parseJSON<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export type RouteHandler = (req: Request, params: Record<string, string>) => Promise<Response> | Response;

export interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export function createRouter() {
  const routes: Route[] = [];

  function addRoute(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    routes.push({ method, pattern: new RegExp(`^${pattern}$`), paramNames, handler });
  }

  return {
    get: (path: string, handler: RouteHandler) => addRoute("GET", path, handler),
    post: (path: string, handler: RouteHandler) => addRoute("POST", path, handler),
    put: (path: string, handler: RouteHandler) => addRoute("PUT", path, handler),
    patch: (path: string, handler: RouteHandler) => addRoute("PATCH", path, handler),
    delete: (path: string, handler: RouteHandler) => addRoute("DELETE", path, handler),

    match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = pathname.match(route.pattern);
        if (m) {
          const params: Record<string, string> = {};
          route.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
          return { handler: route.handler, params };
        }
      }
      return null;
    },
  };
}
