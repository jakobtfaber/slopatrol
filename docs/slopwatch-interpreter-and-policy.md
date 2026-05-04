# Slopwatch Interpreter and Policy Layer

## Purpose

Slopwatch currently describes the capture foundation for coding-agent activity:
Listeners observe coding agents, normalize activity into Events, and send those
Events to the Server for storage and review.

To become more than an observer, Slopwatch needs a judgment layer. That layer
should interpret Sessions and Turns, identify waste or risk, and route the
right work to humans for review.

In short:

> Slopwatch should not merely show what agents did. It should tell humans which
> agent Sessions deserve attention, why, and what risk or waste they contain.

## Product Direction

The "watch" layer records activity. The "slop" layer should classify it.

Slop, in this context, means agent work that is low quality, wasteful, risky,
careless, hard to review, or out of policy. Examples include excessive model
spend, meandering tool use, ignored test failures, broad unrelated edits,
runaway subagents, and sessions that appear complete but leave the repo in a bad
state.

The first version should favor explainable signals over opaque scoring. Humans
should be able to see why a Session was flagged.

## Proposed Additions

### 1. Session Summaries

Add a human-readable summary layer over raw Events.

A Session summary should answer:

- What was the coding agent asked to do?
- What files did it read or modify?
- What commands and tests did it run?
- What failed?
- What succeeded?
- What changed in the repo?
- What risks or loose ends remain?

This is the first step from logs to interpretation.

### 2. Slop Heuristics

Add deterministic rules that flag suspicious or review-worthy behavior before
introducing LLM-based judgment.

Initial heuristics could include:

- High spend with no code changes.
- Many tool calls with little apparent progress.
- Repeated failed commands.
- Edits made without tests.
- Test failures ignored in the final response.
- Large diffs spanning unrelated files.
- Deleting code without clear justification.
- Touching sensitive files such as auth, security, CI, deployment, or database
  migrations.
- Excessive subagent spawning.
- Repeated retries of the same failing approach.

Each heuristic should produce a named finding with evidence from Events, command
output, diffs, and test results.

### 3. Quality Signals

Compute multiple explainable signals per Turn or Session rather than a single
global score.

Candidate signals:

- Cost efficiency.
- Task completion confidence.
- Test discipline.
- Code-change focus.
- Diff risk.
- Review urgency.
- Slop likelihood.

These signals should be inspectable and should link back to the Events or diffs
that produced them.

### 4. Policy Engine

Let organizations define rules that decide when a Session needs review or should
be blocked from downstream workflows.

Example policies:

- Any Session over a spend threshold requires DRI review.
- Any production configuration change requires review.
- Any auth, permission, or security-sensitive file change requires review.
- Agent changes cannot be merged unless tests passed or a reviewer explicitly
  waived the requirement.
- Any Session with ignored test failures is marked high risk.
- Any large deletion requires review.

The policy engine should separate policy definition from evidence collection.
Events and summaries provide facts; policies decide consequences.

### 5. Diff-Aware Evaluation

Quality interpretation should combine the agent transcript with repository
state.

Useful inputs:

- Initial user prompt.
- Turn transcript.
- Tool events.
- Commands run and their output.
- Git diff before and after the Session.
- Tests run and their results.
- Files touched.
- Final assistant response.

This enables the core question: did the coding agent actually solve the task it
was given?

### 6. Review Queue

Add an operational queue for humans, especially DRIs.

Suggested buckets:

- Needs review.
- Likely fine.
- Wasteful.
- Risky change.
- Failed Session.
- High-cost Session.
- Policy violation.

The review queue should be evidence-first. A reviewer should be able to open a
flag and see the exact commands, Events, diffs, and summaries behind it.

### 7. Agent Report Cards

Aggregate quality and cost signals over time.

Useful questions:

- Which coding agents waste the most tokens?
- Which agents complete tasks most reliably?
- Which models are most cost-effective?
- Which repos produce the most failed Sessions?
- Which users or teams need more review support?
- Which tool-use patterns predict bad outcomes?
- Which subagent patterns are useful versus wasteful?

This turns Slopwatch from a log viewer into an accountability and learning
system for coding-agent usage.

### 8. Human Feedback Loop

Let reviewers label outcomes:

- Useful or not useful.
- Accepted or rejected.
- Risky or safe.
- Accurate or hallucinated.
- Required cleanup.
- False positive policy finding.

These labels should feed back into heuristic tuning and future evaluation
models. Human judgment should remain the source of truth for ambiguous quality
questions.

## Suggested First Milestone

Implement a read-only interpreter that consumes stored Events plus a git diff
and emits a `SessionAssessment`.

The assessment should include:

- A short summary.
- A list of files touched.
- Commands/tests run.
- Detected failures.
- Heuristic findings.
- Review urgency.
- Evidence links back to Events.

This milestone avoids enforcement at first. It proves that Slopwatch can turn
captured activity into useful human-readable judgment before adding policy
actions.

## Design Principles

- Prefer explainable findings over opaque scores.
- Keep human review central.
- Start with deterministic heuristics.
- Use LLM evaluation only where transcript and diff context materially improve
  judgment.
- Separate facts from policy decisions.
- Make every finding traceable to evidence.
- Treat cost, correctness, and risk as related but distinct dimensions.
