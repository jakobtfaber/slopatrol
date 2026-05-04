import { describe, expect, test } from "bun:test";
import { isNormalEvent, sendEvents } from "@slopwatch/events";
import { buildClaudeCodeStubEvents } from "./index";

describe("claude-code listener", () => {
  test("builds Session, Turn, Model request, and tool Events", () => {
    const events = buildClaudeCodeStubEvents("/work/project");

    expect(events.map((event) => event.kind)).toEqual([
      "session",
      "turn",
      "model_request",
      "tool",
    ]);
    expect(events.every(isNormalEvent)).toBe(true);
  });

  test("re-exports sendEvents from events", () => {
    expect(typeof sendEvents).toBe("function");
  });
});
