import { Hono } from "hono";

export type MockOpenAiReply = {
  text?: string;
  delayMs?: number;
  status?: number;
  responseBody?: unknown;
  rawBody?: string;
};

export type MockOpenAiRequest = {
  method: string;
  path: string;
  headers: Headers;
  body: string;
};

export function mockOpenAi(
  options: {
    replies?: MockOpenAiReply[];
    models?: string[];
  } = {},
) {
  const app = new Hono();
  const replies = [...(options.replies ?? [])];
  const models = options.models ?? ["mock-model"];
  const requests: MockOpenAiRequest[] = [];

  app.all("*", async (context) => {
    const path = new URL(context.req.url).pathname;
    const body = context.req.method === "GET" ? "" : await context.req.text();
    requests.push({
      method: context.req.method,
      path,
      headers: new Headers(context.req.raw.headers),
      body,
    });

    if (context.req.method === "GET" && path.endsWith("/models")) {
      return jsonResponse({ data: models.map((id) => ({ id })) });
    }

    if (context.req.method === "POST" && path.endsWith("/chat/completions")) {
      const reply = replies.shift() ?? { text: "A valid reply." };
      if (reply.delayMs) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, reply.delayMs),
        );
      }
      if (reply.rawBody !== undefined) {
        return new Response(reply.rawBody, { status: reply.status ?? 200 });
      }
      if (reply.responseBody !== undefined) {
        return jsonResponse(reply.responseBody, reply.status ?? 200);
      }
      if (reply.status !== undefined && reply.status >= 400) {
        return jsonResponse({ error: "Scripted mock error" }, reply.status);
      }
      return jsonResponse(
        {
          choices: [{ message: { content: reply.text ?? "A valid reply." } }],
        },
        reply.status ?? 200,
      );
    }

    return jsonResponse({ error: "Not found" }, 404);
  });

  return { app, requests };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}
