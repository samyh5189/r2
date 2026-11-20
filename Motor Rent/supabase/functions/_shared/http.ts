export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Wraps a handler with CORS, method check and uniform error responses. Never leaks stack traces. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: { code: err.code, message: err.message } }, err.status);
      console.error(err);
      return json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, 500);
    }
  };
}
