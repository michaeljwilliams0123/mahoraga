export type ProviderMessage = { role: "user" | "assistant" | "system"; content: string };
export type ProviderInput = { messages: ProviderMessage[] };
export type ProviderInvoker = (model: string, input: ProviderInput) => Promise<unknown>;

type AiBinding = { run(model: string, input: ProviderInput): Promise<unknown> };

let testInvoker: ProviderInvoker | null = null;

export const invokeWorkersAi = async (binding: AiBinding | undefined, model: string, input: ProviderInput): Promise<unknown> => {
  if (testInvoker !== null) return testInvoker(model, input);
  if (binding === undefined || typeof binding.run !== "function") throw new Error("cognition-provider-binding-unavailable");
  return binding.run(model, input);
};

// Test-only dependency seam. It is not reachable from the Worker fetch/RPC surface;
// production remains bound exclusively to env.AI. Always reset after each test.
export const setProviderInvokerForTest = (invoker: ProviderInvoker | null): void => {
  testInvoker = invoker;
};
