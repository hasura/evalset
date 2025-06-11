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
| Environment | Fuzzy Match Pass Rate | Data Accuracy Pass Rate | Combined Pass Rate |
|------------|----------------------|------------------------|-------------------|
| production | NaN% | NaN% | NaN% |
| production(6fafc431d2) | 100.0% | 100.0% | 100.0% |

## Environment Performance Summary

### Overall Latency Comparison
| Environment | Average Response Time | Min Response Time | Max Response Time | Performance Rank |
|------------|----------------------|------------------|------------------|-----------------|
| production | NaNs | Infinitys | -Infinitys | 1 (Fastest) |
| production(6fafc431d2) | 26.64s | 26.64s | 26.64s | 2 (Slowest) |

### Component Breakdown (Average)
| Environment | SQL Engine | LLM Streaming | Pure Code Execution | Total |
|------------|-----------|--------------|---------------------|-------|
| production | NaNs | NaNs | NaNs | NaNs |
| production(6fafc431d2) | 0.03s | 13.10s | 13.50s | 26.64s |

### Performance Analysis
- **production** is NaNs (NaN%) faster than production(6fafc431d2) on average

## Per-Question Analysis

### Question: Who participated in Wealthfront's Series B round?

#### Environment Comparison

| Environment | Average | Min    | Max    | Success Rate | Avg Iterations | Min Iterations | Max Iterations |
|------------|---------|--------|--------|--------------|----------------|----------------|----------------|
| production | 0.00s | 0.00s | 0.00s | 0.0% | 0.0 | 0 | 0 |
| production(6fafc431d2) | 26.64s | 26.64s | 26.64s | 100.0% | 2.0 | 2 | 2 |

#### Accuracy Results
| Environment | Fuzzy Match | Data Accuracy | Combined Result |
|------------|-------------|---------------|----------------|
| production | NaN% | NaN% | NaN% |
| production(6fafc431d2) | 100.0% | 100.0% | 100.0% |



#### Component Breakdown

| Environment | SQL Engine | LLM Streaming | Pure Code Execution |
|------------|-----------|--------------|---------------------|
| production | 0.00s | 0.00s | 0.00s |
| production(6fafc431d2) | 0.03s | 13.10s | 13.50s |
