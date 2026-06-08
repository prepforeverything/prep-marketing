---
id: loc-awareness
title: Check large additions for split opportunities
applies_to: build
severity: advisory
---

## Rule

If a single edit adds more than 100 lines to a file, pause and check whether the addition should be split into a separate file or module. Files over the `documentation.maxLoc` limit defined in `kit.manifest.json` require a note in the plan's decisions log explaining why the size is justified.

The default `documentation.maxLoc` is read from the manifest at build time — do not hardcode it.
