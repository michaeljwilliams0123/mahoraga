export function createMcpHostManager({ declarations, transports } = {}) {
  if (!Array.isArray(declarations) || declarations.length > 32 || !transports || typeof transports !== "object") fail("mcp-host-input-invalid");
  const providers = new Map(declarations.map((value) => { const declaration = validateDeclaration(value); return [declaration.id, declaration]; }));
  if (providers.size !== declarations.length) fail("mcp-provider-duplicate");
  const tools = new Map();

  return Object.freeze({
    async refresh(...args) {
      if (args.length !== 0) fail("caller-transport-forbidden");
      tools.clear();
      for (const provider of providers.values()) {
        if (!provider.enabled) continue;
        const transport = transports[provider.transportKind];
        if (!transport || typeof transport.discover !== "function" || typeof transport.invoke !== "function") fail("mcp-transport-unavailable");
        const discovered = await withTimeout(transport.discover(providerProjection(provider)), provider.timeoutMs, "mcp-discovery-timeout");
        if (!Array.isArray(discovered) || discovered.length > 256) fail("mcp-discovery-invalid");
        for (const item of discovered) {
          if (!item || typeof item !== "object" || !provider.toolAllowlist.includes(item.id)) continue;
          const schemaValid = validObjectSchema(item.inputSchema);
          const capabilityId = `${provider.id}.${item.id}`;
          tools.set(capabilityId, { provider, transport, toolId: item.id, capabilityId, inputSchema: schemaValid ? structuredClone(item.inputSchema) : null, schemaValid, routable: schemaValid, reasonCode: schemaValid ? null : "schema-invalid" });
        }
      }
      return this.listTools();
    },

    listTools() {
      return [...tools.values()].map(publicTool).sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
    },

    async invoke(capabilityId, input, context) {
      const tool = tools.get(capabilityId);
      if (!tool?.routable) fail("mcp-tool-unavailable");
      validateInvocation(tool, input, context);
      const result = await withTimeout(tool.transport.invoke(providerProjection(tool.provider), tool.toolId, structuredClone(input)), tool.provider.timeoutMs, "mcp-invocation-timeout");
      if (Buffer.byteLength(JSON.stringify(result), "utf8") > tool.provider.maximumResponseBytes) fail("mcp-response-too-large");
      return deepFreeze(structuredClone(result));
    },
  });
}

function validateDeclaration(value) {
  const keys = new Set(["id", "enabled", "transportKind", "executableIdentity", "toolAllowlist", "resourceAllowlist", "dataClasses", "permissionClass", "spendingClass", "credentialReference", "readinessProbe", "canary", "maximumRequestBytes", "maximumResponseBytes", "timeoutMs"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail("mcp-provider-fields-invalid");
  slug(value.id, "mcp-provider-id-invalid"); if (typeof value.enabled !== "boolean" || value.transportKind !== "local-process") fail("mcp-provider-transport-invalid");
  token(value.executableIdentity, "mcp-executable-identity-invalid");
  list(value.toolAllowlist, 64, token, "mcp-tool-allowlist-invalid"); list(value.resourceAllowlist, 64, token, "mcp-resource-allowlist-invalid");
  list(value.dataClasses, 4, (item) => { if (!new Set(["synthetic", "personal", "enterprise", "local-only"]).has(item)) fail("mcp-data-classes-invalid"); }, "mcp-data-classes-invalid");
  slug(value.permissionClass, "mcp-permission-invalid"); slug(value.spendingClass, "mcp-spending-invalid");
  if (typeof value.credentialReference !== "string" || !/^(?:env|os-keychain|secret-store):[A-Z][A-Z0-9_]{2,63}$/.test(value.credentialReference)) fail("mcp-credential-reference-invalid");
  if (!value.toolAllowlist.includes(value.readinessProbe) || !value.toolAllowlist.includes(value.canary)) fail("mcp-probe-invalid");
  integer(value.maximumRequestBytes, 256, 1_048_576, "mcp-request-limit-invalid"); integer(value.maximumResponseBytes, 256, 4_194_304, "mcp-response-limit-invalid"); integer(value.timeoutMs, 100, 300_000, "mcp-timeout-invalid");
  return deepFreeze(structuredClone(value));
}
function validateInvocation(tool, input, context) {
  const provider = tool.provider;
  if (!input || typeof input !== "object" || Array.isArray(input) || serializedBytes(input) > provider.maximumRequestBytes) fail("mcp-request-invalid");
  const keys = Object.keys(context ?? {}).sort().join(",");
  if (keys !== "dataClass,permissionClass,spendingClass" || !provider.dataClasses.includes(context.dataClass) || context.permissionClass !== provider.permissionClass || context.spendingClass !== provider.spendingClass) fail("mcp-invocation-boundary-invalid");
  if (!matchesSchema(tool.inputSchema, input)) fail("mcp-input-schema-invalid");
}
function validObjectSchema(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 8) return false;
  const keys = new Set(["type", "properties", "required", "additionalProperties", "minProperties", "maxProperties"]);
  if (Object.keys(value).some((key) => !keys.has(key)) || value.type !== "object" || !value.properties || typeof value.properties !== "object" || Array.isArray(value.properties) || value.additionalProperties !== false) return false;
  if (value.required !== undefined && (!Array.isArray(value.required) || new Set(value.required).size !== value.required.length || value.required.some((key) => !Object.hasOwn(value.properties, key)))) return false;
  if (!optionalInteger(value.minProperties, 0) || !optionalInteger(value.maxProperties, 0) || (value.minProperties !== undefined && value.maxProperties !== undefined && value.minProperties > value.maxProperties)) return false;
  return Object.values(value.properties).every((property) => validPropertySchema(property, depth + 1));
}
function validPropertySchema(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 8 || !new Set(["string", "number", "integer", "boolean", "object", "array"]).has(value.type)) return false;
  const common = ["type", "enum"];
  const allowed = value.type === "string" ? [...common, "pattern", "minLength", "maxLength"]
    : new Set(["number", "integer"]).has(value.type) ? [...common, "minimum", "maximum"]
      : value.type === "array" ? [...common, "items", "minItems", "maxItems"]
        : value.type === "object" ? ["type", "properties", "required", "additionalProperties", "minProperties", "maxProperties"] : common;
  if (Object.keys(value).some((key) => !allowed.includes(key))) return false;
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.length < 1 || value.enum.length > 100 || new Set(value.enum.map((item) => JSON.stringify(item))).size !== value.enum.length)) return false;
  if (value.type === "string") {
    if (!optionalInteger(value.minLength, 0) || !optionalInteger(value.maxLength, 0) || (value.minLength !== undefined && value.maxLength !== undefined && value.minLength > value.maxLength)) return false;
    if (value.pattern !== undefined) { if (typeof value.pattern !== "string" || value.pattern.length > 256) return false; try { new RegExp(value.pattern, "u"); } catch { return false; } }
  }
  if (new Set(["number", "integer"]).has(value.type) && (![value.minimum, value.maximum].every((item) => item === undefined || (typeof item === "number" && Number.isFinite(item))) || (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum))) return false;
  if (value.type === "array" && (!validPropertySchema(value.items, depth + 1) || !optionalInteger(value.minItems, 0) || !optionalInteger(value.maxItems, 0) || (value.minItems !== undefined && value.maxItems !== undefined && value.minItems > value.maxItems))) return false;
  if (value.type === "object" && !validObjectSchema(value, depth)) return false;
  return true;
}
function matchesSchema(schema, value) {
  if (!validObjectSchema(schema) || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value); const properties = schema.properties;
  if (schema.additionalProperties === false && keys.some((key) => !Object.hasOwn(properties, key))) return false;
  if ((schema.required ?? []).some((key) => !Object.hasOwn(value, key))) return false;
  return keys.every((key) => matchesProperty(properties[key], value[key]));
}
function matchesProperty(schema, value) {
  if (!validPropertySchema(schema)) return false;
  if (schema.enum !== undefined && !schema.enum.some((item) => Object.is(item, value))) return false;
  if (schema.type === "string") return typeof value === "string" && (schema.minLength === undefined || value.length >= schema.minLength) && (schema.maxLength === undefined || value.length <= schema.maxLength) && (schema.pattern === undefined || new RegExp(schema.pattern, "u").test(value));
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value) && boundedNumber(schema, value);
  if (schema.type === "integer") return Number.isSafeInteger(value) && boundedNumber(schema, value);
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array") return Array.isArray(value) && (schema.minItems === undefined || value.length >= schema.minItems) && (schema.maxItems === undefined || value.length <= schema.maxItems) && value.every((item) => matchesProperty(schema.items, item));
  return matchesSchema(schema, value) && (schema.minProperties === undefined || Object.keys(value).length >= schema.minProperties) && (schema.maxProperties === undefined || Object.keys(value).length <= schema.maxProperties);
}
function boundedNumber(schema, value) { return (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum); }
function optionalInteger(value, minimum) { return value === undefined || (Number.isSafeInteger(value) && value >= minimum); }
function serializedBytes(value) { try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return Number.POSITIVE_INFINITY; } }
function providerProjection(value) { return Object.freeze({ id: value.id, transportKind: value.transportKind, executableIdentity: value.executableIdentity, credentialReference: value.credentialReference, resourceAllowlist: value.resourceAllowlist, maximumRequestBytes: value.maximumRequestBytes, maximumResponseBytes: value.maximumResponseBytes, timeoutMs: value.timeoutMs }); }
function publicTool(value) { return Object.freeze({ providerId: value.provider.id, toolId: value.toolId, capabilityId: value.capabilityId, schemaValid: value.schemaValid, routable: value.routable, reasonCode: value.reasonCode }); }
async function withTimeout(value, timeoutMs, code) { let timer; try { return await Promise.race([Promise.resolve(value), new Promise((_, reject) => { timer = setTimeout(() => reject(error(code)), timeoutMs); })]); } finally { clearTimeout(timer); } }
function list(value, maximum, validate, code) { if (!Array.isArray(value) || value.length > maximum || new Set(value).size !== value.length) fail(code); for (const item of value) validate(item, code); }
function token(value, code) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/.test(value)) fail(code); }
function slug(value, code) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) fail(code); }
function integer(value, minimum, maximum, code) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }
function error(code) { const value = new TypeError(code); value.code = code; return value; }
function fail(code) { throw error(code); }
