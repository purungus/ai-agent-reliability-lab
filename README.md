# AI Agent Reliability Lab

[![CI](https://github.com/purungus/ai-agent-reliability-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/purungus/ai-agent-reliability-lab/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-2ea44f)](https://purungus.github.io/ai-agent-reliability-lab/)

A small, reproducible demonstration of governed conversational AI behavior: evidence boundaries, safe partial answers, ambiguity handling, human handoff, decision logging, and regression evaluation.

This is a synthetic portfolio project. It contains no client code, customer data, credentials, conversations, or production infrastructure.

**[Open the live demo](https://purungus.github.io/ai-agent-reliability-lab/)**

## Problem

Conversational systems can sound confident while using stale, ambiguous, or user-supplied information as truth. This lab demonstrates a stricter operating model:

- only approved and current evidence can support a confirmed claim;
- ambiguous or missing evidence cannot produce an invented answer;
- risky or unresolved cases require human handoff;
- every decision records its evidence, policy version, and outcome;
- expected behavior is executable as regression fixtures.

## What the demo shows

- **Interactive evaluation:** run an individual synthetic customer message and inspect intents, entities, evidence, blocked claims, response, and handoff status.
- **Batch evaluation:** execute 16 normal, ambiguous, expired-data, and adversarial fixtures against expected outcomes.
- **Decision ledger:** retain and export the inputs, decisions, evidence, policy version, and timestamps produced during a session.
- **Truth boundary:** customer-provided prices are captured as claims but never promoted to verified evidence.
- **Never-auto policy:** prohibited actions fail closed and require handoff.

## Decision model

| Decision | Meaning |
| --- | --- |
| `CONFIRMED` | The requested claim is supported by current, exact evidence. |
| `SAFE_PARTIAL` | A limited answer is supported, but part of the request remains unresolved. |
| `BLOCK` | The system lacks safe evidence or the action is prohibited; human handoff is required when applicable. |

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open the local URL shown by Vite. Use **Modo interactivo** for individual cases or **Modo batch** to run the complete fixture set.

## Verify

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Current verified baseline: 61 automated tests across policy, extraction, and truth-boundary behavior, plus 16 executable UI fixtures.

## Architecture

```text
synthetic message
      ↓
intent/entity extraction
      ↓
truth and freshness checks
      ↓
policy decision + handoff gate
      ↓
allowed response + decision ledger
      ↓
fixture comparison / exported evidence
```

Key modules:

- `src/engine/extract.ts` — conservative intent and entity extraction.
- `src/engine/truth.ts` — evidence matching and freshness rules.
- `src/engine/policy.ts` — claim confirmation, blocking, and response policy.
- `src/engine/ledger.ts` — auditable decision records.
- `src/fixtures/messages.json` — synthetic evaluation cases and expected outcomes.
- `src/tests/` — automated regression coverage.

## Scope and limitations

- This is a deterministic safety and evaluation lab, not a production LLM agent.
- Products, prices, messages, and identifiers are fictional test data.
- Persistence is browser-local and intended only for demonstration.
- There is no authentication, external CRM, messaging integration, or production deployment.
- Passing fixtures demonstrates behavior within this defined model; it is not a general claim of AI safety.

## Why this repository exists

The project demonstrates how I approach AI-native implementation: translate operating rules into explicit contracts, make uncertainty visible, require human control where evidence is insufficient, and turn failures into reproducible regression cases.
