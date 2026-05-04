import { describe, expect, test } from "bun:test";
import type { ModelRequestEvent, NormalEvent, ToolEvent } from "./index";
import {
  assertNormalEvent,
  createEventsRequest,
  isNormalEvent,
  modelRequestEvent,
  sendEvents,
  sessionEvent,
  toolEvent,
  turnEvent,
} from "./index";

const base = {
  event_id: "evt_1",
  observed_at: "2026-05-04T12:00:00.000Z",
  listener: { name: "claude-code", version: "0.0.0" },
} as const;

describe("events", () => {
  test("NormalEvent is a discriminated union for Session, Turn, Model request, and tool Events", () => {
    const events: NormalEvent[] = [
      sessionEvent({
        ...base,
        session_id: "ses_1",
        coding_agent: "claude-code",
        cwd: "/work/project",
      }),
      turnEvent({
        ...base,
        event_id: "evt_2",
        session_id: "ses_1",
        turn_id: "turn_1",
        parent_turn_ids: [],
        user_prompt: "Implement the Event schema",
      }),
      modelRequestEvent({
        ...base,
        event_id: "evt_3",
        session_id: "ses_1",
        turn_id: "turn_1",
        model_request_id: "mr_1",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        input_tokens: 120,
        output_tokens: 40,
        cost_usd: 0.003,
      }),
      toolEvent({
        ...base,
        event_id: "evt_4",
        session_id: "ses_1",
        turn_id: "turn_1",
        tool_event_id: "tool_1",
        tool_name: "Read",
        phase: "end",
        output: { file_path: "CONTEXT.md" },
        source: {
          agent_event_name: "ToolUseResult",
          agent_schema_version: "2026-05-04",
          raw: { tool: "Read", result: { file_path: "CONTEXT.md" } },
        },
      }),
    ];

    expect(events.map((event) => event.kind)).toEqual([
      "session",
      "turn",
      "model_request",
      "tool",
    ]);
    expect(events.every(isNormalEvent)).toBe(true);
  });

  test("Model request Events narrow by kind", () => {
    const event: NormalEvent = modelRequestEvent({
      ...base,
      session_id: "ses_1",
      turn_id: "turn_1",
      model_request_id: "mr_1",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    });

    if (event.kind === "model_request") {
      const modelRequest: ModelRequestEvent = event;
      expect(modelRequest.model_request_id).toBe("mr_1");
    }
  });

  test("tool Events describe tool-use loops inside a Turn", () => {
    const event: ToolEvent = toolEvent({
      ...base,
      session_id: "ses_1",
      turn_id: "turn_1",
      tool_event_id: "tool_1",
      tool_name: "Bash",
      phase: "start",
      input: { command: "bun test" },
    });

    expect(event.kind).toBe("tool");
    expect(event.phase).toBe("start");
  });

  test("constructors preserve the Event kind for untyped callers", () => {
    expect(
      sessionEvent({
        ...base,
        kind: "tool",
        session_id: "ses_1",
        coding_agent: "claude-code",
        cwd: "/work/project",
      } as never).kind,
    ).toBe("session");

    expect(
      modelRequestEvent({
        ...base,
        kind: "session",
        session_id: "ses_1",
        turn_id: "turn_1",
        model_request_id: "mr_1",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
      } as never).kind,
    ).toBe("model_request");
  });

  test("validation rejects unknown Event kinds", () => {
    expect(isNormalEvent({ ...base, kind: "message" })).toBe(false);
    expect(() => assertNormalEvent({ ...base, kind: "message" })).toThrow(
      "invalid NormalEvent",
    );
  });

  test("validation rejects non-json tool payloads and negative usage", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "tool",
        session_id: "ses_1",
        turn_id: "turn_1",
        tool_event_id: "tool_1",
        tool_name: "Read",
        phase: "end",
        output: { content: undefined },
      }),
    ).toBe(false);

    expect(
      isNormalEvent({
        ...base,
        kind: "model_request",
        session_id: "ses_1",
        turn_id: "turn_1",
        model_request_id: "mr_1",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        input_tokens: -1,
      }),
    ).toBe(false);
  });

  test("validation accepts Session Events for root and subagent sessions", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "session",
        session_id: "ses_root",
        coding_agent: "claude-code",
        cwd: "/work/project",
      }),
    ).toBe(true);

    expect(
      isNormalEvent({
        ...base,
        kind: "session",
        session_id: "ses_child",
        coding_agent: "claude-code",
        cwd: "/work/project",
        parent_session_id: "ses_root",
        spawned_by_turn_id: "turn_1",
      }),
    ).toBe(true);
  });

  test("validation rejects Session Events with partial subagent relationships", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "session",
        session_id: "ses_child",
        coding_agent: "claude-code",
        cwd: "/work/project",
        parent_session_id: "ses_root",
      }),
    ).toBe(false);

    expect(
      isNormalEvent({
        ...base,
        kind: "session",
        session_id: "ses_child",
        coding_agent: "claude-code",
        cwd: "/work/project",
        spawned_by_turn_id: "turn_1",
      }),
    ).toBe(false);
  });

  test("validation rejects listener-supplied user IDs on Session Events", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "session",
        session_id: "ses_1",
        coding_agent: "claude-code",
        cwd: "/work/project",
        user_id: "usr_listener_supplied",
      }),
    ).toBe(false);
  });

  test("validation rejects reserved user IDs on every Event kind", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "turn",
        session_id: "ses_1",
        turn_id: "turn_1",
        parent_turn_ids: [],
        user_id: "usr_listener_supplied",
      }),
    ).toBe(false);

    expect(
      isNormalEvent({
        ...base,
        kind: "model_request",
        session_id: "ses_1",
        turn_id: "turn_1",
        model_request_id: "mr_1",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        user_id: "usr_listener_supplied",
      }),
    ).toBe(false);
  });

  test("validation accepts JSON source metadata and rejects non-json raw payloads", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "turn",
        session_id: "ses_1",
        turn_id: "turn_1",
        parent_turn_ids: [],
        source: {
          agent_event_name: "UserPromptSubmit",
          agent_schema_version: "2026-05-04",
          raw: { prompt: "Preserve agent payloads", tags: ["debug"] },
        },
      }),
    ).toBe(true);

    expect(
      isNormalEvent({
        ...base,
        kind: "turn",
        session_id: "ses_1",
        turn_id: "turn_1",
        parent_turn_ids: [],
        source: { raw: { content: undefined } },
      }),
    ).toBe(false);

    expect(
      isNormalEvent({
        ...base,
        kind: "turn",
        session_id: "ses_1",
        turn_id: "turn_1",
        parent_turn_ids: [],
        source: { raw: new Date("2026-05-04T12:00:00.000Z") },
      }),
    ).toBe(false);
  });

  test("validation rejects invalid timestamps", () => {
    expect(
      isNormalEvent({
        ...base,
        kind: "turn",
        observed_at: "not-a-date",
        session_id: "ses_1",
        turn_id: "turn_1",
        parent_turn_ids: [],
      }),
    ).toBe(false);

    expect(
      isNormalEvent({
        ...base,
        kind: "model_request",
        session_id: "ses_1",
        turn_id: "turn_1",
        model_request_id: "mr_1",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        started_at: "not-a-date",
      }),
    ).toBe(false);
  });

  test("createEventsRequest packages validated Events for POST transport", () => {
    const event = sessionEvent({
      ...base,
      session_id: "ses_1",
      coding_agent: "claude-code",
      cwd: "/work/project",
    });

    const request = createEventsRequest({
      serverUrl: "https://slopwatch.example/events",
      bearerToken: "token_1",
      events: [event],
    });

    expect(request).toEqual({
      url: "https://slopwatch.example/events",
      init: {
        method: "POST",
        headers: {
          authorization: "Bearer token_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ events: [event] }),
      },
    });
  });

  test("createEventsRequest rejects empty server URL and bearer token", () => {
    const event = sessionEvent({
      ...base,
      session_id: "ses_1",
      coding_agent: "claude-code",
      cwd: "/work/project",
    });

    expect(() =>
      createEventsRequest({
        serverUrl: " ",
        bearerToken: "token_1",
        events: [event],
      }),
    ).toThrow("serverUrl is required");

    expect(() =>
      createEventsRequest({
        serverUrl: "https://slopwatch.example/events",
        bearerToken: " ",
        events: [event],
      }),
    ).toThrow("bearerToken is required");
  });

  test("createEventsRequest validates Events before serializing", () => {
    expect(() =>
      createEventsRequest({
        serverUrl: "https://slopwatch.example/events",
        bearerToken: "token_1",
        events: [{ ...base, kind: "stub" } as never],
      }),
    ).toThrow("invalid NormalEvent");
  });

  test("sendEvents validates Events before the transport is implemented", async () => {
    await expect(
      sendEvents([{ ...base, kind: "stub" } as never]),
    ).rejects.toThrow("invalid NormalEvent");
    await expect(sendEvents([])).rejects.toThrow("not implemented");
  });
});
