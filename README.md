# PromptQL Latency and Accuracy Testing Suite

[![GitHub](https://img.shields.io/github/license/hasura/evalset)](https://github.com/hasura/evalset)
[![GitHub](https://img.shields.io/github/stars/hasura/evalset)](https://github.com/hasura/evalset)

## Overview

This testing suite provides comprehensive performance and accuracy testing for PromptQL across different environments. It measures latency, component performance, and answer accuracy using Patronus judges.

## Features

- **Multi-environment Testing**: Run tests across dev, staging, and production environments
- **Latency Measurement**: Track response times and component-level performance
- **Accuracy Evaluation**: Assess answer quality using Patronus judges (optional)
- **Detailed Reporting**: Generate comprehensive markdown reports
- **Parallel Execution**: Run multiple test iterations concurrently
- **Memory-Efficient Processing**: Incremental results writing with 80-98% memory reduction
- **Debug Mode**: Enable detailed logging for troubleshooting

## Prerequisites

- Node.js environment
- Required environment variables:

  ```bash
  # Development Environment
  PROMPTQL_API_KEY_DEV="your-dev-api-key"
  PROMPTQL_DATA_PLANE_URL_DEV="https://promptql.dev.private-ddn.hasura.app/api/query"
  DDN_URL_DEV="https://app-dev.private-ddn.hasura.app/v1/sql"
  DDN_AUTH_TOKEN_DEV="your-dev-ddn-auth-token"
  HASURA_PAT_DEV="your-dev-hasura-pat"

  # Staging Environment
  PROMPTQL_API_KEY_STAGING="your-staging-api-key"
  PROMPTQL_DATA_PLANE_URL_STAGING="https://promptql.staging.private-ddn.hasura.app/api/query"
  DDN_URL_STAGING="https://app-staging.private-ddn.hasura.app/v1/sql"
  DDN_AUTH_TOKEN_STAGING="your-staging-ddn-auth-token"
  HASURA_PAT_STAGING="your-staging-hasura-pat"

  # Production Environment
  PROMPTQL_API_KEY_PRODUCTION="your-production-api-key"
  PROMPTQL_DATA_PLANE_URL_PRODUCTION="https://promptql.production.private-ddn.hasura.app/api/query"
  DDN_URL_PRODUCTION="https://app-production.private-ddn.hasura.app/v1/sql"
  DDN_AUTH_TOKEN_PRODUCTION="your-production-ddn-auth-token"
  HASURA_PAT_PRODUCTION="your-production-hasura-pat"

  # Patronus Configuration (optional, shared across environments)
  # If not provided, the script will run latency tests only
  PATRONUS_BASE_URL="patronus-backend.internal.example.com"
  PATRONUS_API_KEY="your-patronus-api-key"
  PATRONUS_PROJECT_ID="your-patronus-project-id"

  # Database Configuration (optional)
  # Specifies the database type for query ID extraction from spans
  # If set to "redshift", will look for "redshift.query_id" in span attributes
  # If not set or empty, will look for ".query_id" in span attributes
  DATABASE="redshift"
  ```

  > **Important**: Each environment now has its own set of authentication tokens and URLs for better security and isolation.

  Note: The URLs follow these patterns:
  - PromptQL Data Plane URLs: `https://promptql.{env}.private-ddn.hasura.app/api/query`
  - DDN URLs: `https://app-{env}.private-ddn.hasura.app/v1/sql`
  - Patronus URL: `patronus-backend.internal.{domain}`

  > **Note**: Patronus configuration is optional. If not provided, the script will automatically run latency tests only. You can also explicitly skip accuracy testing using the `--skip-accuracy` flag even if Patronus configuration is available.

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the tests directory with the required environment variables (see `.env.example` for the template)

## Migration from Previous Configuration

If you're upgrading from a previous version that used shared authentication tokens, you'll need to update your `.env` file:

### Old Configuration (deprecated):
```bash
# Shared across environments
DDN_AUTH_TOKEN="your-shared-token"
HASURA_PAT="your-shared-pat"
PROMPTQL_DATA_PLANE_URL_MAIN="..."
PROMPTQL_DATA_PLANE_URL_SECONDARY="..."
```

### New Configuration (required):
```bash
# Each environment has its own tokens and URLs
DDN_AUTH_TOKEN_DEV="your-dev-token"
DDN_AUTH_TOKEN_STAGING="your-staging-token"
DDN_AUTH_TOKEN_PRODUCTION="your-production-token"

HASURA_PAT_DEV="your-dev-pat"
HASURA_PAT_STAGING="your-staging-pat"
HASURA_PAT_PRODUCTION="your-production-pat"

PROMPTQL_DATA_PLANE_URL_DEV="..."
PROMPTQL_DATA_PLANE_URL_STAGING="..."
PROMPTQL_DATA_PLANE_URL_PRODUCTION="..."
```

**Benefits of the new configuration:**
- **Improved Security**: Each environment has isolated credentials
- **Better Access Control**: Different permissions per environment
- **Clearer Configuration**: Environment-specific naming prevents confusion
- **Safer Testing**: No risk of accidentally using production tokens in development

## Local Development

For local development and testing, you can use `npm test` with the same command line options:

```bash
# Run a single question test
npm test -- --env "dev" --runs 1 --questions 1

# Run multiple questions
npm test -- --env "dev" --runs 3 --questions 1,2,3

# Run all questions
npm test -- --env "dev" --runs 3 --all
```

This is equivalent to using `npx promptql-latency-test` but runs directly from your local development environment. The `--` after `npm test` is required to pass arguments to the underlying script.

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
   ├── dev.txt                    # Base environment prompt
   ├── dev(8a0a69ff30).txt       # Build-specific prompt (optional)
   ├── staging.txt               # Base environment prompt
   ├── production.txt            # Base environment prompt
   └── marketing.txt             # Alternative system prompt
   ```

3. **Build-Specific Prompts**:

   - When testing against a specific build version (e.g., `dev(8a0a69ff30)`), the system will:
     1. First look for a build-specific prompt (e.g., `dev(8a0a69ff30).txt`)
     2. If not found, fall back to the base environment prompt (e.g., `dev.txt`)
     3. Fail if neither exists
   - This allows for testing different prompt configurations across builds while maintaining a default fallback
   - Example usage:

     ```bash
     # Will use dev(8a0a69ff30).txt if it exists, otherwise fall back to dev.txt
     npx promptql-latency-test --env dev(8a0a69ff30) --runs 3 --all

     # Will use dev.txt
     npx promptql-latency-test --env dev --runs 3 --all
     ```

4. **Best Practices**:
   - Keep system prompts focused and specific to the domain
   - Include clear instructions about data sources and response formats
   - Document any special handling for specific types of questions
   - Include citation and artifact formatting requirements
   - Specify how to handle edge cases and uncertainties
   - Use build-specific prompts for testing prompt variations without affecting the base environment

### Environment Configuration

1. **Environment File**:

   - Create a single `.env` file in the root directory
   - This file contains all environment variables for all environments (dev, staging, production)
   - The script will automatically use the correct variables based on the `--env` flag

2. **Required Variables**:

   ```bash
   # Development Environment
   PROMPTQL_API_KEY_DEV="your-dev-api-key"
   PROMPTQL_DATA_PLANE_URL_DEV="https://promptql.dev.private-ddn.hasura.app/api/query"
   DDN_URL_DEV="https://app-dev.private-ddn.hasura.app/v1/sql"
   DDN_AUTH_TOKEN_DEV="your-dev-ddn-auth-token"
   HASURA_PAT_DEV="your-dev-hasura-pat"

   # Staging Environment
   PROMPTQL_API_KEY_STAGING="your-staging-api-key"
   PROMPTQL_DATA_PLANE_URL_STAGING="https://promptql.staging.private-ddn.hasura.app/api/query"
   DDN_URL_STAGING="https://app-staging.private-ddn.hasura.app/v1/sql"
   DDN_AUTH_TOKEN_STAGING="your-staging-ddn-auth-token"
   HASURA_PAT_STAGING="your-staging-hasura-pat"

   # Production Environment
   PROMPTQL_API_KEY_PRODUCTION="your-production-api-key"
   PROMPTQL_DATA_PLANE_URL_PRODUCTION="https://promptql.production.private-ddn.hasura.app/api/query"
   DDN_URL_PRODUCTION="https://app-production.private-ddn.hasura.app/v1/sql"
   DDN_AUTH_TOKEN_PRODUCTION="your-production-ddn-auth-token"
   HASURA_PAT_PRODUCTION="your-production-hasura-pat"

   # Patronus Configuration (optional, shared across environments)
   # If not provided, the script will run latency tests only
   PATRONUS_BASE_URL="patronus-backend.internal.example.com"
   PATRONUS_API_KEY="your-patronus-api-key"
   PATRONUS_PROJECT_ID="your-patronus-project-id"

   # Database Configuration (optional)
   # Specifies the database type for query ID extraction from spans
   # If set to "redshift", will look for "redshift.query_id" in span attributes
   # If not set or empty, will look for ".query_id" in span attributes
   DATABASE="redshift"
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
npx promptql-latency-test --env dev,staging,production --runs 3 --all
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
- `--skip-accuracy`: Skip accuracy testing even if Patronus configuration is available (default: false)
- `--keep-incremental`: Keep incremental result files after completion (default: false - files are cleaned up)

### Incremental Results Writing and Cleanup

The testing suite uses incremental writing to minimize memory usage during large test runs. Each question's results are written to disk immediately after completion, rather than storing everything in memory.

#### How It Works

- **Incremental Files**: Each question's results are saved to individual files (e.g., `latency_results_dev_0.json`, `latency_results_dev_1.json`)
- **Memory Efficiency**: Only the current question's data is kept in memory at any time
- **Final Output**: A combined results file is still generated with the same structure as before
- **Automatic Cleanup**: By default, incremental files are automatically removed after successful completion

#### Cleanup Behavior

**Default Behavior (Cleanup Enabled):**
```bash
npx promptql-latency-test --env dev --runs 1 --all
```
- Incremental files are automatically cleaned up after completion
- Console output shows cleanup progress:
```
✅ Results saved: latency_results.json and latency_results_summary.md
🗑️  Cleaned up incremental file: latency_results_dev_0.json
🗑️  Cleaned up incremental file: latency_results_dev_1.json
🧹 Cleanup complete: Removed 2 incremental files
```

**Preserve Incremental Files:**
```bash
npx promptql-latency-test --env dev --runs 1 --all --keep-incremental
```
- Incremental files are preserved for debugging or analysis
- Console output indicates files are preserved:
```
✅ Results saved: latency_results.json and latency_results_summary.md
📁 Incremental files preserved: Use --keep-incremental=false to enable cleanup
```

#### Memory Usage Benefits

- **Small Tests**: 80% memory reduction
- **Large Tests**: 98% memory reduction (e.g., 50 questions, 10 runs each)
- **Scalability**: Peak memory usage remains constant regardless of test size

### Usage Examples

Run all questions:

```bash
# Run against default environments
npx promptql-latency-test --env dev,staging,production --runs 3 --all

# Run against specific build version
npx promptql-latency-test --env production(3a3d68b8c8) --runs 3 --all

# Run against multiple environments including specific build
npx promptql-latency-test --env dev,staging,production(3a3d68b8c8) --runs 3 --all
```

Run specific questions:

```bash
# Run single question by number
npx promptql-latency-test --env dev --runs 1 --questions 1

# Run multiple questions by number
npx promptql-latency-test --env dev,staging --runs 3 --questions 1,2,3

# Run a range of questions
npx promptql-latency-test --env dev,staging --runs 3 --questions 1-3

# Run questions by company name or keyword
npx promptql-latency-test --env dev,staging --runs 3 --questions "WorkPass"
npx promptql-latency-test --env dev,staging --runs 3 --questions "founders"
```

### Accuracy Testing

The script supports three modes for accuracy testing:

1. **Full Accuracy Testing** (default):

   ```bash
   npx promptql-latency-test --env dev --runs 3 --all
   ```

   - Runs both latency and accuracy tests
   - Requires Patronus configuration in `.env`

2. **Skip Accuracy Testing**:

   ```bash
   npx promptql-latency-test --env dev --runs 3 --all --skip-accuracy
   ```

   - Runs only latency tests
   - Ignores Patronus configuration even if available

3. **Automatic Mode**:
   ```bash
   npx promptql-latency-test --env dev --runs 3 --all
   ```
   - If Patronus configuration is missing, automatically skips accuracy testing
   - If Patronus configuration is present, runs accuracy tests
   - No need to specify any flags

### Example Output

Here's an example of running a single question test:

```bash
$ npx promptql-latency-test --questions 1 --runs 1 --env dev

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
DEBUG=true npx promptql-latency-test --env dev --runs 3 --all
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
  query_ids: string[];
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

## Version History

### v1.0.10 - Memory-Efficient Processing

**New Features:**
- **Incremental Results Writing**: Each question's results are written to disk immediately after completion
- **Memory Usage Reduction**: 80-98% reduction in peak memory usage for large test suites
- **Automatic Cleanup**: Incremental files are automatically cleaned up after successful completion
- **Flexible Cleanup Control**: `--keep-incremental` flag to preserve files for debugging

**Technical Improvements:**
- **Scalability**: Peak memory usage remains constant regardless of test size
- **Reliability**: Results are persisted incrementally, reducing risk of data loss
- **Backward Compatibility**: Same output format maintained

**CLI Options:**
- `--keep-incremental`: Keep incremental result files after completion (default: false)

### v1.0.9 and Earlier

- Multi-environment testing support
- Latency and accuracy measurement
- Parallel execution capabilities
- Comprehensive reporting
- Debug mode functionality
