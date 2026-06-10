# Plan Index

Generated from the PrepKit structure. Do not edit by hand.

Rules:
- Scaffold new live initiatives with `prepkit plan "task-name"`.
- Add `--focus <preset>` when a plan should include pack-specific sections.
- Add `--mode <patch|build|design>` when the delivery shape should be explicit at scaffold time.
- Use `prepkit init-spec --plan <plan>` to scaffold or refresh active-plan spec files.
- Use `prepkit next-step` to inspect the current plan and spec progression.
- Create live initiatives in `plans/active/`.
- Move completed work to `plans/archive/`.
- Default to active-plan folders when one initiative owns the work.
- Keep `plans/reports/` small: standalone outputs only, with package directories when one report needs supporting files.
- Keep pre-plan or cross-initiative discovery material in `plans/research/`, and use package directories for multi-file research bundles.
- Keep initiative-bound specs in active-plan `spec/`.
- Keep concurrent execution state in active-plan `workstreams/` and `handoffs/`.
- Keep templates in `plans/templates/`.

## Active Plans

Path: `plans/active`

Only current initiatives belong here. One directory per live initiative.

- `260610-1124-kit-optimization-reliability-hygiene-bizloop/`
- `260610-1208-publish-preflight-teammate/`

## Archive

Path: `plans/archive`

Closed or superseded plan directories. Prefer year or quarter subfolders once volume grows.

- none

## Reports

Path: `plans/reports`

Standalone outputs with no owning initiative. Use package directories with `README.md` when one report needs supporting files.

- none

## Research

Path: `plans/research`

Pre-plan or cross-initiative discovery. Use package directories with `README.md` for multi-file research bundles.

- none

## Templates

Path: `plans/templates`

Canonical templates for plan structure plus standalone report and research packages.

- `active-plan/`
- `active-plan/decisions.md`
- `active-plan/plan.md`
- `cross-plan-research-package/`
- `cross-plan-research-package/README.md`
- `modes/`
- `modes/build/`
- `modes/design/`
- `modes/patch/`
- `standalone-report-package/`
- `standalone-report-package/README.md`

