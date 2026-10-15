import type { ChatExecutionEvidence } from "@/lib/chat-execution-evidence";
import "./chat-execution-details.css";

export function ChatExecutionDetails({ evidence }: { evidence?: ChatExecutionEvidence }) {
  const reported = evidence?.status === "reported" ? evidence : null;
  return <details className="chat-execution-details">
    <summary>Execution details</summary>
    <p>{reported ? "Runtime-reported task metadata" : "Execution metadata unavailable for this message"}</p>
    {reported && <dl>
      <dt>Task</dt><dd>{reported.taskId}</dd>
      <dt>Worker</dt><dd>{reported.workerId}</dd>
      <dt>Provider</dt><dd>{reported.providerId}</dd>
      <dt>Cost class</dt><dd>{reported.costClass}</dd>
      <dt>Credit policy</dt><dd>{reported.creditPolicy}</dd>
      {reported.memoryState && <><dt>Memory index</dt><dd>{reported.memoryState}</dd></>}
    </dl>}
    <p>Independent execution verification: not supplied.</p>
    <p>Source, authentication, authority, routing, durable-result and replay receipts: not supplied for this message.</p>
  </details>;
}
