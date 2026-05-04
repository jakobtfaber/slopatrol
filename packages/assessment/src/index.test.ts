import { describe, expect, test } from "bun:test";
import {
  modelRequestEvent,
  sessionEvent,
  toolEvent,
  turnEvent,
  type NormalEvent,
} from "@slopatrol/events";
import { createSessionAssessment } from "./index";

const base = {
  observed_at: "2026-05-04T12:00:00.000Z",
  listener: { name: "fixture", version: "0.0.0" },
} as const;

describe("createSessionAssessment", () => {
  test("summarizes Events, cost, tokens, commands, and touched files", () => {
    const assessment = createSessionAssessment({
      events: fixtureEvents(),
      diff: [
        "diff --git a/src/auth.ts b/src/auth.ts",
        "index 1111111..2222222 100644",
        "--- a/src/auth.ts",
        "+++ b/src/auth.ts",
        "@@ -1,1 +1,2 @@",
        "-old",
        "+new",
        "+more",
      ].join("\n"),
    });

    expect(assessment.session_id).toBe("ses_1");
    expect(assessment.counts).toEqual({
      events: 5,
      turns: 1,
      model_requests: 1,
      tool_events: 2,
    });
    expect(assessment.tokens).toEqual({ input: 120, output: 40 });
    expect(assessment.cost_usd).toBe(0.25);
    expect(assessment.commands).toEqual([
      {
        event_id: "evt_tool_1",
        command: "npm test",
        failed: false,
        is_test: true,
      },
      {
        event_id: "evt_tool_2",
        command: "npm run build",
        failed: true,
        is_test: false,
      },
    ]);
    expect(assessment.tests).toEqual([
      {
        event_id: "evt_tool_1",
        command: "npm test",
        passed: true,
      },
    ]);
    expect(assessment.signals).toEqual({
      touched_sensitive_paths: true,
      changed_non_test_files: true,
      has_test_evidence: true,
      failed_commands: 1,
      failed_tests: 0,
    });
    expect(assessment.files_touched).toEqual([
      {
        path: "src/auth.ts",
        additions: 2,
        deletions: 1,
        is_test_file: false,
        is_sensitive_path: true,
      },
    ]);
    expect(assessment.findings.map((finding) => finding.code)).toEqual([
      "failed_tool",
      "sensitive_path_touched",
    ]);
    expect(assessment.review_urgency).toBe("needs_review");
  });

  test("flags changed production files when there is no test evidence", () => {
    const assessment = createSessionAssessment({
      events: fixtureEvents({ includeTestCommand: false }),
      diff: [
        "diff --git a/src/index.ts b/src/index.ts",
        "--- a/src/index.ts",
        "+++ b/src/index.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n"),
    });

    expect(assessment.findings.map((finding) => finding.code)).toContain(
      "edits_without_tests",
    );
    expect(assessment.review_urgency).toBe("needs_review");
  });

  test("classifies failed tests as high risk", () => {
    const assessment = createSessionAssessment({
      events: fixtureEvents({ failTestCommand: true }),
      diff: "",
    });

    expect(assessment.tests).toEqual([
      {
        event_id: "evt_tool_1",
        command: "npm test",
        passed: false,
      },
    ]);
    expect(assessment.findings.map((finding) => finding.code)).toContain(
      "failed_test",
    );
    expect(assessment.review_urgency).toBe("high_risk");
  });

  test("ignores in-progress command starts and accepts non-Bash command tools", () => {
    const assessment = createSessionAssessment({
      events: [
        ...fixtureEvents({ includeBuildCommand: false }),
        toolEvent({
          ...base,
          event_id: "evt_tool_start",
          session_id: "ses_1",
          turn_id: "turn_1",
          tool_event_id: "tool_start",
          tool_name: "Bash",
          phase: "start",
          input: { command: "npm test --watch" },
        }),
        toolEvent({
          ...base,
          event_id: "evt_tool_custom",
          session_id: "ses_1",
          turn_id: "turn_1",
          tool_event_id: "tool_custom",
          tool_name: "Shell",
          phase: "end",
          input: { command: "cargo test" },
          output: { exit_code: 0 },
        }),
      ],
    });

    expect(assessment.commands.map((command) => command.command)).toEqual([
      "npm test",
      "cargo test",
    ]);
  });

  test("adds model request evidence to high-spend findings", () => {
    const assessment = createSessionAssessment({
      events: fixtureEvents(),
      highSpendUsd: 0.1,
    });

    expect(
      assessment.findings.find((finding) => finding.code === "high_spend"),
    ).toEqual({
      code: "high_spend",
      severity: "warning",
      message: "The session cost at least $0.10.",
      evidence: [{ kind: "event", event_id: "evt_model_1" }],
    });
  });

  test("requires exactly one Session Event", () => {
    expect(() => createSessionAssessment({ events: [] })).toThrow(
      "SessionAssessment requires exactly one Session Event",
    );

    expect(() =>
      createSessionAssessment({
        events: [
          ...fixtureEvents(),
          sessionEvent({
            ...base,
            event_id: "evt_session_2",
            session_id: "ses_2",
            coding_agent: "codex-cli",
            cwd: "/work/project",
          }),
        ],
      }),
    ).toThrow("SessionAssessment requires exactly one Session Event");
  });
});

const fixtureEvents = ({
  failTestCommand = false,
  includeBuildCommand = true,
  includeTestCommand = true,
}: {
  failTestCommand?: boolean;
  includeBuildCommand?: boolean;
  includeTestCommand?: boolean;
} = {}): NormalEvent[] => {
  const events: NormalEvent[] = [
    sessionEvent({
      ...base,
      event_id: "evt_session_1",
      session_id: "ses_1",
      coding_agent: "codex-cli",
      cwd: "/work/project",
    }),
    turnEvent({
      ...base,
      event_id: "evt_turn_1",
      session_id: "ses_1",
      turn_id: "turn_1",
      parent_turn_ids: [],
      user_prompt: "Make the build pass",
    }),
    modelRequestEvent({
      ...base,
      event_id: "evt_model_1",
      session_id: "ses_1",
      turn_id: "turn_1",
      model_request_id: "mr_1",
      provider: "openai",
      model: "gpt-5.5",
      input_tokens: 120,
      output_tokens: 40,
      cost_usd: 0.25,
    }),
    toolEvent({
      ...base,
      event_id: "evt_tool_1",
      session_id: "ses_1",
      turn_id: "turn_1",
      tool_event_id: "tool_1",
      tool_name: "Bash",
      phase: "end",
      input: { command: includeTestCommand ? "npm test" : "npm run lint" },
      output: { exit_code: failTestCommand ? 1 : 0 },
    }),
  ];

  if (includeBuildCommand) {
    events.push(
      toolEvent({
        ...base,
        event_id: "evt_tool_2",
        session_id: "ses_1",
        turn_id: "turn_1",
        tool_event_id: "tool_2",
        tool_name: "Bash",
        phase: "end",
        input: { command: "npm run build" },
        output: { exit_code: 1 },
      }),
    );
  }

  return events;
};
