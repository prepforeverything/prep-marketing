function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function relativeFactor(value, bestValue, lowerIsBetter) {
  if (!Number.isFinite(value) || !Number.isFinite(bestValue)) {
    return null;
  }
  if (bestValue === 0) {
    return value === 0 ? 1 : null;
  }
  return lowerIsBetter ? value / bestValue : bestValue / value;
}

export function formatMs(value) {
  return `${value.toFixed(1)}ms`;
}

export function formatBenchmarkValue(value, benchmark = {}) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const unit = String(benchmark.unit || "");
  const measurement = String(benchmark.measurement || "duration");
  if (measurement === "duration" || unit === "ms") {
    return formatMs(value);
  }
  if (unit === "%" || unit === "percent") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (!unit || unit === "score") {
    return value.toFixed(3);
  }
  return `${value.toFixed(3)} ${unit}`;
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("summarizeSamples requires at least one sample");
  }
  return {
    runs: samples.length,
    minMs: Math.min(...samples),
    medianMs: median(samples),
    maxMs: Math.max(...samples),
    meanMs: mean(samples)
  };
}

export function rankBenchmarkResults(subjectResults, benchmark) {
  const measurement = String(benchmark.measurement || "duration");
  const resolveMeasurementValue = (result) => (
    measurement === "result"
      ? result.metricStats?.median
      : result.stats?.medianMs
  );
  const successful = subjectResults
    .filter((result) => result.status === "passed")
    .sort((left, right) => {
      const leftValue = resolveMeasurementValue(left);
      const rightValue = resolveMeasurementValue(right);
      if (benchmark.lowerIsBetter) {
        return leftValue - rightValue || left.subject.label.localeCompare(right.subject.label);
      }
      return rightValue - leftValue || left.subject.label.localeCompare(right.subject.label);
    });

  if (successful.length === 0) {
    return subjectResults.map((result) => ({
      subjectId: result.subject.id,
      label: result.subject.label,
      rank: null,
      medianMs: result.stats?.medianMs ?? null,
      measurementValue: resolveMeasurementValue(result) ?? null,
      relativeToBest: null,
      status: result.status
    }));
  }

  const bestMeasurementValue = resolveMeasurementValue(successful[0]);
  const ranked = successful.map((result, index) => ({
    subjectId: result.subject.id,
    label: result.subject.label,
    rank: index + 1,
    medianMs: result.stats.medianMs,
    measurementValue: resolveMeasurementValue(result),
    relativeToBest: relativeFactor(resolveMeasurementValue(result), bestMeasurementValue, benchmark.lowerIsBetter),
    status: result.status
  }));

  return [
    ...ranked,
    ...subjectResults
      .filter((result) => result.status !== "passed")
      .map((result) => ({
        subjectId: result.subject.id,
        label: result.subject.label,
        rank: null,
        medianMs: null,
        measurementValue: null,
        relativeToBest: null,
        status: result.status
      }))
  ];
}

export function buildScoreboard(benchmarkResults, subjectsById) {
  const statsBySubject = new Map(
    [...subjectsById.values()].map((subject) => [subject.id, {
      subjectId: subject.id,
      label: subject.label,
      wins: 0,
      completed: 0,
      relativeScores: []
    }])
  );

  for (const benchmarkResult of benchmarkResults) {
    const winner = benchmarkResult.ranking.find((entry) => entry.rank === 1);
    if (winner) {
      statsBySubject.get(winner.subjectId).wins += 1;
    }
    for (const entry of benchmarkResult.ranking) {
      if (entry.status !== "passed") {
        continue;
      }
      const subjectStats = statsBySubject.get(entry.subjectId);
      subjectStats.completed += 1;
      if (entry.relativeToBest !== null) {
        subjectStats.relativeScores.push(entry.relativeToBest);
      }
    }
  }

  return [...statsBySubject.values()]
    .map((entry) => ({
      ...entry,
      avgRelativeToBest: entry.relativeScores.length > 0 ? mean(entry.relativeScores) : null
    }))
    .sort((left, right) => (
      right.wins - left.wins
      || (left.avgRelativeToBest ?? Number.POSITIVE_INFINITY) - (right.avgRelativeToBest ?? Number.POSITIVE_INFINITY)
      || left.label.localeCompare(right.label)
    ));
}
