import {
  modelRequestEvent,
  sendEvents,
  sessionEvent,
  toolEvent,
  turnEvent,
  type NormalEvent,
} from "@slopwatch/events";

const listener = { name: "claude-code", version: "0.0.0" };

export const buildClaudeCodeStubEvents = (cwd: string): NormalEvent[] => {
  const observed_at = new Date(0).toISOString();

  return [
    sessionEvent({
      event_id: "evt_claude_code_session",
      observed_at,
      listener,
      session_id: "ses_claude_code_stub",
      coding_agent: "claude-code",
      cwd,
      source: {
        agent_event_name: "SessionStart",
        agent_schema_version: "stub",
        raw: { session_id: "ses_claude_code_stub", cwd },
      },
    }),
    turnEvent({
      event_id: "evt_claude_code_turn",
      observed_at,
      listener,
      session_id: "ses_claude_code_stub",
      turn_id: "turn_claude_code_stub",
      parent_turn_ids: [],
      user_prompt: "Stub Turn observed by the Claude Code Listener",
    }),
    modelRequestEvent({
      event_id: "evt_claude_code_model_request",
      observed_at,
      listener,
      session_id: "ses_claude_code_stub",
      turn_id: "turn_claude_code_stub",
      model_request_id: "mr_claude_code_stub",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    }),
    toolEvent({
      event_id: "evt_claude_code_tool",
      observed_at,
      listener,
      session_id: "ses_claude_code_stub",
      turn_id: "turn_claude_code_stub",
      tool_event_id: "tool_claude_code_stub",
      tool_name: "Read",
      phase: "end",
    }),
  ];
};

void sendEvents;
console.log("slopwatch claude-code listener stub");
