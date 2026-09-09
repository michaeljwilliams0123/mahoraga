type RecognitionResult = { isFinal?: boolean; 0?: { transcript?: string } };
type RecognitionEvent = { results?: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error?: string };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => RecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

export type VoiceController = { supported: boolean; stop: () => void };

export function voiceSupport() {
  if (typeof window === "undefined") return { dictation: false, playback: false };
  const speechWindow = window as SpeechWindow;
  return {
    dictation: Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition),
    playback: Boolean(window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined"),
  };
}

export function startVoiceDictation({
  onText,
  onListeningChange,
  onError,
  language = "en-US",
}: {
  onText: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  onError?: (code: string) => void;
  language?: string;
}): VoiceController {
  if (typeof window === "undefined") return { supported: false, stop: () => undefined };
  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Recognition) return { supported: false, stop: () => undefined };

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = language;
  recognition.onresult = (event) => {
    const chunks: string[] = [];
    for (let index = 0; index < (event.results?.length ?? 0); index += 1) {
      const transcript = event.results?.[index]?.[0]?.transcript?.trim();
      if (transcript) chunks.push(transcript);
    }
    if (chunks.length > 0) onText(chunks.join(" "));
  };
  recognition.onerror = (event) => onError?.(event.error ?? "voice-recognition-error");
  recognition.onend = () => onListeningChange?.(false);
  recognition.start();
  onListeningChange?.(true);
  return {
    supported: true,
    stop: () => {
      recognition.stop();
      onListeningChange?.(false);
    },
  };
}

export function speakText(text: string) {
  if (!text.trim() || typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}
