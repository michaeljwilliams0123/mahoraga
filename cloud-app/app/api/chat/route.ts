import { gateway } from "@ai-sdk/gateway";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { cloudBrowserTool } from "@/lib/browser-tool";
import {
  CLOUD_MAX_CONTEXT_MESSAGES,
  CLOUD_MAX_CONTEXT_TEXT_CHARS,
  CLOUD_MAX_OUTPUT_TOKENS,
  CLOUD_MAX_STEPS,
  CLOUD_SEARCH_MAX_RESULTS,
  CLOUD_SEARCH_MAX_TOKENS,
  connectionState,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_INPUT_TEXT_CHARS,
  MAX_TOTAL_FILE_BYTES,
  MODEL_ID,
  providerOptions,
  SYSTEM_PROMPT,
} from "@/lib/runtime-config";

export const maxDuration = 300;

function fileSizes(messages: UIMessage[]) {
  const files = messages.flatMap((message) =>
    message.parts.filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "file" }> =>
        part.type === "file",
    ),
  );
  const sizes = files.map((part) => {
    const comma = part.url.indexOf(",");
    return comma < 0 ? 0 : Math.floor(((part.url.length - comma - 1) * 3) / 4);
  });
  return { count: files.length, sizes, total: sizes.reduce((sum, size) => sum + size, 0) };
}

export function compactConversation(messages: UIMessage[]) {
  const selected: UIMessage[] = [];
  let textCharacters = 0;
  for (let index = messages.length - 1; index >= 0 && selected.length < CLOUD_MAX_CONTEXT_MESSAGES; index -= 1) {
    const message = messages[index];
    const messageCharacters = message.parts.reduce(
      (total, part) => total + (part.type === "text" || part.type === "reasoning" ? part.text.length : 0),
      0,
    );
    if (selected.length > 0 && textCharacters + messageCharacters > CLOUD_MAX_CONTEXT_TEXT_CHARS) break;
    selected.unshift(message);
    textCharacters += messageCharacters;
  }
  return selected;
}

export async function POST(request: Request) {
  if (!connectionState().model) {
    return Response.json(
      { error: "AI Gateway is not connected for this deployment." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as { messages?: UIMessage[] };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "A message is required." }, { status: 400 });
  }
  const latestTextCharacters = body.messages.at(-1)?.parts.reduce(
    (total, part) => total + (part.type === "text" ? part.text.length : 0),
    0,
  ) ?? 0;
  if (latestTextCharacters > MAX_INPUT_TEXT_CHARS) {
    return Response.json({ error: "Message text limit exceeded." }, { status: 413 });
  }

  const usage = fileSizes(body.messages);
  if (
    usage.count > MAX_FILES ||
    usage.total > MAX_TOTAL_FILE_BYTES ||
    usage.sizes.some((size) => size > MAX_FILE_BYTES)
  ) {
    return Response.json({ error: "Attachment limit exceeded." }, { status: 413 });
  }

  const tools = {
    web_search: gateway.tools.perplexitySearch({ maxResults: CLOUD_SEARCH_MAX_RESULTS, maxTokens: CLOUD_SEARCH_MAX_TOKENS }),
    ...(connectionState().browser ? { cloud_browser: cloudBrowserTool } : {}),
  };

  const result = streamText({
    model: gateway(MODEL_ID),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(compactConversation(body.messages)),
    providerOptions,
    tools,
    stopWhen: stepCountIs(CLOUD_MAX_STEPS),
    maxOutputTokens: CLOUD_MAX_OUTPUT_TOKENS,
    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET,
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    sendSources: true,
    onError: (error) => {
      console.error("chat-stream-error", error instanceof Error ? error.message : "unknown");
      return "The cloud model request failed. Check the connection status and try again.";
    },
  });
}
