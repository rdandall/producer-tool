export class ValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ValidationError("Invalid JSON body", 400);
  }
}

export function requireString(
  value: unknown,
  field: string,
  options: { required?: boolean; trim?: boolean; minLength?: number; maxLength?: number } = {}
): string | null {
  const trimmed = (options.trim ?? true) ? (typeof value === "string" ? value.trim() : value) : value;

  if (trimmed === undefined || trimmed === null || trimmed === "") {
    if (options.required !== false) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
    return null;
  }

  if (typeof trimmed !== "string") {
    throw new ValidationError(`Field '${field}' must be a string`);
  }

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new ValidationError(`Field '${field}' is too short`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new ValidationError(`Field '${field}' is too long`);
  }

  return trimmed;
}

export function requireEmailList(value: unknown, field: string, options: { required?: boolean; maxItems?: number } = {}): string[] {
  if (value === undefined || value === null || value === "") {
    if (options.required !== false) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`Field '${field}' must be an array of emails`);
  }

  const emails = value.map((entry) => {
    if (typeof entry !== "string") {
      throw new ValidationError(`Invalid entry in '${field}'`);
    }
    const normalized = entry.trim();
    if (!normalized.includes("@") || normalized.includes(" ")) {
      throw new ValidationError(`Invalid email in '${field}': ${normalized}`);
    }
    return normalized;
  });

  if (options.maxItems !== undefined && emails.length > options.maxItems) {
    throw new ValidationError(`Too many emails in '${field}'`);
  }

  return emails;
}

export function optionalDateIso(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ValidationError(`Field '${field}' must be a date string`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`Field '${field}' must be a valid ISO date/time`);
  }
  return value;
}
