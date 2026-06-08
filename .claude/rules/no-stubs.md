---
id: no-stubs-in-delivery
title: No explicit stubs in build deliverables
applies_to: build
severity: enforced
---

## Rule

Do not leave explicit stubs in any file that is part of the current plan's scope. Explicit stubs include:

- `NotImplementedError` or `raise NotImplementedError`
- `throw new Error("not implemented")` or similar not-implemented throws
- `panic("not implemented")` or `panic("unimplemented")`
- `pass` as the sole statement in a Python function/method body
- Empty exported function bodies paired with placeholder comments (e.g., `// TODO: implement`)

If a function cannot be fully implemented in the current step, split the work into a follow-up step rather than leaving a stub.
