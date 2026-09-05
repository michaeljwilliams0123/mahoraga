export function parseCliArguments(argv = [], env = process.env) {
  if (!Array.isArray(argv)) throw new TypeError("cli-arguments-invalid");
  const [command = "start", ...rest] = argv;
  let argument = null;
  let port = null;

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === "--port") {
      if (command !== "start") throw new TypeError("cli-port-only-valid-for-start");
      if (port !== null) throw new TypeError("cli-runtime-port-duplicate");
      port = parseAllowedPort(rest[index + 1]);
      index += 1;
      continue;
    }
    if (argument !== null) throw new TypeError("cli-argument-unexpected");
    argument = item;
  }

  if (command === "start" && port === null && env?.MAHORAGA_RUNTIME_PORT) port = parseAllowedPort(env.MAHORAGA_RUNTIME_PORT);
  return { command, argument, port };
}

function parseAllowedPort(value) {
  if (!/^\d+$/.test(String(value ?? ""))) throw new TypeError("cli-runtime-port-invalid");
  const port = Number(value);
  if (port !== 4783) throw new TypeError("cli-runtime-port-not-allowed");
  return port;
}