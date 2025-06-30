// Accuracy reporting interfaces
export interface AccuracyResult {
  fuzzy_match: {
    passed: boolean;
    score: number;
    details: string;
  };
  data_accuracy: {
    passed: boolean;
    score: number;
    details: string;
  };
}

// Individual execution details with timing information
export interface ExecutionDetail {
  content: string;
  duration_seconds: number;
}

// Span information interface for code execution traces
export interface SpanInformation {
  sql_engine_execute_sql: ExecutionDetail[] | null;
  code_executed: ExecutionDetail[] | null;
  error: ExecutionDetail[] | null;
}
