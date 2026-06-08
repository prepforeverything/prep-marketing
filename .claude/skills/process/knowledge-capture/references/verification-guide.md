# Knowledge Capture Verification Guide

This guide elaborates on each item in the knowledge-capture verification checklist.

## 1. Verify file paths

Before including any file path in a knowledge capture, confirm it exists:

```
# Use Glob for pattern matching
Glob: "src/middleware/*.ts"

# Use ls for a specific path
ls src/middleware/rate-limit.ts
```

If a path no longer exists, remove it from the capture or note when it was last valid.

## 2. Verify identifiers

Every function, class, or variable name referenced in a capture must be confirmed in the current codebase:

```
# Use Grep with the exact identifier name
Grep: "function validateOwnership" path="scripts/"

# For class names
Grep: "class SessionManager" path="src/"
```

If an identifier was renamed or removed, update or remove the reference.

## 3. Verify code examples

Code examples in captures must be syntactically valid at minimum:

- **Preferred:** Write the example to a temp file and run it through the relevant interpreter or compiler.
- **Minimum:** Run a syntax check (e.g., `node --check file.js`, `python -m py_compile file.py`).
- **Manual review:** If automated checking is impractical, read the example line by line against the current source to confirm correctness.

Do not copy code examples from chat history without verification — they may reflect an earlier state of the code.

## 4. Detect stale content

Compare the capture's `last reviewed` date against recent changes to referenced files:

```
# Check recent commits touching a referenced file
git log --oneline -5 -- src/middleware/rate-limit.ts
```

If the file has been modified since the capture was last reviewed, the capture needs a refresh. Update the `last reviewed` date only after confirming the content is still accurate.

## 5. Cross-reference existing captures

Before writing a new capture, search for overlapping topics:

```
# Check the knowledge index
Read: docs/reference/knowledge/INDEX.md

# Search for topic keywords in existing captures
Grep: "rate limiting" path="docs/reference/knowledge/"
```

If an existing capture covers the same topic:
- **Update** the existing capture if the new information supplements it.
- **Merge** if the existing capture and new information together form a more complete picture.
- **Link** from the new capture to the existing one if the topics are related but distinct.

Do not create a parallel capture that covers the same surface as an existing one.
