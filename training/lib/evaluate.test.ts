import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  computeMetrics,
  evaluateGates,
  METRIC_RULES,
  MODEL_RULES,
  parseEvaluationInput,
  renderReport,
  type EvaluationInput,
} from "./evaluate.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/eval-numbers.json", import.meta.url),
);

type GateScenario = {
  base?: number;
  trainedFull?: number;
  trainedQ4?: number;
  trainedQ8?: number;
  trainedWins: number;
  pairs: number;
};

type EvalFixture = {
  metricsByModel: EvaluationInput["metricsByModel"];
  humanPreference: EvaluationInput["humanPreference"];
  scenarios: Record<string, GateScenario>;
};

async function fixture(): Promise<EvalFixture> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as EvalFixture;
}

function gateInput(data: EvalFixture, scenario: GateScenario): EvaluationInput {
  return {
    metricsByModel: {
      ...data.metricsByModel,
      base: {
        ...data.metricsByModel.base,
        validatorPass: scenario.base ?? data.metricsByModel.base.validatorPass,
      },
      trainedFull: {
        ...data.metricsByModel.trainedFull,
        validatorPass:
          scenario.trainedFull ?? data.metricsByModel.trainedFull.validatorPass,
      },
      trainedQ4: {
        ...data.metricsByModel.trainedQ4,
        validatorPass:
          scenario.trainedQ4 ?? data.metricsByModel.trainedQ4.validatorPass,
      },
      trainedQ8: {
        ...data.metricsByModel.trainedQ8,
        validatorPass:
          scenario.trainedQ8 ?? data.metricsByModel.trainedQ8.validatorPass,
      },
    },
    humanPreference: {
      trainedWins: scenario.trainedWins,
      pairs: scenario.pairs,
    },
  };
}

describe("computeMetrics", () => {
  it("computes pass rates, latency percentiles, length, and distinct bigrams", () => {
    const metrics = computeMetrics([
      {
        validatorPass: true,
        wordingPass: true,
        latencyMs: 100,
        text: "one two three",
      },
      {
        validatorPass: true,
        wordingPass: true,
        latencyMs: 300,
        text: "one two four",
      },
      {
        validatorPass: false,
        wordingPass: false,
        latencyMs: 200,
        text: "two three four",
      },
    ]);

    expect(metrics).toEqual({
      validatorPass: 2 / 3,
      wordingPass: 2 / 3,
      latencyMedianMs: 200,
      latencyP95Ms: 300,
      meanChars: 13,
      distinct2: 2 / 3,
    });
    expect(Object.keys(metrics).sort()).toEqual(
      Object.keys(METRIC_RULES).sort(),
    );
  });
});

describe("evaluateGates", () => {
  it("rejects every missing or invalid metric required by the shared schema", async () => {
    const data = await fixture();
    const missing = Symbol("missing");
    const invalidValues: unknown[] = [
      missing,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      "0.5",
    ];

    for (const model of Object.keys(MODEL_RULES)) {
      for (const metric of Object.keys(METRIC_RULES)) {
        const cases = [
          ...invalidValues,
          ...(METRIC_RULES[metric as keyof typeof METRIC_RULES] === "rate"
            ? [1.01]
            : []),
        ];
        for (const invalidValue of cases) {
          const raw = structuredClone({
            metricsByModel: data.metricsByModel,
            humanPreference: data.humanPreference,
          });
          const modelMetrics = raw.metricsByModel[model] as Record<
            string,
            unknown
          >;
          if (invalidValue === missing) delete modelMetrics[metric];
          else modelMetrics[metric] = invalidValue;

          const result = evaluateGates(raw);
          const field = `metricsByModel.${model}.${metric}`;

          expect(result.shipTrained, field).toBe(false);
          expect(result.stopBecauseBasePasses, field).toBe(false);
          expect(result.reasons.join(" "), field).toContain(field);
          expect(renderReport(raw, result), field).not.toContain("NaN");
        }
      }
    }
  });

  it("returns field problems for non-object and empty inputs", () => {
    for (const raw of ["garbage", {}]) {
      const result = evaluateGates(raw);
      expect(result.shipTrained).toBe(false);
      expect(result.stopBecauseBasePasses).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
    expect(parseEvaluationInput("garbage").ok).toBe(false);
  });

  it("rejects missing rates and preference counts without rendering NaN", async () => {
    const data = await fixture();
    const missingRate = gateInput(data, data.scenarios.trainedPass!);
    const malformedBase = missingRate.metricsByModel.base as {
      validatorPass?: number;
      latencyMedianMs: number;
      distinct2: number;
    };
    malformedBase.validatorPass = undefined;
    malformedBase.latencyMedianMs = Number.NaN;
    malformedBase.distinct2 = Number.NaN;
    const missingWins = gateInput(data, data.scenarios.trainedPass!);
    (missingWins.humanPreference as { trainedWins?: number }).trainedWins =
      undefined;

    const rateResult = evaluateGates(missingRate);
    const winsResult = evaluateGates(missingWins);

    expect(rateResult).toMatchObject({
      shipTrained: false,
      stopBecauseBasePasses: false,
    });
    expect(rateResult.reasons.join(" ")).toContain(
      "metricsByModel.base.validatorPass",
    );
    expect(winsResult).toMatchObject({
      shipTrained: false,
      stopBecauseBasePasses: false,
    });
    expect(winsResult.reasons.join(" ")).toContain(
      "humanPreference.trainedWins",
    );
    expect(renderReport(missingRate.metricsByModel, rateResult)).not.toContain(
      "NaN",
    );
    const missingFull = gateInput(data, data.scenarios.trainedPass!);
    delete (
      missingFull.metricsByModel as EvaluationInput["metricsByModel"] & {
        trainedFull?: EvaluationInput["metricsByModel"]["trainedFull"];
      }
    ).trainedFull;
    const missingFullResult = evaluateGates(missingFull);
    expect(missingFullResult.shipTrained).toBe(false);
    expect(missingFullResult.stopBecauseBasePasses).toBe(false);
    expect(missingFullResult.reasons.join(" ")).toContain(
      "metricsByModel.trainedFull.validatorPass",
    );
    expect(
      renderReport(missingFull.metricsByModel, missingFullResult),
    ).not.toContain("NaN");
    for (const invalidRate of [Number.NaN, -0.01, 1.01]) {
      const invalid = gateInput(data, data.scenarios.trainedPass!);
      invalid.metricsByModel.trainedFull.validatorPass = invalidRate;
      const result = evaluateGates(invalid);
      expect(result.shipTrained).toBe(false);
      expect(result.stopBecauseBasePasses).toBe(false);
      expect(result.reasons.join(" ")).toContain(
        "metricsByModel.trainedFull.validatorPass",
      );
    }
  });

  it("handles exact and near gate boundaries consistently", async () => {
    const data = await fixture();
    const withRates = (
      base: number,
      trainedQ4: number,
      trainedQ8: number,
      trainedWins = 30,
      trainedFull = trainedQ4,
    ): EvaluationInput => ({
      metricsByModel: {
        ...data.metricsByModel,
        base: { ...data.metricsByModel.base, validatorPass: base },
        trainedFull: {
          ...data.metricsByModel.trainedFull,
          validatorPass: trainedFull,
        },
        trainedQ4: {
          ...data.metricsByModel.trainedQ4,
          validatorPass: trainedQ4,
        },
        trainedQ8: {
          ...data.metricsByModel.trainedQ8,
          validatorPass: trainedQ8,
        },
      },
      humanPreference: { trainedWins, pairs: 50 },
    });

    expect(evaluateGates(withRates(0.8, 0.95, 0.95)).shipTrained).toBe(true);
    expect(
      evaluateGates(withRates(0.8, 0.950000002, 0.950000002)).shipTrained,
    ).toBe(true);
    const belowQ4PassRate = evaluateGates(withRates(0.79, 0.949999998, 0.95));
    expect(belowQ4PassRate.shipTrained).toBe(false);
    expect(belowQ4PassRate.reasons.join(" ")).toContain("Trained Q4 validator");
    const belowQ8PassRate = evaluateGates(withRates(0.79, 0.95, 0.949999998));
    expect(belowQ8PassRate.shipTrained).toBe(false);
    expect(belowQ8PassRate.reasons.join(" ")).toContain("Trained Q8 validator");
    expect(evaluateGates(withRates(0.799999998, 0.95, 0.95)).shipTrained).toBe(
      true,
    );
    const belowImprovement = evaluateGates(withRates(0.800000002, 0.95, 0.95));
    expect(belowImprovement.shipTrained).toBe(false);
    expect(belowImprovement.reasons.join(" ")).toContain(
      "15 percentage points",
    );

    expect(
      evaluateGates(withRates(0.79, 0.95, 0.95, 30, 0.98)).shipTrained,
    ).toBe(true);
    const beyondFullPrecisionGap = evaluateGates(
      withRates(0.79, 0.95, 0.95, 30, 0.980000002),
    );
    expect(beyondFullPrecisionGap.shipTrained).toBe(false);
    expect(beyondFullPrecisionGap.reasons.join(" ")).toContain(
      "within 3 percentage points of full precision",
    );

    expect(evaluateGates(withRates(0.9, 1, 1)).stopBecauseBasePasses).toBe(
      true,
    );
    expect(
      evaluateGates(withRates(0.899999998, 1, 1)).stopBecauseBasePasses,
    ).toBe(false);
    expect(
      evaluateGates(withRates(0.900000002, 1, 1)).stopBecauseBasePasses,
    ).toBe(true);

    expect(evaluateGates(withRates(0.79, 0.95, 0.95, 30)).shipTrained).toBe(
      true,
    );
    expect(evaluateGates(withRates(0.79, 0.95, 0.95, 29)).shipTrained).toBe(
      false,
    );
  });

  it("compares Q4 with full precision and does not gate the Q4-to-Q8 gap", async () => {
    const data = await fixture();
    const withModels = (
      trainedFull: number,
      trainedQ8: number,
    ): EvaluationInput => {
      const metricsByModel = {
        ...data.metricsByModel,
        base: { ...data.metricsByModel.base, validatorPass: 0.79 },
        trainedQ4: { ...data.metricsByModel.trainedQ4, validatorPass: 0.95 },
        trainedQ8: {
          ...data.metricsByModel.trainedQ8,
          validatorPass: trainedQ8,
        },
        trainedFull: {
          ...data.metricsByModel.trainedQ4,
          validatorPass: trainedFull,
        },
      };
      return {
        metricsByModel,
        humanPreference: { trainedWins: 30, pairs: 50 },
      } as unknown as EvaluationInput;
    };

    expect(evaluateGates(withModels(0.98, 0.95)).shipTrained).toBe(true);
    const outsideFullPrecisionGap = evaluateGates(withModels(0.980000002, 1));
    expect(outsideFullPrecisionGap.shipTrained).toBe(false);
    expect(outsideFullPrecisionGap.reasons.join(" ")).toMatch(
      /full precision/i,
    );
    expect(evaluateGates(withModels(0.96, 1)).shipTrained).toBe(true);
  });

  it("stops when the base model already passes and evaluates the remaining fixture gates", async () => {
    const data = await fixture();
    const basePass = evaluateGates(gateInput(data, data.scenarios.basePass!));
    const trainedPass = evaluateGates(
      gateInput(data, data.scenarios.trainedPass!),
    );
    const fullPrecisionGap = evaluateGates(
      gateInput(data, data.scenarios.fullPrecisionGap!),
    );
    const lowPreference = evaluateGates(
      gateInput(data, data.scenarios.lowPreference!),
    );

    expect(basePass).toMatchObject({
      shipTrained: false,
      stopBecauseBasePasses: true,
    });
    expect(trainedPass).toMatchObject({
      shipTrained: true,
      stopBecauseBasePasses: false,
    });
    expect(fullPrecisionGap.shipTrained).toBe(false);
    expect(fullPrecisionGap.reasons.join(" ")).toMatch(/full precision/i);
    expect(lowPreference.shipTrained).toBe(false);
    expect(lowPreference.reasons.join(" ")).toMatch(/preference/i);
  });
});

describe("renderReport", () => {
  it("renders every metric for base, Q4, Q8, and teacher", async () => {
    const data = await fixture();
    const gates = evaluateGates({
      metricsByModel: data.metricsByModel,
      humanPreference: data.humanPreference,
    });
    const report = renderReport(data.metricsByModel, gates);

    for (const model of [
      "base",
      "trainedFull",
      "trainedQ4",
      "trainedQ8",
      "teacher",
    ]) {
      expect(report).toContain(model);
    }
    for (const metric of [
      "Validator pass",
      "Wording pass",
      "Median latency",
      "p95 latency",
      "Mean chars",
      "Distinct-2",
    ]) {
      expect(report).toContain(metric);
    }
    expect(report).toContain("Gate decision");
  });
});
