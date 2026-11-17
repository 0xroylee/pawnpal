export type AnalysisConfig = {
  preAnalyze: { depth: number; movetimeMs?: number; multiPv: number };
  preAnalyzeCapMs: number;
  minReuseDepth: number;
  fallback: { depth: number; multiPv: number };
  postAnalyze: { depth: number; movetimeMs?: number; multiPv: number };
  gradeTimeoutMs: number;
};

export type GradeConfig = {
  thresholds: {
    best: number;
    good: number;
    inaccuracy: number;
    mistake: number;
  };
  winningCap: number;
  onlyMoveGap: number;
  analysis: AnalysisConfig;
};

export const defaultGradeConfig: GradeConfig = {
  thresholds: {
    best: 2,
    good: 5,
    inaccuracy: 10,
    mistake: 15,
  },
  winningCap: 85,
  onlyMoveGap: 15,
  analysis: {
    preAnalyze: { depth: 14, movetimeMs: 1500, multiPv: 3 },
    preAnalyzeCapMs: 1500,
    minReuseDepth: 8,
    fallback: { depth: 8, multiPv: 3 },
    postAnalyze: { depth: 12, movetimeMs: 3000, multiPv: 2 },
    gradeTimeoutMs: 1500,
  },
};
