# ADR 0002: Fork Direction as Slopatrol

## Status

Accepted.

## Context

This repository began as a personal fork of `mattpocock/slopwatch`. The upstream
project establishes a useful observability foundation for coding-agent activity:
Listeners, normalized Events, a Server, and review-oriented product language.

The fork is intentionally diverging. The new name is **Slopatrol**.

## Decision

Slopatrol will focus on interpreting and policing low-quality coding-agent work,
not only observing it.

The core product direction is:

- Capture coding-agent activity as Events.
- Assemble those Events into Session facts.
- Combine facts with diffs and command/test output.
- Emit explainable findings and review urgency.
- Let policy rules decide which Sessions need human attention.

The original upstream repository remains configured as `upstream` for reference
and selective cherry-picking. Development happens against the personal fork.

## Consequences

- Package names move from `@slopwatch/*` to `@slopatrol/*`.
- Product docs use Slopatrol terminology.
- Future implementation work should prioritize interpreter, assessment, and
  policy surfaces over generic observability UI.
- Upstream changes can still be inspected, but this fork does not assume PRs
  back to upstream.
