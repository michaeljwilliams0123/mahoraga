type Schema = Record<string, unknown>;
const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const COMMON = ["type", "enum", "$schema", "title", "description"];

/** Bounded JSON Schema subset. Unsupported constraints are rejected, never ignored. */
export function validateStructuredSchema(value: unknown): asserts value is Schema {
  let nodes = 0;
  const visit = (raw: unknown, depth: number): void => {
    if (!object(raw) || depth > 12 || ++nodes > 1024) fail("structured-schema-invalid");
    const type = raw.type;
    if (typeof type !== "string" || !TYPES.has(type)) fail("structured-schema-invalid");
    const extra = type === "object" ? ["properties", "required", "additionalProperties", "minProperties", "maxProperties"]
      : type === "array" ? ["items", "minItems", "maxItems"]
        : type === "string" ? ["minLength", "maxLength"]
          : type === "number" || type === "integer" ? ["minimum", "maximum"] : [];
    if (Object.keys(raw).some(key => ![...COMMON, ...extra].includes(key))) fail("structured-schema-unsupported");
    for (const key of ["title", "description", "$schema"]) if (raw[key] !== undefined && typeof raw[key] !== "string") fail("structured-schema-invalid");
    if (raw.enum !== undefined && (!Array.isArray(raw.enum) || !raw.enum.length || raw.enum.length > 256 || raw.enum.some(item => item !== null && !["string", "number", "boolean"].includes(typeof item)))) fail("structured-schema-invalid");
    for (const [lower, upper] of [["minLength", "maxLength"], ["minItems", "maxItems"], ["minProperties", "maxProperties"], ["minimum", "maximum"]]) {
      const lo = raw[lower!], hi = raw[upper!];
      for (const limit of [lo, hi]) if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || (lower !== "minimum" && (!Number.isSafeInteger(limit) || limit < 0)))) fail("structured-schema-invalid");
      if (typeof lo === "number" && typeof hi === "number" && lo > hi) fail("structured-schema-invalid");
    }
    if (type === "object") {
      if (raw.properties !== undefined && !object(raw.properties)) fail("structured-schema-invalid");
      const properties = (raw.properties ?? {}) as Schema;
      if (Object.keys(properties).some(key => ["__proto__", "prototype", "constructor"].includes(key))) fail("structured-schema-invalid");
      if (raw.additionalProperties !== undefined && typeof raw.additionalProperties !== "boolean") fail("structured-schema-unsupported");
      if (raw.required !== undefined && (!Array.isArray(raw.required) || new Set(raw.required).size !== raw.required.length || raw.required.some(key => typeof key !== "string" || !Object.hasOwn(properties, key)))) fail("structured-schema-invalid");
      Object.values(properties).forEach(child => visit(child, depth + 1));
    }
    if (type === "array") visit(raw.items, depth + 1);
  };
  visit(value, 0);
}

export function validateStructuredOutput(value: unknown, rawSchema: unknown): unknown {
  validateStructuredSchema(rawSchema);
  assertJsonSize(value);
  const match = (schema: Schema, item: unknown, depth: number): void => {
    if (depth > 64) fail("structured-output-mismatch");
    if (schema.enum !== undefined && !(schema.enum as unknown[]).some(option => Object.is(option, item))) fail("structured-output-mismatch");
    const within = (number: number, lower: string, upper: string) =>
      (schema[lower] === undefined || number >= (schema[lower] as number)) && (schema[upper] === undefined || number <= (schema[upper] as number));
    switch (schema.type) {
      case "object": {
        if (!object(item)) fail("structured-output-mismatch");
        const keys = Object.keys(item), properties = (schema.properties ?? {}) as Schema;
        if (!within(keys.length, "minProperties", "maxProperties") || (schema.required as string[] | undefined)?.some(key => !Object.hasOwn(item, key))) fail("structured-output-mismatch");
        for (const key of keys) {
          if (["__proto__", "prototype", "constructor"].includes(key)) fail("structured-output-mismatch");
          if (Object.hasOwn(properties, key)) match(properties[key] as Schema, item[key], depth + 1);
          else if (schema.additionalProperties === false) fail("structured-output-mismatch");
        }
        break;
      }
      case "array":
        if (!Array.isArray(item) || !within(item.length, "minItems", "maxItems")) fail("structured-output-mismatch");
        item.forEach(child => match(schema.items as Schema, child, depth + 1)); break;
      case "string":
        if (typeof item !== "string" || !within([...item].length, "minLength", "maxLength")) fail("structured-output-mismatch"); break;
      case "number": case "integer":
        if (typeof item !== "number" || !Number.isFinite(item) || (schema.type === "integer" && !Number.isSafeInteger(item)) || !within(item, "minimum", "maximum")) fail("structured-output-mismatch"); break;
      case "boolean": if (typeof item !== "boolean") fail("structured-output-mismatch"); break;
      case "null": if (item !== null) fail("structured-output-mismatch"); break;
    }
  };
  match(rawSchema, value, 0);
  return structuredClone(value);
}

export function parseStructuredOutput(text: string, schema: unknown): unknown {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 65_536) fail("structured-output-too-large");
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail("structured-output-json-invalid"); }
  return validateStructuredOutput(value, schema);
}

function assertJsonSize(value: unknown): void {
  let count = 0;
  const seen = new Set<object>();
  const walk = (item: unknown, depth: number): void => {
    if (++count > 16_384 || depth > 64) fail("structured-output-too-large");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || seen.has(item!)) fail("structured-output-mismatch");
    if (!Array.isArray(item) && !object(item)) fail("structured-output-mismatch");
    seen.add(item!);
    Object.values(item!).forEach(child => walk(child, depth + 1));
    seen.delete(item!);
  };
  walk(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 65_536) fail("structured-output-too-large");
}
function object(value: unknown): value is Schema { return value !== null && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function fail(code: string): never { throw new TypeError(code); }
