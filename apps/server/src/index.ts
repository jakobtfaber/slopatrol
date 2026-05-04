import { isNormalEvent, type NormalEvent } from "@slopatrol/events";

export const acceptEvent = (event: unknown): NormalEvent => {
  if (!isNormalEvent(event)) {
    throw new Error("invalid NormalEvent");
  }

  return event;
};

const _stub = acceptEvent({
  kind: "session",
  event_id: "evt_server_stub_session",
  observed_at: new Date(0).toISOString(),
  listener: { name: "claude-code" },
  session_id: "ses_server_stub",
  coding_agent: "claude-code",
  cwd: process.cwd(),
});
console.log("slopatrol server stub");
