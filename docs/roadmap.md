# Slopatrol Roadmap

Slopatrol starts from an observability foundation and moves toward an
interpreter and policy layer for coding-agent output.

## Milestones

### 1. Assessment Contract

Define `SessionAssessment`: summary, files touched, commands/tests, failures,
findings, signals, review urgency, and evidence references.

Input should stay read-only: `NormalEvent[]` plus optional git diff text.

### 2. Session Interpreter

Assemble facts from Events:

- Session and Turn structure.
- Model requests and cost.
- Tool events and command timelines.
- Failed commands.
- Touched files.
- Subagent relationships.

This layer reports facts, not policy decisions.

### 3. Diff-Aware Evidence

Parse git diffs into review evidence:

- Files touched.
- Additions and deletions.
- Test files.
- Sensitive paths such as auth, CI, deployment, database migrations, and
  production configuration.
- Large or unrelated file spreads.

Every fact should be traceable to an Event id or diff path.

### 4. Deterministic Slop Heuristics

Implement named findings before adding LLM judgment:

- Ignored test failure.
- Edits without tests.
- High spend with no code change.
- Repeated failed command.
- Large deletion.
- Sensitive file touched.
- Excessive tool activity.
- Excessive subagent activity.

Findings should include evidence and severity.

### 5. Policy Evaluator

Map facts and findings to organization-level outcomes:

- `likely_fine`
- `needs_review`
- `high_risk`
- `policy_violation`

Policy definitions should remain separate from evidence collection.

### 6. CLI and Reports

Add a review-oriented command:

```sh
slopatrol assess --events events.jsonl --diff diff.patch --format json
slopatrol assess --events events.jsonl --diff diff.patch --format markdown
```

Markdown output should be suitable for a human reviewer.

### 7. Feedback and Aggregates

Later, add reviewer labels and rollups:

- False positive.
- Accepted or rejected.
- Risky or safe.
- Useful or not useful.
- Agent/model/repo cost-quality trends.

## First Implementation Branch

Start with:

```sh
feature/slopatrol-session-assessment-core
```

Scope:

- Add the assessment schema.
- Add pure functions that summarize existing Events into assessment facts.
- Use fixture-style tests.
- Do not add UI, storage, enforcement, or LLM evaluation yet.
