/**
 * Vision-import service — sends a base64 schedule screenshot to Anthropic
 * Claude (Vision) and parses the model's JSON response into a normalized
 * ParsedSchedule structure that the frontend can preview & the
 * import-apply route can persist.
 *
 * Uses native fetch (no SDK dep). The model is instructed via system
 * prompt + few-shot to return ONLY JSON. We additionally tolerate JSON
 * wrapped in markdown fences just in case.
 *
 * Rate-limiting NOTE: not implemented here. In production this endpoint
 * should be rate-limited (e.g. 10 req/min per user) — wire via fastify
 * plugin at the route layer when redis is available.
 */
import { env } from '../../env.js';
import { HttpError, ValidationFailedError } from '../../shared/errors.js';

export interface ParsedEmployee {
  fullName: string;
  phone?: string;
  role?: string;
}

export interface ParsedShift {
  /** Either 0..6 (Sun=0) or an ISO date "YYYY-MM-DD". */
  dayOfWeek: number | string;
  /** "HH:mm". */
  startTime: string;
  /** "HH:mm". May be next-day if endTime < startTime. */
  endTime: string;
  role?: string;
  employees?: string[];
}

export interface ParsedSchedule {
  employees: ParsedEmployee[];
  shifts: ParsedShift[];
  weekStart?: string;
  confidence: number;
  notes?: string;
}

export const VISION_SYSTEM_PROMPT = `You are a scheduling assistant for sidor4S, an Israeli SMB shift-management app.
The user uploads a photo or screenshot of an existing weekly employee schedule. The source can be:
- An Excel/Google-Sheets screenshot (rows = employees, columns = days)
- A WhatsApp group message with the schedule typed out
- A handwritten paper schedule

Most schedules are Hebrew (RTL). Days of week in Hebrew: ראשון=0, שני=1, שלישי=2, רביעי=3, חמישי=4, שישי=5, שבת=6.
Common Hebrew shift roles: מלצר (waiter), טבח (cook), קופאי (cashier), משמרת בוקר (morning), משמרת ערב (evening), סגירה (closing).

EXTRACT a JSON object with this EXACT structure (no extra keys, no markdown fences, no commentary):
{
  "employees": [{ "fullName": "string", "phone": "string optional", "role": "string optional" }],
  "shifts": [{
    "dayOfWeek": 0,
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "role": "string optional",
    "employees": ["fullName matching employees array"]
  }],
  "weekStart": "YYYY-MM-DD optional",
  "confidence": 0.0,
  "notes": "string optional, brief observations or ambiguities"
}

RULES:
- dayOfWeek: integer 0-6 (Sun=0) when the source shows weekday names; OR an ISO date "YYYY-MM-DD" when the source shows explicit calendar dates.
- Times in 24-hour "HH:mm". If only one time is shown ("בוקר"/"morning"), use 08:00-16:00; ("ערב"/"evening") 16:00-23:00; ("לילה"/"night") 23:00-07:00.
- Each employee appears ONCE in employees[] even if they have many shifts. shifts[].employees references by fullName.
- confidence in [0,1]: 0.9+ = clear typed schedule, 0.6-0.8 = readable but ambiguous, <0.5 = poor quality, return notes explaining what's unclear.
- If unsure about a name's spelling, keep it as-shown.
- Return ONLY the JSON object — no prose before or after.

EXAMPLE (Hebrew Excel screenshot of a 7-day week, RTL):
Input shows: rows ["דני כהן 050-1234567", "מיכל לוי", "אבי גרין"]; columns [ראשון, שני, שלישי...]; cells contain "9-17", "16-23", or blank.
Expected output:
{
  "employees": [
    { "fullName": "דני כהן", "phone": "0501234567", "role": "מלצר" },
    { "fullName": "מיכל לוי", "role": "מלצר" },
    { "fullName": "אבי גרין", "role": "טבח" }
  ],
  "shifts": [
    { "dayOfWeek": 0, "startTime": "09:00", "endTime": "17:00", "role": "מלצר", "employees": ["דני כהן"] },
    { "dayOfWeek": 0, "startTime": "16:00", "endTime": "23:00", "role": "מלצר", "employees": ["מיכל לוי"] },
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00", "role": "טבח", "employees": ["אבי גרין"] }
  ],
  "weekStart": "2025-01-19",
  "confidence": 0.88,
  "notes": "Clear typed schedule. Phone for מיכל לוי not visible."
}`;

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
interface AnthropicResponse {
  content?: Array<AnthropicTextBlock | { type: string; [k: string]: unknown }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

/** Pull the first text block from Claude's content array. */
function extractText(resp: AnthropicResponse): string {
  if (!Array.isArray(resp.content)) return '';
  for (const block of resp.content) {
    if (block && (block as AnthropicTextBlock).type === 'text') {
      return (block as AnthropicTextBlock).text;
    }
  }
  return '';
}

/** Strip ```json fences if Claude added them despite instructions. */
function stripFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }
  return trimmed;
}

/** Best-effort: find the outermost JSON object inside a noisy string. */
function isolateJsonObject(s: string): string {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return s;
  return s.slice(start, end + 1);
}

function coerceParsed(raw: unknown): ParsedSchedule {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationFailedError(
      'VISION_PARSE_FAILED',
      'Claude response was not a JSON object',
    );
  }
  const r = raw as Record<string, unknown>;
  const employees = Array.isArray(r['employees']) ? r['employees'] : [];
  const shifts = Array.isArray(r['shifts']) ? r['shifts'] : [];
  return {
    employees: employees
      .filter((e) => e && typeof e === 'object')
      .map((e) => {
        const o = e as Record<string, unknown>;
        return {
          fullName: String(o['fullName'] ?? '').trim(),
          phone: typeof o['phone'] === 'string' ? o['phone'] : undefined,
          role: typeof o['role'] === 'string' ? o['role'] : undefined,
        };
      })
      .filter((e) => e.fullName.length > 0),
    shifts: shifts
      .filter((s) => s && typeof s === 'object')
      .map((s) => {
        const o = s as Record<string, unknown>;
        const day = o['dayOfWeek'];
        return {
          dayOfWeek:
            typeof day === 'number'
              ? day
              : typeof day === 'string'
                ? day
                : 0,
          startTime: String(o['startTime'] ?? '00:00'),
          endTime: String(o['endTime'] ?? '00:00'),
          role: typeof o['role'] === 'string' ? o['role'] : undefined,
          employees: Array.isArray(o['employees'])
            ? (o['employees'] as unknown[]).filter(
                (x): x is string => typeof x === 'string',
              )
            : undefined,
        };
      }),
    weekStart:
      typeof r['weekStart'] === 'string' ? (r['weekStart'] as string) : undefined,
    confidence:
      typeof r['confidence'] === 'number' ? (r['confidence'] as number) : 0.5,
    notes: typeof r['notes'] === 'string' ? (r['notes'] as string) : undefined,
  };
}

export interface ParseImageOptions {
  /** base64-encoded (no data: prefix) image bytes. */
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  hints?: string;
}

export async function parseScheduleImage(
  opts: ParseImageOptions,
): Promise<ParsedSchedule> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(
      503,
      'VISION_NOT_CONFIGURED',
      'Vision import not configured: ANTHROPIC_API_KEY is missing',
    );
  }

  const userText = opts.hints
    ? `Please extract the schedule. Hints from the user: ${opts.hints}`
    : 'Please extract the schedule.';

  const body = {
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: VISION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: opts.mimeType,
              data: opts.imageBase64,
            },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new HttpError(
      502,
      'VISION_UPSTREAM_UNREACHABLE',
      `Anthropic API unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new HttpError(
      502,
      'VISION_UPSTREAM_ERROR',
      `Anthropic API ${res.status}: ${errBody.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as AnthropicResponse;
  const text = extractText(json);
  if (!text) {
    throw new ValidationFailedError(
      'VISION_EMPTY_RESPONSE',
      'Claude returned no text content',
    );
  }

  // Log concise summary (length + token usage), not the full body.
  if (env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(
      `[vision-import] textLen=${text.length} usage=${JSON.stringify(json.usage ?? {})}`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(isolateJsonObject(stripFences(text))) as unknown;
  } catch (err) {
    throw new ValidationFailedError(
      'VISION_PARSE_FAILED',
      `Claude response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { sample: text.slice(0, 200) },
    );
  }

  return coerceParsed(parsedJson);
}
