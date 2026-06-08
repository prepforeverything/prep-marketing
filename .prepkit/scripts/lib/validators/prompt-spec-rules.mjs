/**
 * Prompt Spec Contract Rules
 *
 * Each rule is a named check returning {status: 'pass'|'fail'|'na', reason: string}.
 * Rules declare which topologies they apply to via the `applicability` array.
 * Non-applicable rules return 'na' automatically.
 */

const ALL_TOPOLOGIES = ["analytic-multi", "analytic-single", "holistic"];
const ANALYTIC = ["analytic-multi", "analytic-single"];

/**
 * Helper: inspect JSON schema for field presence at any depth.
 */
function schemaHasField(schema, fieldName) {
  if (!schema || typeof schema !== "object") return false;
  if (fieldName in schema) return true;
  for (const val of Object.values(schema)) {
    if (typeof val === "object" && val !== null && schemaHasField(val, fieldName)) {
      return true;
    }
  }
  return false;
}

/**
 * Helper: get the criterion-level object from the schema.
 * Looks inside criteria.{any_key} for the per-criterion fields.
 */
function getCriterionTemplate(schema) {
  if (!schema || typeof schema !== "object") return null;
  const criteria = schema.criteria;
  if (!criteria || typeof criteria !== "object") return null;
  const keys = Object.keys(criteria);
  if (keys.length === 0) return null;
  return criteria[keys[0]];
}

function getSchemaForBranch(parsed, branchId) {
  return parsed.outputSchemas?.branches?.[branchId] || parsed.outputSchemas?.shared || parsed.outputSchema || null;
}

function getSchemaTargets(parsed) {
  if (parsed.branches.length > 1) {
    return parsed.branches.map((branch) => ({
      label: `Branch ${branch.id}`,
      schema: getSchemaForBranch(parsed, branch.id),
    }));
  }

  const singleBranch = parsed.branches[0];
  return [{
    label: singleBranch ? `Branch ${singleBranch.id}` : "Schema",
    schema: parsed.outputSchema || parsed.outputSchemas?.shared || null,
  }];
}

function validateAcrossSchemas(parsed, evaluate, passReason) {
  const targets = getSchemaTargets(parsed);
  if (targets.every(({ schema }) => !schema)) {
    return { status: "na", reason: "No output schema found" };
  }

  const failures = [];
  for (const target of targets) {
    if (!target.schema) {
      failures.push(`${target.label}: no output schema found`);
      continue;
    }
    const failure = evaluate(target.schema, target);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    return { status: "fail", reason: failures.join("; ") };
  }

  return { status: "pass", reason: passReason };
}

function inferFeedbackRequired(parsed) {
  if (typeof parsed.scoringContext?.feedbackRequired === "boolean") {
    return parsed.scoringContext.feedbackRequired;
  }

  return /\b(?:include|provide|return|add|must have)\s+(?:a\s+)?feedback\b/i.test(parsed.rawContent)
    || /\bfeedback\s+(?:field|per\s+criterion|for\s+(?:the\s+)?learner)\b/i.test(parsed.rawContent);
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export const rules = [
  {
    id: "no-overall-score",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const forbidden = ["overall_score", "overall", "band", "level_mapping"];
      return validateAcrossSchemas(
        parsed,
        (schema, target) => {
          for (const field of forbidden) {
            if (schemaHasField(schema, field)) {
              return `${target.label}: schema contains forbidden field ${field}`;
            }
          }
          const schemaText = JSON.stringify(schema);
          if (/\boverall_score\b/.test(schemaText)) {
            return `${target.label}: schema contains overall_score`;
          }
          return null;
        },
        "No overall_score or band mapping fields in all applicable schemas"
      );
    },
  },

  {
    id: "has-rubric-match",
    applicability: ANALYTIC,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => {
          const template = getCriterionTemplate(schema);
          if (!template) return `${target.label}: no per-criterion schema found`;
          if (!("rubric_match" in template)) {
            return `${target.label}: missing rubric_match field in per-criterion schema`;
          }
          return null;
        },
        "rubric_match field present in all per-criterion schemas"
      );
    },
  },

  {
    id: "has-adjacent-level-reasoning",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => {
          const template = getCriterionTemplate(schema);
          if (template && "adjacent_level_reasoning" in template) return null;
          if (schemaHasField(schema, "adjacent_level_reasoning")) return null;
          return `${target.label}: missing adjacent_level_reasoning field in schema`;
        },
        "adjacent_level_reasoning field present in all applicable schemas"
      );
    },
  },

  {
    id: "has-evidence",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => (
          schemaHasField(schema, "evidence")
            ? null
            : `${target.label}: missing evidence field in schema`
        ),
        "evidence field present in all applicable schemas"
      );
    },
  },

  {
    id: "has-rationale",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => (
          schemaHasField(schema, "rationale")
            ? null
            : `${target.label}: missing rationale field in schema`
        ),
        "rationale field present in all applicable schemas"
      );
    },
  },

  {
    id: "has-indicators",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => (
          schemaHasField(schema, "indicators")
            ? null
            : `${target.label}: missing indicators field in schema`
        ),
        "indicators field present in all applicable schemas"
      );
    },
  },

  {
    id: "has-flags",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => (
          schemaHasField(schema, "flags")
            ? null
            : `${target.label}: missing flags array in schema`
        ),
        "flags array present in all applicable schemas"
      );
    },
  },

  {
    id: "has-score-per-criterion",
    applicability: ANALYTIC,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => {
          const template = getCriterionTemplate(schema);
          if (!template) return `${target.label}: no per-criterion schema found`;
          if (!("score" in template)) {
            return `${target.label}: missing score field in per-criterion schema`;
          }
          return null;
        },
        "score field present in all per-criterion schemas"
      );
    },
  },

  {
    id: "has-feedback-when-required",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const feedbackRequired = inferFeedbackRequired(parsed);
      if (!feedbackRequired) {
        return { status: "na", reason: "Prompt does not require learner feedback" };
      }
      return validateAcrossSchemas(
        parsed,
        (schema, target) => (
          schemaHasField(schema, "feedback")
            ? null
            : `${target.label}: feedback is required but schema lacks feedback field`
        ),
        "feedback field present in all applicable schemas"
      );
    },
  },

  {
    id: "no-confidence",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      return validateAcrossSchemas(
        parsed,
        (schema, target) => (
          schemaHasField(schema, "confidence")
            ? `${target.label}: schema contains forbidden confidence field`
            : null
        ),
        "No confidence field in all applicable schemas"
      );
    },
  },

  {
    id: "json-example-in-user-prompt",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const userText = parsed.allUserText;
      if (!userText) return { status: "na", reason: "No user prompt sections found" };
      // Check for a concrete JSON example (fenced json block with actual values, not just $defs)
      const jsonBlocks = userText.match(/```json\s*\n[\s\S]*?```/g) || [];
      if (jsonBlocks.length === 0) {
        // Also accept inline JSON objects with score values
        if (/\{\s*"(?:criteria|score)"/.test(userText)) {
          return { status: "pass", reason: "JSON example found inline in user prompt" };
        }
        return { status: "fail", reason: "No JSON example found in user prompt sections" };
      }
      // Ensure it is a concrete example, not just a JSON Schema $defs block
      const hasConcreteExample = jsonBlocks.some(
        (block) => !/"\$defs"/.test(block) && /\bscore\b/.test(block)
      );
      if (hasConcreteExample) {
        return { status: "pass", reason: "Concrete JSON example found in user prompt" };
      }
      return { status: "fail", reason: "User prompt JSON blocks are schema definitions, not concrete examples" };
    },
  },

  {
    id: "output-rules-repeated",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      for (const branch of parsed.branches) {
        const sys = branch.systemPrompt || "";
        if (!sys) continue;
        const lines = sys.split("\n");
        const outputRuleLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (/\boutput\s+rules?\b/i.test(lines[i]) || /\breturn\s+only\s+valid\s+json\b/i.test(lines[i]) || /\bjson\b.*\bno\s+markdown\b/i.test(lines[i])) {
            outputRuleLines.push(i);
          }
        }
        const totalLines = lines.length;
        const hasNearStart = outputRuleLines.some((i) => i < totalLines * 0.4);
        const hasNearEnd = outputRuleLines.some((i) => i > totalLines * 0.6);
        if (!hasNearStart || !hasNearEnd) {
          return {
            status: "fail",
            reason: `Branch ${branch.id}: output rules not repeated near start and end of system prompt`,
          };
        }
      }
      if (parsed.branches.length === 0) {
        return { status: "na", reason: "No branches found" };
      }
      return { status: "pass", reason: "Output rules appear near both start and end of system prompts" };
    },
  },

  {
    id: "no-feature-score-mapping",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const content = parsed.rawContent;
      // Look for patterns like "-> band", "-> likely band", "= band", feature threshold tables
      const mappingPatterns = [
        /\u2192\s*band/i,
        /\u2192\s*likely\s+band/i,
        /->\s*band/i,
        /->\s*likely\s+band/i,
        /\bscore\s*[<>]=?\s*\d+\s*\u2192/,
        /\bscore\s*[<>]=?\s*\d+\s*->/,
      ];
      for (const pattern of mappingPatterns) {
        if (pattern.test(content)) {
          return { status: "fail", reason: "Contains feature-to-score mapping pattern (-> band)" };
        }
      }
      return { status: "pass", reason: "No feature-score mapping patterns found" };
    },
  },

  {
    id: "calibration-source-labels",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const { examples } = parsed.calibration;
      if (examples.length === 0) {
        return { status: "na", reason: "No calibration examples found" };
      }
      const unlabeled = examples.filter((e) => !e.sourceLabel);
      if (unlabeled.length > 0) {
        return {
          status: "fail",
          reason: `${unlabeled.length} calibration example(s) missing source: label`,
        };
      }
      return { status: "pass", reason: "All calibration examples have source labels" };
    },
  },

  {
    id: "calibration-min-count",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const { count } = parsed.calibration;
      const width = parsed.scaleWidth;
      if (width === null) {
        return { status: "na", reason: "Could not determine scale width" };
      }
      // Minimum coverage: narrow (1-3): 3, mid (1-5): 5, wide (1-9): 6
      let minRequired;
      if (width <= 3) minRequired = 3;
      else if (width <= 5) minRequired = 5;
      else minRequired = 6;

      if (count < minRequired) {
        return {
          status: "fail",
          reason: `${count} calibration examples found, minimum ${minRequired} required for scale width ${width}`,
        };
      }
      return {
        status: "pass",
        reason: `${count} calibration examples meet minimum ${minRequired} for scale width ${width}`,
      };
    },
  },

  {
    id: "calibration-rationale-structure",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      const { examples } = parsed.calibration;
      if (examples.length === 0) {
        return { status: "na", reason: "No calibration examples found" };
      }
      const missing = [];
      for (const ex of examples) {
        const steps = [];
        if (!ex.hasExtract) steps.push("Extract");
        if (!ex.hasCompare) steps.push("Compare");
        if (!ex.hasScore) steps.push("Score");
        if (steps.length > 0) {
          missing.push(`Example ${ex.number}: missing ${steps.join(", ")}`);
        }
      }
      if (missing.length > 0) {
        return {
          status: "fail",
          reason: `Calibration rationale structure incomplete: ${missing.join("; ")}`,
        };
      }
      return { status: "pass", reason: "All calibration examples have Extract/Compare/Score rationale" };
    },
  },

  {
    id: "temperature-pinned",
    applicability: ALL_TOPOLOGIES,
    check(parsed) {
      if (parsed.branches.length === 0) {
        return { status: "na", reason: "No branches found" };
      }

      const missing = parsed.branches
        .filter((branch) => !parsed.temperaturePinnedByBranch?.[branch.id])
        .map((branch) => `Branch ${branch.id}`);

      if (missing.length > 0) {
        return {
          status: "fail",
          reason: `${missing.join(", ")} missing temperature pin to 0`,
        };
      }

      return { status: "pass", reason: "Temperature pinned to 0 in all system prompts" };
    },
  },
];
