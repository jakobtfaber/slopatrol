import { describe, expect, test } from "bun:test";
import { sessionEvent, turnEvent, type NormalEvent } from "@slopatrol/events";
import { acceptEvent } from "./index";

describe("server", () => {
  test("accepts a Session Event from a Listener", () => {
    const event: NormalEvent = sessionEvent({
      event_id: "evt_session_1",
      observed_at: "2026-05-04T12:00:00.000Z",
      listener: { name: "claude-code" },
      session_id: "ses_1",
      coding_agent: "claude-code",
      cwd: "/work/project",
    });

    expect(acceptEvent(event)).toEqual(event);
  });

  test("accepts a Turn Event in a Session", () => {
    const event = turnEvent({
      event_id: "evt_turn_1",
      observed_at: "2026-05-04T12:01:00.000Z",
      listener: { name: "claude-code" },
      session_id: "ses_1",
      turn_id: "turn_1",
      parent_turn_ids: [],
      user_prompt: "Preserve the glossary",
    });

    expect(acceptEvent(event).kind).toBe("turn");
  });

  test("rejects invalid Events", () => {
    expect(() => acceptEvent({ kind: "stub" })).toThrow("invalid NormalEvent");
  });
});
