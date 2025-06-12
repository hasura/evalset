# Latency Test Results

## Overall Statistics

- **Total Questions**: 1
- **Total Runs**: 2
- **Successful Runs**: 1
- **Failed Runs**: 1
- **Success Rate**: 50.0%

## Accuracy Results

### Per-Environment Statistics

#### production

- **Total Runs**: 0
- **Fuzzy Match Passed**: 0 (NaN%)
- **Data Accuracy Passed**: 0 (NaN%)
- **Both Passed**: 0 (NaN%)

#### production(6fafc431d2)

- **Total Runs**: 1
- **Fuzzy Match Passed**: 1 (100.0%)
- **Data Accuracy Passed**: 1 (100.0%)
- **Both Passed**: 1 (100.0%)

### Per-Environment Accuracy

| Environment            | Fuzzy Match Pass Rate | Data Accuracy Pass Rate | Combined Pass Rate |
| ---------------------- | --------------------- | ----------------------- | ------------------ |
| production             | NaN%                  | NaN%                    | NaN%               |
| production(6fafc431d2) | 100.0%                | 100.0%                  | 100.0%             |

## Environment Performance Summary

### Overall Latency Comparison

| Environment            | Average Response Time | Min Response Time | Max Response Time | Performance Rank |
| ---------------------- | --------------------- | ----------------- | ----------------- | ---------------- |
| production             | NaNs                  | Infinitys         | -Infinitys        | 1 (Fastest)      |
| production(6fafc431d2) | 26.64s                | 26.64s            | 26.64s            | 2 (Slowest)      |

### Component Breakdown (Average)

| Environment            | SQL Engine | LLM Streaming | Pure Code Execution | Total  |
| ---------------------- | ---------- | ------------- | ------------------- | ------ |
| production             | NaNs       | NaNs          | NaNs                | NaNs   |
| production(6fafc431d2) | 0.03s      | 13.10s        | 13.50s              | 26.64s |

### Performance Analysis

- **production** is NaNs (NaN%) faster than production(6fafc431d2) on average

## Per-Question Analysis

### Question: Who participated in Wealthfront's Series B round?

#### Environment Comparison

| Environment            | Average | Min    | Max    | Success Rate | Avg Iterations | Min Iterations | Max Iterations |
| ---------------------- | ------- | ------ | ------ | ------------ | -------------- | -------------- | -------------- |
| production             | 0.00s   | 0.00s  | 0.00s  | 0.0%         | 0.0            | 0              | 0              |
| production(6fafc431d2) | 26.64s  | 26.64s | 26.64s | 100.0%       | 2.0            | 2              | 2              |

#### Accuracy Results

| Environment            | Fuzzy Match | Data Accuracy | Combined Result |
| ---------------------- | ----------- | ------------- | --------------- |
| production             | NaN%        | NaN%          | NaN%            |
| production(6fafc431d2) | 100.0%      | 100.0%        | 100.0%          |

#### Component Breakdown

| Environment            | SQL Engine | LLM Streaming | Pure Code Execution |
| ---------------------- | ---------- | ------------- | ------------------- |
| production             | 0.00s      | 0.00s         | 0.00s               |
| production(6fafc431d2) | 0.03s      | 13.10s        | 13.50s              |

#### Individual Run Details

##### production

No runs available for this environment.

##### production(6fafc431d2)

###### Run 1

**Performance Metrics:**

- **Duration:** 26.64s
- **Iterations:** 2
- **Timestamp:** 6/8/2025, 12:35:18 PM
- **Trace ID:** `9fcb103eb4172f99bc1b36811b1675f1`

**Component Breakdown:**

- **SQL Engine:** 0.03s
- **LLM Streaming:** 13.10s
- **Pure Code Execution:** 13.50s

**Accuracy Results:**

- **Fuzzy Match:** ✅ (Score: 1)
- **Data Accuracy:** ✅ (Score: 1)

**LLM Response:**
**Artifacts Generated:**

###### Artifact 1: Wealthfront Series B Investors ($20M, 2013-03)

- **Type:** table
- **Identifier:** `wealthfront_series_b_investors`
- **Data:** Table with 13 rows

**Table Contents:**
| Investor Name (text) | Investor Type (enum_value) | Lead Investor (boolean) | Investment Date (text) |
| --- | --- | --- | --- |
| Greylock Partners | investment fund | true | 2013-03 |
| Index Ventures | investment fund | true | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |
| Duff Ackerman and Goodrich | investment fund | false | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |
| [REDACTED] | angel | false | 2013-03 |

_... and 3 more rows_

###### Artifact 2: Citations

- **Type:** text
- **Identifier:** `citations_wealthfront_series_b`
- **Content:** [REDACTED-CITATION-DATA]

**Thread ID:** `b21ee69a-ed30-447e-b1fc-83678c825d7d`
