export type EvalRow = {
  validatorPass: boolean;
  wordingPass: boolean;
  latencyMs: number;
  text: string;
};

type MetricRule = "rate" | "non-negative";

export const METRIC_RULES = {
  validatorPass: "rate",
  wordingPass: "rate",
  latencyMedianMs: "non-negative",
  latencyP95Ms: "non-negative",
  meanChars: "non-negative",
  distinct2: "rate",
} as const satisfies Record<string, MetricRule>;

export const MODEL_RULES = {
  base: true,
  trainedFull: true,
  trainedQ4: true,
  trainedQ8: true,
  teacher: true,
} as const;

type MetricName = keyof typeof METRIC_RULES;
type ModelName = keyof typeof MODEL_RULES;

export type Metrics = Record<MetricName, number>;
export type ModelMetrics = Record<ModelName, Metrics>;

export type EvaluationInput = {
  metricsByModel: ModelMetrics;
  humanPreference: { trainedWins: number; pairs: number };
};

export type ParseResult =
  { ok: true; value: EvaluationInput } | { ok: false; problems: string[] };

export type GateResult = {
  shipTrained: boolean;
  reasons: string[];
  stopBecauseBasePasses: boolean;
};

const GATE_TOLERANCE = 1e-9;
type TolerantComparison = "at-least" | "greater-than";

function compareWithTolerance(
  value: number,
  boundary: number,
  comparison: TolerantComparison,
): boolean {
  return comparison === "at-least"
    ? value >= boundary - GATE_TOLERANCE
    : value > boundary + GATE_TOLERANCE;
}

export function computeMetrics(rows: EvalRow[]): Metrics {
  if (rows.length === 0)
    throw new Error("Cannot compute metrics for an empty set");
  for (const row of rows) {
    if (!Number.isFinite(row.latencyMs) || row.latencyMs < 0) {
      throw new Error("latencyMs must be a non-negative finite number");
    }
  }

  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  const middle = Math.floor(latencies.length / 2);
  const latencyMedianMs =
    latencies.length % 2 === 0
      ? (latencies[middle - 1]! + latencies[middle]!) / 2
      : latencies[middle]!;
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  const allBigrams: string[] = [];
  for (const row of rows) allBigrams.push(...bigrams(row.text));

  return {
    validatorPass: rows.filter((row) => row.validatorPass).length / rows.length,
    wordingPass: rows.filter((row) => row.wordingPass).length / rows.length,
    latencyMedianMs,
    latencyP95Ms: latencies[p95Index]!,
    meanChars:
      rows.reduce((sum, row) => sum + row.text.length, 0) / rows.length,
    distinct2:
      allBigrams.length === 0
        ? 0
        : new Set(allBigrams).size / allBigrams.length,
  };
}

function bigrams(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const pairs: string[] = [];
  for (let index = 0; index + 1 < words.length; index += 1) {
    pairs.push(`${words[index]} ${words[index + 1]}`);
  }
  return pairs;
}

export function evaluateGates(raw: unknown): GateResult {
  const parsed = parseEvaluationInput(raw);
  if (!parsed.ok) {
    return {
      shipTrained: false,
      reasons: parsed.problems,
      stopBecauseBasePasses: false,
    };
  }

  const input = parsed.value;
  const { base, trainedFull, trainedQ4, trainedQ8 } = input.metricsByModel;
  if (compareWithTolerance(base.validatorPass, 0.9, "at-least")) {
    return {
      shipTrained: false,
      reasons: [
        "Base model already passes at least 90%; stop and do not ship a trained model.",
      ],
      stopBecauseBasePasses: true,
    };
  }

  const reasons: string[] = [];
  if (!compareWithTolerance(trainedQ4.validatorPass, 0.95, "at-least")) {
    reasons.push("Trained Q4 validator pass must be at least 95%.");
  }
  if (!compareWithTolerance(trainedQ8.validatorPass, 0.95, "at-least")) {
    reasons.push("Trained Q8 validator pass must be at least 95%.");
  }
  if (
    !compareWithTolerance(
      trainedQ4.validatorPass,
      base.validatorPass + 0.15,
      "at-least",
    )
  ) {
    reasons.push(
      "Trained Q4 must improve validator pass by at least 15 percentage points over base.",
    );
  }
  if (
    !compareWithTolerance(
      trainedQ8.validatorPass,
      base.validatorPass + 0.15,
      "at-least",
    )
  ) {
    reasons.push(
      "Trained Q8 must improve validator pass by at least 15 percentage points over base.",
    );
  }
  if (
    compareWithTolerance(
      Math.abs(trainedQ4.validatorPass - trainedFull.validatorPass),
      0.03,
      "greater-than",
    )
  ) {
    reasons.push(
      "Trained Q4 validator pass must be within 3 percentage points of full precision.",
    );
  }

  const { trainedWins, pairs } = input.humanPreference;
  if (
    pairs !== 50 ||
    !compareWithTolerance(trainedWins / pairs, 0.6, "at-least")
  ) {
    reasons.push(
      "Human preference must favor trained model in at least 60% of exactly 50 pairs.",
    );
  }

  return {
    shipTrained: reasons.length === 0,
    reasons,
    stopBecauseBasePasses: false,
  };
}

export function parseEvaluationInput(raw: unknown): ParseResult {
  const problems: string[] = [];
  const source = isRecord(raw) ? raw : undefined;
  const rawModels = isRecord(source?.metricsByModel)
    ? source.metricsByModel
    : {};
  const metricsByModel: Partial<ModelMetrics> = {};

  for (const model of Object.keys(MODEL_RULES) as ModelName[]) {
    const rawMetrics = isRecord(rawModels[model]) ? rawModels[model] : {};
    const metrics: Partial<Metrics> = {};

    for (const metric of Object.keys(METRIC_RULES) as MetricName[]) {
      const value = rawMetrics[metric];
      const rule = METRIC_RULES[metric];
      const valid =
        typeof value === "number" &&
        Number.isFinite(value) &&
        (rule === "rate" ? value >= 0 && value <= 1 : value >= 0);
      if (!valid) {
        const requirement =
          rule === "rate"
            ? "a finite number in [0, 1]"
            : "a non-negative finite number";
        problems.push(
          `metricsByModel.${model}.${metric} must be ${requirement}.`,
        );
      } else {
        metrics[metric] = value;
      }
    }

    metricsByModel[model] = metrics as Metrics;
  }

  const preference = isRecord(source?.humanPreference)
    ? source.humanPreference
    : {};
  const pairs = preference.pairs;
  const trainedWins = preference.trainedWins;
  if (typeof pairs !== "number" || !Number.isInteger(pairs) || pairs < 0) {
    problems.push("humanPreference.pairs must be a non-negative integer.");
  }
  if (
    typeof trainedWins !== "number" ||
    !Number.isInteger(trainedWins) ||
    typeof pairs !== "number" ||
    !Number.isInteger(pairs) ||
    trainedWins < 0 ||
    trainedWins > pairs
  ) {
    problems.push(
      "humanPreference.trainedWins must be an integer from 0 to humanPreference.pairs.",
    );
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      metricsByModel: metricsByModel as ModelMetrics,
      humanPreference: {
        pairs: pairs as number,
        trainedWins: trainedWins as number,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function renderReport(raw: unknown, gates: GateResult): string {
  const source =
    isRecord(raw) && "metricsByModel" in raw ? raw.metricsByModel : raw;
  const availableModels = isRecord(source) ? source : {};
  const modelNames = Object.keys(MODEL_RULES) as ModelName[];
  const metricNames = Object.keys(METRIC_RULES) as MetricName[];
  const metricLabels: Record<MetricName, string> = {
    validatorPass: "Validator pass",
    wordingPass: "Wording pass",
    latencyMedianMs: "Median latency (ms)",
    latencyP95Ms: "p95 latency (ms)",
    meanChars: "Mean chars",
    distinct2: "Distinct-2",
  };
  const tableHeader = `| Model | ${metricNames.map((metric) => metricLabels[metric]).join(" | ")} |`;
  const table = modelNames.map((name) => {
    const metrics = isRecord(availableModels[name])
      ? availableModels[name]
      : {};
    const values = metricNames.map((metric) =>
      formatMetric(METRIC_RULES[metric], metrics[metric]),
    );
    return `| ${name} | ${values.join(" | ")} |`;
  });
  const gateLines = gates.reasons.length
    ? gates.reasons.map((reason) => `- ${reason}`)
    : ["- All ship gates passed."];

  return [
    "# Coach model evaluation",
    "",
    tableHeader,
    `| --- | ${metricNames.map(() => "---:").join(" | ")} |`,
    ...table,
    "",
    "## Gate decision",
    "",
    `Ship trained model: **${gates.shipTrained ? "yes" : "no"}**`,
    "",
    ...gateLines,
    "",
  ].join("\n");
}

function formatMetric(rule: MetricRule, value: unknown): string {
  return rule === "rate" ? percentage(value) : fixed(value, 1);
}

function percentage(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "—";
}

function fixed(value: unknown, digits: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "—";
}
