import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");

test("voice chat is progressive enhancement with local browser speech APIs", async () => {
  const [voice, workspace, chat] = await Promise.all([
    read("lib/voice-chat.ts"),
    read("components/workspace.tsx"),
    read("components/workspace/chat-view.tsx"),
  ]);
  assert.match(voice, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(voice, /speechSynthesis/);
  assert.match(voice, /supported/);
  assert.match(chat, /Voice|Mic|microphone/i);
  assert.match(workspace, /voice/i);
  assert.doesNotMatch(voice, /fetch\(|api\.openai\.com|api\.github\.com/i);
});

test("voice unsupported state never blocks typed chat", async () => {
  const chat = await read("components/workspace/chat-view.tsx");
  assert.match(chat, /textarea/);
  assert.match(chat, /voice/i);
  assert.doesNotMatch(chat, /disabled=\{!voiceSupported\}[^>]*textarea/);
});
