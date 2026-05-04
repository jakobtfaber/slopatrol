import {
  assertNormalEvent,
  type JsonValue,
  type NormalEvent,
} from "@slopatrol/events";
import { parseUnifiedDiff, type DiffFileFact } from "./diff";

export type ReviewUrgency = "likely_fine" | "needs_review" | "high_risk";
export type FindingSeverity = "info" | "warning" | "high";

export type EvidenceRef =
  | { kind: "event"; event_id: string }
  | { kind: "diff_file"; path: string };

export type AssessmentFinding = {
  code:
    | "failed_tool"
    | "failed_test"
    | "sensitive_path_touched"
    | "edits_without_tests"
    | "high_spend";
  severity: FindingSeverity;
  message: string;
  evidence: EvidenceRef[];
};

export type CommandFact = {
  event_id: string;
  command: string;
  failed: boolean;
  is_test: boolean;
};

export type TestFact = {
  event_id: string;
  command: string;
  passed: boolean;
};

export type FailureFact = {
  event_id: string;
  message: string;
};

export type SessionAssessment = {
  session_id: string;
  summary: string;
  counts: {
    events: number;
    turns: number;
    model_requests: number;
    tool_events: number;
  };
  tokens: {
    input: number;
    output: number;
  };
  cost_usd: number;
  files_touched: DiffFileFact[];
  commands: CommandFact[];
  tests: TestFact[];
  failures: FailureFact[];
  signals: {
    touched_sensitive_paths: boolean;
    changed_non_test_files: boolean;
    has_test_evidence: boolean;
    failed_commands: number;
    failed_tests: number;
  };
  findings: AssessmentFinding[];
  review_urgency: ReviewUrgency;
};

export type CreateSessionAssessmentInput = {
  events: NormalEvent[];
  diff?: string;
  highSpendUsd?: number;
};

export const createSessionAssessment = ({
  events,
  diff = "",
  highSpendUsd = 10,
}: CreateSessionAssessmentInput): SessionAssessment => {
  const normalizedEvents = events.map(assertNormalEvent);
  const sessionEvents = normalizedEvents.filter(
    (event) => event.kind === "session",
  );

  if (sessionEvents.length !== 1) {
    throw new Error("SessionAssessment requires exactly one Session Event");
  }

  const session = sessionEvents[0];
  const sessionEventsOnly = normalizedEvents.filter(
    (event) => "session_id" in event && event.session_id === session.session_id,
  );
  const turns = sessionEventsOnly.filter((event) => event.kind === "turn");
  const modelRequests = sessionEventsOnly.filter(
    (event) => event.kind === "model_request",
  );
  const toolEvents = sessionEventsOnly.filter((event) => event.kind === "tool");
  const filesTouched = parseUnifiedDiff(diff);
  const commands = toolEvents.flatMap(commandFactFromToolEvent);
  const tests = commands
    .filter((command) => command.is_test)
    .map((command) => ({
      event_id: command.event_id,
      command: command.command,
      passed: !command.failed,
    }));
  const failures = toolEvents.flatMap(failureFactFromToolEvent);
  const costUsd = sum(modelRequests.map((request) => request.cost_usd ?? 0));
  const signals = buildSignals({ commands, filesTouched, tests });
  const findings = buildFindings({
    commands,
    costUsd,
    failures,
    filesTouched,
    highSpendUsd,
    modelRequestEventIds: modelRequests.map((request) => request.event_id),
    signals,
    tests,
  });

  return {
    session_id: session.session_id,
    summary: buildSummary({
      session_id: session.session_id,
      turns: turns.length,
      model_requests: modelRequests.length,
      tool_events: toolEvents.length,
      files_touched: filesTouched.length,
    }),
    counts: {
      events: sessionEventsOnly.length,
      turns: turns.length,
      model_requests: modelRequests.length,
      tool_events: toolEvents.length,
    },
    tokens: {
      input: sum(modelRequests.map((request) => request.input_tokens ?? 0)),
      output: sum(modelRequests.map((request) => request.output_tokens ?? 0)),
    },
    cost_usd: costUsd,
    files_touched: filesTouched,
    commands,
    tests,
    failures,
    signals,
    findings,
    review_urgency: reviewUrgencyFor(findings),
  };
};

const commandFactFromToolEvent = (
  event: Extract<NormalEvent, { kind: "tool" }>,
): CommandFact[] => {
  if (event.phase !== "end") {
    return [];
  }

  const command = commandFromPayload(event.input);
  if (command === undefined) {
    return [];
  }

  return [
    {
      event_id: event.event_id,
      command,
      failed: event.error !== undefined || hasNonZeroExitCode(event.output),
      is_test: looksLikeTestCommand(command),
    },
  ];
};

const failureFactFromToolEvent = (
  event: Extract<NormalEvent, { kind: "tool" }>,
): FailureFact[] => {
  if (event.error === undefined && !hasNonZeroExitCode(event.output)) {
    return [];
  }

  return [
    {
      event_id: event.event_id,
      message: event.error ?? "Tool exited with a non-zero status",
    },
  ];
};

const buildFindings = ({
  commands,
  costUsd,
  failures,
  filesTouched,
  highSpendUsd,
  modelRequestEventIds,
  signals,
  tests,
}: {
  commands: CommandFact[];
  costUsd: number;
  failures: FailureFact[];
  filesTouched: DiffFileFact[];
  highSpendUsd: number;
  modelRequestEventIds: string[];
  signals: SessionAssessment["signals"];
  tests: TestFact[];
}): AssessmentFinding[] => {
  const findings: AssessmentFinding[] = [];
  const sensitiveFiles = filesTouched.filter((file) => file.is_sensitive_path);
  const changedNonTestFiles = filesTouched.filter((file) => !file.is_test_file);
  const failedTests = tests.filter((test) => !test.passed);

  if (failures.length > 0) {
    findings.push({
      code: "failed_tool",
      severity: failedTests.length > 0 ? "high" : "warning",
      message: "One or more tool calls failed.",
      evidence: failures.map((failure) => ({
        kind: "event",
        event_id: failure.event_id,
      })),
    });
  }

  if (failedTests.length > 0) {
    findings.push({
      code: "failed_test",
      severity: "high",
      message: "One or more test commands failed.",
      evidence: failedTests.map((test) => ({
        kind: "event",
        event_id: test.event_id,
      })),
    });
  }

  if (sensitiveFiles.length > 0) {
    findings.push({
      code: "sensitive_path_touched",
      severity: "warning",
      message: "The diff touches sensitive paths.",
      evidence: sensitiveFiles.map((file) => ({
        kind: "diff_file",
        path: file.path,
      })),
    });
  }

  if (signals.changed_non_test_files && !signals.has_test_evidence) {
    findings.push({
      code: "edits_without_tests",
      severity: "warning",
      message: "The session changed non-test files without test evidence.",
      evidence: changedNonTestFiles.map((file) => ({
        kind: "diff_file",
        path: file.path,
      })),
    });
  }

  if (costUsd >= highSpendUsd) {
    findings.push({
      code: "high_spend",
      severity: "warning",
      message: `The session cost at least $${highSpendUsd.toFixed(2)}.`,
      evidence: modelRequestEventIds.map((event_id) => ({
        kind: "event",
        event_id,
      })),
    });
  }

  return findings;
};

const buildSignals = ({
  commands,
  filesTouched,
  tests,
}: {
  commands: CommandFact[];
  filesTouched: DiffFileFact[];
  tests: TestFact[];
}): SessionAssessment["signals"] => ({
  touched_sensitive_paths: filesTouched.some((file) => file.is_sensitive_path),
  changed_non_test_files: filesTouched.some((file) => !file.is_test_file),
  has_test_evidence:
    filesTouched.some((file) => file.is_test_file) || tests.length > 0,
  failed_commands: commands.filter((command) => command.failed).length,
  failed_tests: tests.filter((test) => !test.passed).length,
});

const buildSummary = ({
  session_id,
  turns,
  model_requests,
  tool_events,
  files_touched,
}: {
  session_id: string;
  turns: number;
  model_requests: number;
  tool_events: number;
  files_touched: number;
}): string =>
  `Session ${session_id} contains ${turns} ${plural("Turn", turns)}, ` +
  `${model_requests} ${plural("Model request", model_requests)}, ` +
  `${tool_events} ${plural("Tool event", tool_events)}, and ` +
  `${files_touched} touched ${plural("file", files_touched)}.`;

const reviewUrgencyFor = (findings: AssessmentFinding[]): ReviewUrgency => {
  if (findings.some((finding) => finding.severity === "high")) {
    return "high_risk";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "needs_review";
  }

  return "likely_fine";
};

const commandFromPayload = (
  value: JsonValue | undefined,
): string | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const command = value.command;
  return typeof command === "string" ? command : undefined;
};

const hasNonZeroExitCode = (value: JsonValue | undefined): boolean => {
  if (!isJsonObject(value)) {
    return false;
  }

  const exitCode = value.exit_code ?? value.exitCode;
  return typeof exitCode === "number" && exitCode !== 0;
};

const looksLikeTestCommand = (command: string): boolean =>
  /\b(test|check|vitest|jest|bun test|npm test|cargo test|pytest)\b/.test(
    command,
  );

const isJsonObject = (
  value: JsonValue | undefined,
): value is { [key: string]: JsonValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const plural = (word: string, count: number): string =>
  count === 1 ? word : `${word}s`;

const sum = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0);

export type { DiffFileFact };
export { parseUnifiedDiff };
