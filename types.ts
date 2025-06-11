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
