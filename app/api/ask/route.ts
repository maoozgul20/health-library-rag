// The only server code in the site. It holds your API key, builds the augmented prompt
// from the passages the browser retrieved, and streams the model's answer back as text.
//
// It talks to any OpenAI-compatible chat API. The default is Groq (free tier, no
// Hugging Face). To use another provider, change LLM_BASE_URL and LLM_MODEL:
//   Groq        https://api.groq.com/openai/v1                              openai/gpt-oss-120b
//   DeepSeek    https://api.deepseek.com                                    deepseek-chat
//   OpenRouter  https://openrouter.ai/api/v1                                (model id from openrouter.ai)
//   Gemini      https://generativelanguage.googleapis.com/v1beta/openai     (gemini model id)
//   Ollama      http://localhost:11434/v1  (your own computer only)         llama3.2 or any pulled model

import { buildPrompt } from "@/lib/search";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

function config() {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || "";
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
  let provider = "your AI provider";
  if (baseUrl.includes("groq.com")) provider = "Groq";
  else if (baseUrl.includes("deepseek.com")) provider = "DeepSeek";
  else if (baseUrl.includes("openrouter.ai")) provider = "OpenRouter";
  else if (baseUrl.includes("googleapis.com")) provider = "Google Gemini";
  else if (isLocal) provider = "Ollama";
  return { baseUrl, apiKey, model, isLocal, provider, configured: Boolean(apiKey) || isLocal };
}

export async function GET() {
  const c = config();
  return Response.json({ configured: c.configured, model: c.model, provider: c.provider });
}

type Body = {
  question?: unknown;
  passages?: unknown;
  withNotes?: unknown;
};

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const c = config();
  if (!c.configured) {
    return bad("Answers are turned off: the LLM_API_KEY environment variable is not set on the server.", 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("The request body must be JSON.");
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return bad("Type a question first.");
  if (question.length > 1000) return bad("Questions can be up to 1,000 characters.");

  const withNotes = body.withNotes !== false;
  let userContent = question;
  if (withNotes) {
    const raw = Array.isArray(body.passages) ? body.passages : [];
    const passages = raw
      .slice(0, 12)
      .filter((p): p is { source: string; text: string } => typeof p?.source === "string" && typeof p?.text === "string")
      .map((p) => ({ source: p.source.slice(0, 200), text: p.text.slice(0, 2000) }));
    userContent = buildPrompt(question, passages);
  }

  const payload: Record<string, unknown> = {
    model: c.model,
    messages: [
      { role: "system", content: withNotes ? SITE.systemPromptWithNotes : SITE.systemPromptWithoutNotes },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 1200,
    stream: true,
  };
  // gpt-oss models think before answering; keep that short so answers arrive fast.
  if (c.model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";

  let upstream: Response;
  try {
    upstream = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return bad(
      c.isLocal
        ? "Could not reach Ollama. Make sure it is running on this computer."
        : `Could not reach ${c.provider}. Check your internet connection and try again.`,
      502,
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    let message = `${c.provider} returned HTTP ${upstream.status}.`;
    if (upstream.status === 401 || upstream.status === 403)
      message = `${c.provider} rejected the API key. Check LLM_API_KEY.`;
    else if (upstream.status === 402) message = `Your ${c.provider} account has no credit left.`;
    else if (upstream.status === 404 || (upstream.status === 400 && /model/i.test(detail)))
      message = `The model "${c.model}" is not available on ${c.provider}. Set LLM_MODEL to one of its model ids.`;
    else if (upstream.status === 429)
      message = `${c.provider}'s free limit was reached. Wait a minute and ask again (daily limits reset after 24 hours).`;
    console.error("[ask] upstream error", upstream.status, detail.slice(0, 500));
    return bad(message, 502);
  }

  // Turn the OpenAI-style SSE stream into a plain text stream of answer tokens.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              // only the answer text; any separate "reasoning" field is ignored
              const piece = json.choices?.[0]?.delta?.content;
              if (piece) controller.enqueue(encoder.encode(piece));
            } catch {
              // ignore keep-alive or partial lines
            }
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[The answer was cut off. Ask again.]"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Model": c.model },
  });
}
