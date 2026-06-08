# Capability Index

Generated from the active manifest. Do not edit by hand.
For the Codex-first guide to repo skills and project subagents, see `.prepkit/docs/reference/codex-catalog.md`.

Selected packs: `marketing`, `customer-prepedu`

## Tool Adapters

- `workspace-files` → `.prepkit/tools/workspace-files.md`
- `shell-execution` → `.prepkit/tools/shell-execution.md`
- `mcp-adapter` → `.prepkit/tools/mcp-adapter.md`
- `runtime-validator` → `.prepkit/tools/runtime-validator.md`
- `browser-execution` → `.prepkit/tools/browser-execution.md`
- `browser-screenshot-capture` → `.prepkit/tools/browser-screenshot-capture.md`
- `browser-observability-capture` → `.prepkit/tools/browser-observability-capture.md`
- `browser-session-bootstrap` → `.prepkit/tools/browser-session-bootstrap.md`

## Optional Tool-Adapter Boundaries

- `semanticCode` → category: `tool-adapter`; status: `optional`; activation: explicit opt-in; signals: env `PREP_SEMANTIC_ADAPTER`; paths `.prepkit/optional-adapters/semantic-code.json`; fallback tool adapters: `workspace-files`, `shell-execution`
- `retrievalSidecar` → category: `tool-adapter`; status: `optional`; activation: explicit opt-in; signals: env `PREP_RETRIEVAL_SIDECAR`; paths `.prepkit/optional-adapters/retrieval-sidecar.json`; fallback tool adapters: `workspace-files`, `shell-execution`
- `commandCompactor` → category: `tool-adapter`; status: `optional`; activation: explicit opt-in; signals: env `PREP_COMMAND_COMPACTOR`; paths `.prepkit/optional-adapters/command-compactor.json`; fallback tool adapters: `shell-execution`
- `gitbutlerClaude` → category: `tool-adapter`; status: `optional`; activation: explicit opt-in, recommended for Claude Code-first sessions; signals: env `PREP_GITBUTLER_CLAUDE`; paths `.prepkit/optional-adapters/gitbutler-claude.json`; fallback tool adapters: `shell-execution`

## Domain Skills

- `kit-architecture` → `.claude/skills/domain/kit-architecture/SKILL.md`
- `kit-authoring` → `.claude/skills/domain/kit-authoring/SKILL.md`
- `intuitive-explanation` → `.claude/skills/domain/intuitive-explanation/SKILL.md`
- `marketing-claims` → `.prepkit/packs/marketing/skills/domain/marketing-claims/SKILL.md`
- `marketing-product-context` → `.prepkit/packs/marketing/skills/domain/marketing-product-context/SKILL.md`
- `marketing-campaign-planning` → `.prepkit/packs/marketing/skills/domain/marketing-campaign-planning/SKILL.md`
- `marketing-copywriting` → `.prepkit/packs/marketing/skills/domain/marketing-copywriting/SKILL.md`
- `marketing-seo` → `.prepkit/packs/marketing/skills/domain/marketing-seo/SKILL.md`
- `marketing-cro` → `.prepkit/packs/marketing/skills/domain/marketing-cro/SKILL.md`
- `marketing-channel-optimization` → `.prepkit/packs/marketing/skills/domain/marketing-channel-optimization/SKILL.md`
- `marketing-performance-analysis` → `.prepkit/packs/marketing/skills/domain/marketing-performance-analysis/SKILL.md`
- `marketing-positioning` → `.prepkit/packs/marketing/skills/domain/marketing-positioning/SKILL.md`
- `marketing-growth` → `.prepkit/packs/marketing/skills/domain/marketing-growth/SKILL.md`
- `marketing-psychology` → `.prepkit/packs/marketing/skills/domain/marketing-psychology/SKILL.md`
- `marketing-ads` → `.prepkit/packs/marketing/skills/domain/marketing-ads/SKILL.md`
- `marketing-social` → `.prepkit/packs/marketing/skills/domain/marketing-social/SKILL.md`
- `marketing-content-strategy` → `.prepkit/packs/marketing/skills/domain/marketing-content-strategy/SKILL.md`
- `marketing-gtm` → `.prepkit/packs/marketing/skills/domain/marketing-gtm/SKILL.md`
- `marketing-lifecycle` → `.prepkit/packs/marketing/skills/domain/marketing-lifecycle/SKILL.md`
- `marketing-reporting` → `.prepkit/packs/marketing/skills/domain/marketing-reporting/SKILL.md`
- `marketing-asset-generation` → `.prepkit/packs/marketing/skills/domain/marketing-asset-generation/SKILL.md`
- `marketing-landing-page` → `.prepkit/packs/marketing/skills/domain/marketing-landing-page/SKILL.md`
- `sea-prep-gtm` → `.prepkit/packs/marketing/skills/domain/sea-prep-gtm/SKILL.md`

## Process Skills

- `context-collection` → `.claude/skills/process/context-collection/SKILL.md`
- `context-engineering` → `.claude/skills/process/context-engineering/SKILL.md`
- `prepkit-navigator` → `.claude/skills/process/prepkit-navigator/SKILL.md`
- `decision-interview` → `.claude/skills/process/decision-interview/SKILL.md`
- `knowledge-capture` → `.claude/skills/process/knowledge-capture/SKILL.md`
- `ubiquitous-language` → `.claude/skills/process/ubiquitous-language/SKILL.md`
- `lesson-capture` → `.claude/skills/process/lesson-capture/SKILL.md`
- `self-learning` → `.claude/skills/process/self-learning/SKILL.md`
- `runtime-validation` → `.claude/skills/process/runtime-validation/SKILL.md`
- `problem-solving` → `.claude/skills/process/problem-solving/SKILL.md`
- `verify-fix-loop` → `.claude/skills/process/verify-fix-loop/SKILL.md`
- `marketing-facilitation` → `.prepkit/packs/marketing/skills/process/marketing-facilitation/SKILL.md`

## Plan Presets

- `marketing` → slots: `preContext`, `postFiles`; required headings: `## Audience`, `## Positioning`, `## Message`, `## Content Strategy`, `## Channels`, `## Approvals`, `## Performance Framework`, `## Success Metrics`, `## Growth Metrics`

## Agents

- `planner` → `.claude/agents/planner.md`
- `researcher` → `.claude/agents/researcher.md`
- `marketing-reviewer` → `.claude/agents/marketing-reviewer.md`
- `marketing-copywriter` → `.claude/agents/marketing-copywriter.md`
- `marketing-content-reviewer` → `.claude/agents/marketing-content-reviewer.md`
- `marketing-campaign-diagnostician` → `.claude/agents/marketing-campaign-diagnostician.md`
- `marketing-strategist` → `.claude/agents/marketing-strategist.md`
- `marketing-performance-marketer` → `.claude/agents/marketing-performance-marketer.md`
- `marketing-seo-specialist` → `.claude/agents/marketing-seo-specialist.md`
- `marketing-growth-analyst` → `.claude/agents/marketing-growth-analyst.md`
- `marketing-content-strategist` → `.claude/agents/marketing-content-strategist.md`
- `marketing-social-media-manager` → `.claude/agents/marketing-social-media-manager.md`
- `marketing-gtm-manager` → `.claude/agents/marketing-gtm-manager.md`
- `marketing-lifecycle-strategist` → `.claude/agents/marketing-lifecycle-strategist.md`
- `marketing-ops-analyst` → `.claude/agents/marketing-ops-analyst.md`
- `marketing-media-designer` → `.claude/agents/marketing-media-designer.md`
- `marketing-claims-judge` → `.claude/agents/marketing-claims-judge.md`
- `marketing-creative-scorer` → `.claude/agents/marketing-creative-scorer.md`

## Commands

- `prep-plan` → `.claude/commands/prep-plan.md`
- `prep-doctor` → `.claude/commands/prep-doctor.md`
- `mkt` → `.prepkit/packs/marketing/commands/mkt.md`
- `mkt-campaign` → `.prepkit/packs/marketing/commands/mkt-campaign.md`
- `mkt-setup` → `.prepkit/packs/marketing/commands/mkt-setup.md`
- `mkt-connect` → `.prepkit/packs/marketing/commands/mkt-connect.md`
- `mkt-research` → `.prepkit/packs/marketing/commands/mkt-research.md`
- `mkt-build-landing-page` → `.prepkit/packs/marketing/commands/mkt-build-landing-page.md`
- `mkt-write-blog` → `.prepkit/packs/marketing/commands/mkt-write-blog.md`
- `mkt-social-pack` → `.prepkit/packs/marketing/commands/mkt-social-pack.md`
- `mkt-seo-audit` → `.prepkit/packs/marketing/commands/mkt-seo-audit.md`
- `mkt-launch` → `.prepkit/packs/marketing/commands/mkt-launch.md`
- `mkt-ads` → `.prepkit/packs/marketing/commands/mkt-ads.md`
- `mkt-email-sequence` → `.prepkit/packs/marketing/commands/mkt-email-sequence.md`
- `mkt-report` → `.prepkit/packs/marketing/commands/mkt-report.md`
- `mkt-measure` → `.prepkit/packs/marketing/commands/mkt-measure.md`
- `mkt-generate-asset` → `.prepkit/packs/marketing/commands/mkt-generate-asset.md`
- `mkt-creative-run` → `.prepkit/packs/marketing/commands/mkt-creative-run.md`
- `mkt-eval-calibrate` → `.prepkit/packs/marketing/commands/mkt-eval-calibrate.md`

## Workflows

- `primary-workflow` → `.claude/workflows/primary-workflow.md`
- `context-engineering` → `.claude/workflows/context-engineering.md`
- `knowledge-lifecycle` → `.claude/workflows/knowledge-lifecycle.md`
- `kit-governance` → `.claude/workflows/kit-governance.md`
- `mkt-campaign-golden` → `.prepkit/packs/marketing/workflows/mkt-campaign-golden.md`
- `marketing-launch` → `.prepkit/packs/marketing/workflows/marketing-launch.md`
- `marketing-go-to-market` → `.prepkit/packs/marketing/workflows/marketing-go-to-market.md`
- `marketing-content-pipeline` → `.prepkit/packs/marketing/workflows/marketing-content-pipeline.md`
- `marketing-conversion-optimization` → `.prepkit/packs/marketing/workflows/marketing-conversion-optimization.md`
- `marketing-growth-loop` → `.prepkit/packs/marketing/workflows/marketing-growth-loop.md`
- `marketing-campaign-sprint` → `.prepkit/packs/marketing/workflows/marketing-campaign-sprint.md`
- `marketing-lifecycle-flow` → `.prepkit/packs/marketing/workflows/marketing-lifecycle-flow.md`
- `mkt-creative-run-pipeline` → `.prepkit/packs/marketing/workflows/mkt-creative-run-pipeline.md`

