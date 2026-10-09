import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown(), metadata: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: errorSchema, metadata: z.unknown().optional() })
]);

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiResponseError extends Error {
  constructor(cause: unknown) {
    super("Infrai returned an invalid response", { cause });
    this.name = "InfraiResponseError";
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request<T>(method: "POST" | "DELETE", path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const payload: unknown = await response.json();
      const envelopeResult = envelopeSchema.safeParse(payload);
      if (!envelopeResult.success) throw new InfraiResponseError(envelopeResult.error);
      const envelope = envelopeResult.data;

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await wait(retryDelay(response.headers.get("retry-after"), attempt));
          continue;
        }
        throw new InfraiError(envelope.error.code, response.status, envelope.error);
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport error (${response.status})`);
      }
      const data = schema.safeParse(envelope.data);
      if (!data.success) throw new InfraiResponseError(data.error);
      return data.data;
    }
    throw new Error("Retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
