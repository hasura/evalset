# PromptQL Latency and Accuracy Testing Suite

[![GitHub](https://img.shields.io/github/license/hasura/evalset)](https://github.com/hasura/evalset)
[![GitHub](https://img.shields.io/github/stars/hasura/evalset)](https://github.com/hasura/evalset)

## Overview

This testing suite provides comprehensive performance and accuracy testing for PromptQL across different environments. It measures latency, component performance, and answer accuracy using Patronus judges.

## Features

- **Multi-environment Testing**: Run tests across dev, staging, and production environments
- **Latency Measurement**: Track response times and component-level performance
- **Accuracy Evaluation**: Assess answer quality using Patronus judges
- **Detailed Reporting**: Generate comprehensive markdown reports
- **Parallel Execution**: Run multiple test iterations concurrently
- **Debug Mode**: Enable detailed logging for troubleshooting

## Prerequisites

- Node.js environment
- Required environment variables:

  ```bash
  # PromptQL Configuration
  PROMPTQL_API_KEY_DEV="your-dev-api-key"
  PROMPTQL_API_KEY_STAGING="your-staging-api-key"
  PROMPTQL_API_KEY_PRODUCTION="your-production-api-key"

  # Data Plane URLs
  PROMPTQL_DATA_PLANE_URL_MAIN="https://promptql.main-instance.private-ddn.hasura.app/api/query"
  PROMPTQL_DATA_PLANE_URL_SECONDARY="https://promptql.secondary-instance.private-ddn.hasura.app/api/query"

  # DDN URLs
  DDN_URL_DEV="https://app-dev.private-ddn.hasura.app/v1/sql"
  DDN_URL_STAGING="https://app-staging.private-ddn.hasura.app/v1/sql"
  DDN_URL_PRODUCTION="https://app-production.private-ddn.hasura.app/v1/sql"

  # Authentication
  DDN_AUTH_TOKEN="your-ddn-auth-token"
  HASURA_PAT="your-hasura-pat"

  # Patronus Configuration (for accuracy evaluation)
  PATRONUS_BASE_URL="patronus-backend.internal.example.com"
  PATRONUS_API_KEY="your-patronus-api-key"
  PATRONUS_PROJECT_ID="your-patronus-project-id"
  ```

  Note: The URLs follow these patterns:

  - PromptQL Data Plane URLs: `https://promptql.{instance}.private-ddn.hasura.app/api/query`
  - DDN URLs: `https://app-{env}.private-ddn.hasura.app/v1/sql`
  - Patronus URL: `patronus-backend.internal.{domain}`

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the tests directory with the required environment variables

## System Prompt and Environment Setup

### System Prompt Configuration

1. **System Prompt Files**:

   - Create system prompt files in the `system_prompts` directory
   - Each file should contain domain-specific instructions that define the AI's role and behavior
   - You can create multiple system prompt files to test different configurations
   - Example structure:

     ```
     ## Domain specific instructions

     [Your specific instructions here]
     ```

2. **Directory Structure**:

   ```
   system_prompts/
   ├── dev.txt           # Main system prompt
   ├── dev.txt.example   # Example system prompt
   └── marketing.txt     # Alternative system prompt
   ```

3. **Best Practices**:
   - Keep system prompts focused and specific to the domain
   - Include clear instructions about data sources and response formats
   - Document any special handling for specific types of questions
   - Include citation and artifact formatting requirements
   - Specify how to handle edge cases and uncertainties

### Environment Configuration

1. **Environment File**:

   - Create a single `.env` file in the root directory
   - This file contains all environment variables for all environments (dev, staging, production)
   - The script will automatically use the correct variables based on the `--env` flag

2. **Required Variables**:

   ```bash
   # PromptQL Configuration
   PROMPTQL_API_KEY_DEV="your-dev-api-key"
   PROMPTQL_API_KEY_STAGING="your-staging-api-key"
   PROMPTQL_API_KEY_PRODUCTION="your-production-api-key"

   # Data Plane URLs
   PROMPTQL_DATA_PLANE_URL_MAIN="https://promptql.main-instance.private-ddn.hasura.app/api/query"
   PROMPTQL_DATA_PLANE_URL_SECONDARY="https://promptql.secondary-instance.private-ddn.hasura.app/api/query"

   # DDN URLs
   DDN_URL_DEV="https://app-dev.private-ddn.hasura.app/v1/sql"
   DDN_URL_STAGING="https://app-staging.private-ddn.hasura.app/v1/sql"
   DDN_URL_PRODUCTION="https://app-production.private-ddn.hasura.app/v1/sql"

   # Authentication
   DDN_AUTH_TOKEN="your-ddn-auth-token"
   HASURA_PAT="your-hasura-pat"

   # Patronus Configuration (for accuracy evaluation)
   PATRONUS_BASE_URL="patronus-backend.internal.example.com"
   PATRONUS_API_KEY="your-patronus-api-key"
   PATRONUS_PROJECT_ID="your-patronus-project-id"
   ```

3. **Environment Selection**:
   - Use the `--env` flag to specify which environment(s) to test against
   - You can test multiple environments in a single run
   - Example: `--env dev,staging,production`
   - You can also specify a specific build version: `--env production(3a3d68b8c8)`

### Evalset Configuration

1. **Test Questions**:

   - The `evalset.csv` file contains the test questions and gold answers
   - Each row should have:
     - `question`: The test question
     - `gold_answer`: The expected answer with artifacts and citations
   - Example format:

     ```
     question,gold_answer
     "What is love?","Baby don't hurt me

     Gold Artifacts: [{"id":"123","type":"websearch"}]
     ```

2. **Testing Different Configurations**:
   - You can test the same evalset with different system prompts
   - Compare results to see which prompt performs better
   - Use different environments to test against different data sources
   - Analyze which configuration produces the most accurate and consistent results

## Usage

### Basic Usage

```bash
npm test -- --env dev,staging,production --runs 3 --all
```

### Command Line Options

- `--env, -e`: Environment(s) to test (comma-separated)
  - Valid values: dev, staging, production
  - Can specify build version using parentheses: 'production(3a3d68b8c8)'
  - Examples: 'dev', 'staging,production', 'production(3a3d68b8c8)'
- `--runs, -r`: Number of runs per question (default: 3)
- `--questions, -q`: Questions to run. Can be:
  - A single number (e.g. `1`)
  - A comma-separated list (e.g. `1,2,3`)
  - A range (e.g. `1-3`)
  - A search string to match against questions (e.g. `"WorkPass"`)
- `--all, -a`: Test all available questions
- `--output`, `-o`: Output file for results (default: latency*results*[timestamp].json)
- `--concurrency`, `-c`: Maximum number of concurrent questions to run (default: 5)
- `--batch-size`, `-b`: Number of questions to process in each batch (default: 10)
- `--rate-limit`: Maximum requests per second (0 for no limit) (default: 0)
- `--batch-delay`: Delay in seconds between batches of runs (default: 0)
- `--num-batches`: Number of batches to run (default: 1)

### Usage Examples

Run all questions:

```bash
# Run against default environments
npm test -- --env dev,staging,production --runs 3 --all

# Run against specific build version
npm test -- --env production(3a3d68b8c8) --runs 3 --all

# Run against multiple environments including specific build
npm test -- --env dev,staging,production(3a3d68b8c8) --runs 3 --all
```

Run specific questions:

```bash
# Run single question by number
npm test -- --env dev --runs 1 --questions 1

# Run multiple questions by number
npm test -- --env dev,staging --runs 3 --questions 1,2,3

# Run a range of questions
npm test -- --env dev,staging --runs 3 --questions 1-3

# Run questions by company name or keyword
npm test -- --env dev,staging --runs 3 --questions "WorkPass"
npm test -- --env dev,staging --runs 3 --questions "founders"
```

### Example Output

Here's an example of running a single question test:

```bash
$ npm test -- --questions 1 --runs 1 --env dev

Total questions available: 19
Requested questions: 1
Requested runs per question: 1
Will run 1 question:
  1. [Question text]

ℹ️  Info: Starting latency tests with 1 question, 1 concurrent requests per batch, 1 batch (1 total runs) across environments: dev

ℹ️  Info: Running 1 concurrent requests per batch

================================================================================
🤔 Question: [Question text]

ℹ️  Info: Starting batch 1/1 with 1 concurrent runs
dev Q1/1 R1/1 [Progress bar]
ℹ️  Info: Evaluating accuracy for question: [Question text]
dev Q1/1 R1/1 ⏱️ 22.30s
  SQL: 0.25s | LLM: 16.17s | Code: 5.87s

📊 Results for dev
⏱️  Performance: 22.30s avg (22.30s min, 22.30s max)
🔧 Components: SQL 0.25s | LLM 16.17s | Code 5.87s
✅ Accuracy: Fuzzy 100% | Data 100% | Combined 100%

================================================================================
🏁 Final Summary
================================================================================

📈 Overall: 1/0 runs (1 questions, 1 runs each)

💾 Memory Usage: Initial: 132MB, Current: 129MB, Peak: 133MB

🌍 Environment Comparison
--------------------------------------------------------------------------------

❓ Question: [Question text]
1. dev 🏆 22.30s (100% success) [Fuzzy: 100%, Data: 100%, Combined: 100%]

✅ Results saved: latency_results_[timestamp].json and latency_results_[timestamp]_summary.md
```

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm test -- --env dev --runs 3 --all
```

## Test Results

The script generates two output files:

1. JSON file with raw results
2. Markdown summary with formatted analysis

### Results Include

1. **Overall Statistics**

   - Total questions and runs
   - Success/failure rates
   - Performance metrics

2. **Accuracy Results**

   - Per-environment statistics
   - Fuzzy match and data accuracy scores
   - Combined pass rates
   - Detailed failure analysis

3. **Performance Analysis**

   - Environment comparison
   - Component breakdown (SQL, LLM, Code)
   - Latency metrics
   - Performance rankings

4. **Per-Question Analysis**
   - Environment-specific results
   - Accuracy metrics
   - Component performance
   - Failure details

## Data Structure

### Accuracy Results

```typescript
interface AccuracyResult {
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
```

### Run Results

```typescript
interface RunResult {
  duration: number | null;
  timestamp: string;
  run_number: number;
  trace_id: string | null;
  iterations: number | null;
  span_durations: {
    sql_engine_execute_sql: number | null;
    call_llm_streaming: number | null;
    pure_code_execution: number | null;
  };
  accuracy: AccuracyResult | null;
  raw_request: any;
  raw_response: any;
}
```

## Error Handling

The script includes comprehensive error handling:

- Retry logic for API calls
- Detailed error logging
- Graceful fallbacks for missing data
- Environment validation
- Configuration checks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
