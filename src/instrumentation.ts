// Server error reporting. Next.js calls onRequestError for every error thrown
// while rendering a page or handling a route, including ones the user only
// sees as "Something went wrong". Each is written to the server log as one
// JSON line (searchable in Vercel → Logs by the digest shown on the error
// page), so failures are no longer invisible.
//
// To forward these to an error tracker later, add its capture call here.
export function register() {
  // Nothing to initialise yet.
}

type RequestInfo = { path: string; method: string };
type ErrorContext = { routerKind: string; routePath: string; routeType: string };

export function onRequestError(error: unknown, request: RequestInfo, context: ErrorContext) {
  const err = error as { message?: string; digest?: string; stack?: string };
  console.error(
    JSON.stringify({
      level: "error",
      source: "request",
      message: err?.message ?? String(error),
      digest: err?.digest,
      method: request.method,
      // The route pattern, not the raw path: a path can contain a secret token.
      route: context.routePath,
      routeType: context.routeType,
      stack: err?.stack?.split("\n").slice(0, 6).join("\n"),
    })
  );
}
