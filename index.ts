import * as dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { parse } from "csv-parse/sync";
import { AccuracyResult } from "./types";
import { generateMarkdownSummary } from "./generateMarkdownSummary";

// Clean error handling
process.on("uncaughtException", (error) => {
  if (error.message.startsWith("\nError: Missing required configuration")) {
    console.error(error.message);
  } else {
    console.error("\nError:", error.message);
  }
  process.exit(1);
});

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env") });

// Set debug mode
const isDebug = process.env.DEBUG === "true";
if (isDebug) {
  console.log("Debug mode enabled");
}

// Function to parse question ranges
function parseQuestionRanges(input: string): number[] {
  const ranges = input.split(",").map((r) => r.trim());
  const result = new Set<number>();

  for (const range of ranges) {
    if (range.includes("-")) {
      const [start, end] = range.split("-").map(Number);
      if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
        throw new Error(
          `Invalid range: ${range}. Start and end must be positive numbers.`
        );
      }
      if (start > end) {
        throw new Error(
          `Invalid range: ${range}. Start must be less than or equal to end.`
        );
      }
      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      const num = Number(range);
      if (isNaN(num) || num <= 0) {
        throw new Error(
          `Invalid question number: ${range}. Must be a positive number.`
        );
      }
      result.add(num);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

// Function to find best matching questions
function findMatchingQuestions(query: string, questions: Question[]): number[] {
  const queryLower = query.toLowerCase();

  // Find all questions that contain the query as a substring
  const matches = questions
    .map((q, index) => ({
      index: index + 1, // +1 because questions are 1-indexed
      question: q.question.toLowerCase(),
    }))
    .filter((q) => q.question.includes(queryLower))
    .map((q) => q.index);

  return matches;
}

// Function to parse question ranges or strings
function parseQuestionSelection(
  input: string,
  allQuestions: Question[]
): number[] {
  // Check if input is a number or range
  if (/^[\d,-]+$/.test(input)) {
    return parseQuestionRanges(input);
  }

  // Otherwise treat as a search string
  return findMatchingQuestions(input, allQuestions);
}

// Parse command line arguments
interface CliArgs {
  env: Array<{
    baseEnv: string;
    version: string | undefined;
    displayName: string;
  }>;
  runs: number;
  questions?: string;
  all?: boolean;
  output: string;
  concurrency: number;
  "batch-size": number;
  "rate-limit": number;
  "batch-delay": number;
  "num-batches": number;
  "skip-accuracy": boolean;
  // [key: string]: unknown;
}

const argv = yargs(hideBin(process.argv))
  .option("env", {
    alias: "e",
    type: "string",
    description:
      "Environment(s) to run against (dev, staging, production). Multiple environments can be specified as comma-separated values. " +
      "You can also specify a version for an environment using parentheses, e.g. 'production,production(3a3d68b8c8)'.",
    coerce: (arg: string) => {
      const envs = arg.split(",").map((e) => e.trim());
      const validEnvs = ["dev", "staging", "production"];

      // Parse each environment string
      return envs.map((envStr) => {
        // Check if it's a versioned environment (e.g. "production(3a3d68b8c8)")
        const match = envStr.match(/^([^(]+)(?:\(([^)]+)\))?$/);
        if (!match) {
          throw new Error(`Invalid environment format: ${envStr}`);
        }

        const [_, baseEnv, version] = match;
        if (!validEnvs.includes(baseEnv)) {
          throw new Error(
            `Invalid environment: ${baseEnv}. Valid environments are: ${validEnvs.join(
              ", "
            )}`
          );
        }

        return {
          baseEnv,
          version,
          displayName: version ? `${baseEnv}(${version})` : baseEnv,
        };
      });
    },
    demandOption: true,
  })
  .option("runs", {
    alias: "r",
    type: "number",
    description: "Number of concurrent requests per batch",
    default: 3,
  })
  .option("questions", {
    alias: "q",
    type: "string",
    description:
      "Questions to run. Can be:\n" +
      "- A single number (e.g. 1)\n" +
      "- A comma-separated list (e.g. 1,2,3)\n" +
      "- A range (e.g. 1-3)\n" +
      '- A search string to match against questions (e.g. "WorkPass")',
    conflicts: "all",
  })
  .option("all", {
    alias: "a",
    type: "boolean",
    description: "Run all questions",
    conflicts: "questions",
  })
  .option("output", {
    alias: "o",
    type: "string",
    description: "Output file for results",
    default: `latency_results_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`,
  })
  .option("concurrency", {
    alias: "c",
    type: "number",
    description: "Maximum number of concurrent questions to run",
    default: 5,
  })
  .option("batch-size", {
    alias: "b",
    type: "number",
    description: "Number of questions to process in each batch",
    default: 10,
  })
  .option("rate-limit", {
    type: "number",
    description: "Maximum requests per second (0 for no limit)",
    default: 0,
  })
  .option("batch-delay", {
    type: "number",
    description: "Delay in seconds between batches of runs",
    default: 0,
  })
  .option("num-batches", {
    type: "number",
    description: "Number of batches to run",
    default: 1,
  })
  .option("skip-accuracy", {
    type: "boolean",
    description:
      "Skip accuracy testing even if Patronus configuration is available",
    default: false,
  })
  .check((argv) => {
    if (!argv.questions && !argv.all) {
      throw new Error("You must specify either --questions or --all");
    }
    return true;
  })
  .help()
  .alias("help", "h")
  .parseSync() as CliArgs;

// Get environment configuration
const getEnvironmentConfig = (env: {
  baseEnv: string;
  version: string | undefined;
  displayName: string;
}) => {
  const configs = {
    dev: {
      PROMPTQL_URL: process.env.PROMPTQL_DATA_PLANE_URL_SECONDARY,
      PROMPTQL_API_KEY: process.env.PROMPTQL_API_KEY_DEV,
      DDN_URL: process.env.DDN_URL_DEV,
      PATRONUS_BASE_URL: process.env.PATRONUS_BASE_URL,
      PATRONUS_API_KEY: process.env.PATRONUS_API_KEY,
      PATRONUS_PROJECT_ID: process.env.PATRONUS_PROJECT_ID,
    },
    staging: {
      PROMPTQL_URL: process.env.PROMPTQL_DATA_PLANE_URL_MAIN,
      PROMPTQL_API_KEY: process.env.PROMPTQL_API_KEY_STAGING,
      DDN_URL: process.env.DDN_URL_STAGING,
      PATRONUS_BASE_URL: process.env.PATRONUS_BASE_URL,
      PATRONUS_API_KEY: process.env.PATRONUS_API_KEY,
      PATRONUS_PROJECT_ID: process.env.PATRONUS_PROJECT_ID,
    },
    production: {
      PROMPTQL_URL: process.env.PROMPTQL_DATA_PLANE_URL_MAIN,
      PROMPTQL_API_KEY: process.env.PROMPTQL_API_KEY_PRODUCTION,
      DDN_URL: process.env.DDN_URL_PRODUCTION,
      PATRONUS_BASE_URL: process.env.PATRONUS_BASE_URL,
      PATRONUS_API_KEY: process.env.PATRONUS_API_KEY,
      PATRONUS_PROJECT_ID: process.env.PATRONUS_PROJECT_ID,
    },
  } as const;

  const config = configs[env.baseEnv as keyof typeof configs];
  if (!config) {
    throw new Error(`Invalid environment: ${env.baseEnv}`);
  }

  // If there's a version, construct the build URL from the project URL
  if (env.version) {
    const baseUrl = config.DDN_URL;
    if (!baseUrl) {
      throw new Error(`DDN_URL not configured for ${env.baseEnv}`);
    }

    try {
      // Parse the URL to get its components
      const url = new URL(baseUrl);
      const hostname = url.hostname;

      // Split the hostname into parts
      const parts = hostname.split(".");

      // Insert the build ID after the first part of the hostname
      // e.g., ur-production -> ur-production-3a3d68b8c8
      parts[0] = `${parts[0]}-${env.version}`;

      // Reconstruct the URL with the new hostname
      url.hostname = parts.join(".");

      return {
        ...config,
        DDN_URL: url.toString(),
      };
    } catch (error) {
      throw new Error(`Invalid DDN_URL format: ${baseUrl}`);
    }
  }

  return config;
};

// Validate all environments
const validateAllEnvironments = (
  envs: Array<{
    baseEnv: string;
    version: string | undefined;
    displayName: string;
  }>
) => {
  const allMissingVars: { [env: string]: string[] } = {};

  for (const env of envs) {
    const missingVars = [];

    // Check for required environment variables based on the environment
    if (env.baseEnv === "dev") {
      if (!process.env.PROMPTQL_DATA_PLANE_URL_SECONDARY)
        missingVars.push("PROMPTQL_DATA_PLANE_URL_SECONDARY");
      if (!process.env.PROMPTQL_API_KEY_DEV)
        missingVars.push("PROMPTQL_API_KEY_DEV");
      if (!process.env.DDN_URL_DEV) missingVars.push("DDN_URL_DEV");
    } else if (env.baseEnv === "staging") {
      if (!process.env.PROMPTQL_DATA_PLANE_URL_MAIN)
        missingVars.push("PROMPTQL_DATA_PLANE_URL_MAIN");
      if (!process.env.PROMPTQL_API_KEY_STAGING)
        missingVars.push("PROMPTQL_API_KEY_STAGING");
      if (!process.env.DDN_URL_STAGING) missingVars.push("DDN_URL_STAGING");
    } else if (env.baseEnv === "production") {
      if (!process.env.PROMPTQL_DATA_PLANE_URL_MAIN)
        missingVars.push("PROMPTQL_DATA_PLANE_URL_MAIN");
      if (!process.env.PROMPTQL_API_KEY_PRODUCTION)
        missingVars.push("PROMPTQL_API_KEY_PRODUCTION");
      if (!process.env.DDN_URL_PRODUCTION)
        missingVars.push("DDN_URL_PRODUCTION");
    }

    // Check for common required variables
    if (!process.env.DDN_AUTH_TOKEN) missingVars.push("DDN_AUTH_TOKEN");
    if (!process.env.HASURA_PAT) missingVars.push("HASURA_PAT");

    // Check for base environment prompt file
    const envPromptPath = path.join(
      process.cwd(),
      "system_prompts",
      `${env.baseEnv}.txt`
    );
    if (!fs.existsSync(envPromptPath)) {
      missingVars.push(`system_prompts/${env.baseEnv}.txt`);
    }

    if (missingVars.length > 0) {
      allMissingVars[env.displayName] = missingVars;
    }
  }

  if (Object.keys(allMissingVars).length > 0) {
    let errorMessage = "\nError: Missing required configuration:\n";

    for (const [env, vars] of Object.entries(allMissingVars)) {
      errorMessage += `\n${env}:\n`;
      for (const varName of vars) {
        errorMessage += `  - ${varName}\n`;
      }
    }

    errorMessage +=
      "\nPlease ensure all required environment variables and system prompts are set.";
    throw new Error(errorMessage);
  }
};

// Replace the old validation with the new one
const envConfigs = argv.env.map((env) => ({
  name: env.displayName,
  config: getEnvironmentConfig(env),
}));

// Validate all environments at once
validateAllEnvironments(argv.env);

const NUM_RUNS = argv.runs;
const RUN_ALL = argv.all;

// Read questions from evalset.csv
interface Question {
  question: string;
  gold_answer: string; // Changed from any to string
}

const allQuestions: Question[] = parse(
  fs.readFileSync(path.join(process.cwd(), "evalset.csv"), "utf-8"),
  {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }
).map((row: { question: string; gold_answer: string }) => {
  const { question, gold_answer: goldAnswer } = row;

  return {
    question,
    gold_answer: goldAnswer, // No JSON parsing, just use the string directly
  };
});

console.log(`Total questions available: ${allQuestions.length}`);
console.log(`Requested questions: ${RUN_ALL ? "all" : argv.questions}`);
console.log(`Requested runs per question: ${NUM_RUNS}`);

// Validate and select questions
let questions: typeof allQuestions;
if (RUN_ALL) {
  questions = allQuestions;
} else {
  if (!argv.questions) {
    throw new Error("Questions argument is required when not using --all");
  }

  const questionNumbers = parseQuestionSelection(argv.questions, allQuestions);

  if (questionNumbers.length === 0) {
    throw new Error(`No matching questions found for: ${argv.questions}`);
  }

  const maxQuestionNumber = Math.max(...questionNumbers);
  if (maxQuestionNumber > allQuestions.length) {
    throw new Error(
      `Requested question ${maxQuestionNumber} but only ${allQuestions.length} available`
    );
  }

  questions = questionNumbers.map((num) => allQuestions[num - 1]);

  // Log matched questions if using string search
  if (!/^[\d,-]+$/.test(argv.questions)) {
    console.log(`\nMatched questions:`);
    questions.forEach((q, i) => {
      console.log(`  ${questionNumbers[i]}. ${q.question}`);
    });
  }
}

// Validate number of runs
if (NUM_RUNS <= 0) {
  throw new Error("Number of runs must be greater than 0");
}

console.log(
  `Will run ${questions.length} question${questions.length === 1 ? "" : "s"}:`
);
questions.forEach((q: Question, i: number) =>
  console.log(`  ${i + 1}. ${q.question}`)
);

// Create a logger class to manage output
class Logger {
  private static instance: Logger;
  private currentRun: number | null = null;
  private currentQuestionIndex: number | null = null;
  private totalQuestions: number;
  private totalRuns: number;
  private lastProgressUpdate: number = 0;
  private runColors: chalk.Chalk[] = [
    chalk.blue,
    chalk.magenta,
    chalk.cyan,
    chalk.green,
    chalk.yellow,
    chalk.red,
    chalk.white,
    chalk.gray,
  ];

  private constructor(totalQuestions: number, totalRuns: number) {
    this.totalQuestions = totalQuestions;
    this.totalRuns = totalRuns;
  }

  static getInstance(totalQuestions: number, totalRuns: number): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(totalQuestions, totalRuns);
    }
    return Logger.instance;
  }

  private formatQuestionHeader(questionIndex: number): string {
    return chalk.bold.cyan(`Q${questionIndex + 1}/${this.totalQuestions}`);
  }

  private formatRunHeader(runNumber: number): string {
    const color = this.runColors[runNumber % this.runColors.length];
    return color.bold(`R${runNumber + 1}/${this.totalRuns}`);
  }

  private formatEnvironmentHeader(env: string): string {
    return chalk.bold.magenta(env);
  }

  private formatProgressBar(
    progress: number,
    total: number,
    width: number = 20
  ): string {
    const filled = Math.round((progress / total) * width);
    const empty = width - filled;
    const color = this.runColors[progress % this.runColors.length];
    return color(
      `[${"█".repeat(filled)}${"░".repeat(empty)}] ${Math.round(
        (progress / total) * 100
      )}%`
    );
  }

  startQuestion(question: string, questionIndex: number) {
    this.currentQuestionIndex = questionIndex;
    console.log(
      `\n${chalk.bold.cyan("=".repeat(80))}\n${chalk.bold.cyan(
        "🤔 Question:"
      )} ${chalk.yellow(question)}`
    );
  }

  startRun(runNumber: number, env: string) {
    this.currentRun = runNumber;
    process.stdout.write(
      `\r${this.formatEnvironmentHeader(env)} ${this.formatQuestionHeader(
        this.currentQuestionIndex!
      )} ${this.formatRunHeader(runNumber)} `
    );
  }

  endRun(
    duration: number,
    spanDurations: {
      sql_engine_execute_sql: number | null;
      call_llm_streaming: number | null;
      pure_code_execution: number | null;
    }
  ) {
    const color =
      duration < 1 ? chalk.green : duration < 2 ? chalk.yellow : chalk.red;
    console.log(`\r${color(`${duration.toFixed(2)}s`)}`);

    // Log span durations in a single line
    const spans = [];
    if (spanDurations.sql_engine_execute_sql !== null) {
      spans.push(
        `SQL: ${chalk.cyan(
          `${spanDurations.sql_engine_execute_sql.toFixed(2)}s`
        )}`
      );
    }
    if (spanDurations.call_llm_streaming !== null) {
      spans.push(
        `LLM: ${chalk.cyan(`${spanDurations.call_llm_streaming.toFixed(2)}s`)}`
      );
    }
    if (spanDurations.pure_code_execution !== null) {
      spans.push(
        `Code: ${chalk.cyan(
          `${spanDurations.pure_code_execution.toFixed(2)}s`
        )}`
      );
    }
    if (spans.length > 0) {
      console.log(`  ${spans.join(" | ")}`);
    }
  }

  logResults(
    durations: number[],
    spanDurations: {
      sql_engine_execute_sql: number[];
      call_llm_streaming: number[];
      pure_code_execution: number[];
    },
    env: string,
    accuracyResults?: Array<AccuracyResult | null>
  ) {
    const hasValidDurations = durations.length > 0;
    const average = hasValidDurations
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : null;
    const min = hasValidDurations ? Math.min(...durations) : null;
    const max = hasValidDurations ? Math.max(...durations) : null;

    console.log(`\n${chalk.bold.cyan("📊 Results for")} ${chalk.magenta(env)}`);

    // Performance summary in a single line
    if (hasValidDurations) {
      console.log(
        `${chalk.bold("⏱️  Performance:")} ${chalk.cyan(
          `${average!.toFixed(2)}s`
        )} avg ` +
          `(${chalk.green(`${min!.toFixed(2)}s`)} min, ${chalk.red(
            `${max!.toFixed(2)}s`
          )} max)`
      );
    }

    // Component breakdown in a single line
    const avgSQL =
      spanDurations.sql_engine_execute_sql.reduce((sum, d) => sum + d, 0) /
      spanDurations.sql_engine_execute_sql.length;
    const avgLLM =
      spanDurations.call_llm_streaming.reduce((sum, d) => sum + d, 0) /
      spanDurations.call_llm_streaming.length;
    const avgCode =
      spanDurations.pure_code_execution.reduce((sum, d) => sum + d, 0) /
      spanDurations.pure_code_execution.length;
    console.log(
      `${chalk.bold("🔧 Components:")} SQL ${chalk.cyan(
        `${avgSQL.toFixed(2)}s`
      )} | ` +
        `LLM ${chalk.cyan(`${avgLLM.toFixed(2)}s`)} | ` +
        `Code ${chalk.cyan(`${avgCode.toFixed(2)}s`)}`
    );

    // Accuracy summary in a single line
    if (accuracyResults && accuracyResults.length > 0) {
      const validAccuracyResults = accuracyResults.filter(
        (a): a is AccuracyResult =>
          a !== null &&
          typeof a === "object" &&
          "fuzzy_match" in a &&
          "data_accuracy" in a
      );

      if (validAccuracyResults.length > 0) {
        const fuzzyMatchPassRate =
          validAccuracyResults.filter((r) => r.fuzzy_match.passed).length /
          validAccuracyResults.length;
        const dataAccuracyPassRate =
          validAccuracyResults.filter((r) => r.data_accuracy.passed).length /
          validAccuracyResults.length;
        const combinedPassRate =
          validAccuracyResults.filter(
            (r) => r.fuzzy_match.passed && r.data_accuracy.passed
          ).length / validAccuracyResults.length;

        console.log(
          `${chalk.bold("✅ Accuracy:")} Fuzzy ${chalk.green(
            `${(fuzzyMatchPassRate * 100).toFixed(0)}%`
          )} | ` +
            `Data ${chalk.green(
              `${(dataAccuracyPassRate * 100).toFixed(0)}%`
            )} | ` +
            `Combined ${chalk.green(`${(combinedPassRate * 100).toFixed(0)}%`)}`
        );
      }
    }
  }

  logError(message: string) {
    console.error(`\n${chalk.bold.red("❌ Error:")} ${message}`);
  }

  logInfo(message: string) {
    // Only log non-debug info messages
    if (!message.startsWith("DEBUG:") && !message.includes("Patronus judge")) {
      console.log(`\n${chalk.bold.blue("ℹ️  Info:")} ${message}`);
    } else if (isDebug) {
      // Show debug messages when debug mode is enabled
      console.log(`\n${chalk.bold.gray("🔍 Debug:")} ${message}`);
    }
  }

  logTraceInfo(traceId: string, env: string) {
    // Only log trace info in debug mode
    if (process.env.DEBUG === "true") {
      console.log(
        `${this.formatEnvironmentHeader(env)} ${chalk.bold.gray(
          "Trace:"
        )} ${chalk.dim(traceId)}`
      );
    }
  }

  logRetry(attempt: number, maxAttempts: number, env: string) {
    const now = Date.now();
    if (now - this.lastProgressUpdate < 500) {
      return;
    }
    this.lastProgressUpdate = now;

    process.stdout.write(
      `\r${this.formatEnvironmentHeader(env)} ${this.formatQuestionHeader(
        this.currentQuestionIndex!
      )} ${this.formatRunHeader(this.currentRun!)} ` +
        `${chalk.bold.yellow("⏳")} ${this.formatProgressBar(
          attempt,
          maxAttempts
        )}`
    );
  }

  logDuration(duration: number, env: string) {
    const color =
      duration < 1 ? chalk.green : duration < 2 ? chalk.yellow : chalk.red;
    console.log(
      `\r${this.formatEnvironmentHeader(env)} ${this.formatQuestionHeader(
        this.currentQuestionIndex!
      )} ${this.formatRunHeader(this.currentRun!)} ` +
        `${chalk.bold.gray("⏱️")} ${color(`${duration.toFixed(2)}s`)}`
    );
  }
}

async function getTrace(traceId: string, env: string) {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);
  logger.logTraceInfo(traceId, env);

  const maxRetries = 10;
  const baseDelay = 1000; // 1 second base delay
  const maxDelay = 30000; // 30 seconds maximum delay

  // Get the DDN URL from the environment config
  const envConfig = envConfigs.find((e) => e.name === env);
  if (!envConfig) {
    throw new Error(`Invalid environment: ${env}`);
  }
  const hostHeader =
    envConfig.config.DDN_URL?.replace(/^https?:\/\/([^\/]+).*$/, "$1") || "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Format: YYYY-MM-DD HH:mm:ss
    const formatDate = (date: Date) => {
      return date.toISOString().replace("T", " ").split(".")[0];
    };

    const response = await axios.post(
      "https://cp-ddn.pro.hasura.io/supergraph-prod/graphql",
      {
        query: `query getPromptQLRemoteTraceWithTimeStamp($TraceId: String!, $GreaterThanTimestamp: DateTime64_9_!, $LesserThanTimeStamp: DateTime64_9_!) {
          otel_traces: get_promptql_trace(
            where: {Timestamp: {_gte: $GreaterThanTimestamp, _lte: $LesserThanTimeStamp}}
            order_by: {Timestamp: asc}
            args: {trace_id: $TraceId}
          ) {
            Duration
            Events_Attributes
            Events_Name
            Events_Timestamp
            Links_Attributes
            Links_SpanId
            Links_TraceId
            Links_TraceState
            ParentSpanId
            ResourceAttributes
            ScopeName
            ScopeVersion
            ServiceName
            SpanAttributes
            SpanId
            SpanKind
            SpanName
            StatusCode
            StatusMessage
            Timestamp
            TraceId
            TraceState
          }
        }`,
        variables: {
          TraceId: traceId,
          GreaterThanTimestamp: formatDate(twoHoursAgo),
          LesserThanTimeStamp: formatDate(now),
        },
        operationName: "getPromptQLRemoteTraceWithTimeStamp",
      },
      {
        headers: {
          accept: "application/graphql-response+json, application/json",
          "accept-language": "en-US,en;q=0.9,pt;q=0.8",
          "content-type": "application/json",
          authorization: `pat ${process.env.HASURA_PAT}`,
          "hasura-client-name": "hasura-console",
          origin: "https://promptql.console.hasura.io",
          priority: "u=1, i",
          referer: "https://promptql.console.hasura.io/",
          "sec-ch-ua":
            '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "x-telemetry-host-header": hostHeader,
        },
      }
    );

    // Check if we got any traces
    const traces = response.data.data.otel_traces;
    if (traces && traces.length > 0) {
      // Check if we have the POST:/query span
      const querySpan = traces.find((t: any) => t.SpanName === "POST:/query");
      if (querySpan) {
        return response;
      }
      // If we have traces but no POST:/query span yet, continue retrying
      if (attempt < maxRetries) {
        logger.logRetry(attempt, maxRetries, env);
        // Exponential backoff: 2^(attempt-1) * baseDelay, capped at maxDelay
        const delay = Math.min(Math.pow(2, attempt - 1) * baseDelay, maxDelay);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }

    // If no traces yet, wait and retry
    if (attempt < maxRetries) {
      logger.logRetry(attempt, maxRetries, env);
      // Exponential backoff: 2^(attempt-1) * baseDelay, capped at maxDelay
      const delay = Math.min(Math.pow(2, attempt - 1) * baseDelay, maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    "No traces found with POST:/query span after maximum retries for trace ID: " +
      traceId
  );
}

// Function to load system prompt with fallback
function loadSystemPrompt(env: {
  baseEnv: string;
  version: string | undefined;
  displayName: string;
}): string {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);

  // First try to load build-specific prompt if version exists
  if (env.version) {
    const buildPromptPath = path.join(
      process.cwd(),
      "system_prompts",
      `${env.displayName}.txt`
    );
    try {
      return fs.readFileSync(buildPromptPath, "utf-8").trim();
    } catch (error) {
      logger.logInfo(
        `No build-specific prompt found at ${buildPromptPath}, falling back to environment prompt`
      );
    }
  }

  // Try to load environment prompt
  const envPromptPath = path.join(
    process.cwd(),
    "system_prompts",
    `${env.baseEnv}.txt`
  );
  try {
    return fs.readFileSync(envPromptPath, "utf-8").trim();
  } catch (error) {
    logger.logError(
      `Error reading system prompt for ${env.displayName}: ${error}`
    );
    throw new Error(`Failed to read system prompt from ${envPromptPath}`);
  }
}

async function callPromptQL(
  question: string,
  envConfig: { name: string; config: ReturnType<typeof getEnvironmentConfig> },
  goldAnswer: any
): Promise<{
  success: boolean;
  duration: number | null;
  traceId: string | null;
  spanDurations: {
    sql_engine_execute_sql: number | null;
    call_llm_streaming: number | null;
    pure_code_execution: number | null;
  };
  spanInformation: {
    sql_engine_execute_sql: string | null;
    code_executed: string | null;
    error: string | null;
  };
  iterations: number | null;
  raw_request: any;
  raw_response: any;
  accuracy: AccuracyResult | null;
}> {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);

  // Load system prompt with fallback
  const systemPrompt = loadSystemPrompt({
    baseEnv: envConfig.name.split("(")[0],
    version: envConfig.name.match(/\(([^)]+)\)/)?.[1],
    displayName: envConfig.name,
  });

  const requestData = {
    version: "v1",
    promptql_api_key: envConfig.config.PROMPTQL_API_KEY,
    llm: {
      provider: "hasura",
    },
    ddn: {
      url: envConfig.config.DDN_URL,
      headers: {
        authorization: `Bearer ${process.env.DDN_AUTH_TOKEN}`,
      },
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    system_instructions: systemPrompt,
    interactions: [
      {
        user_message: {
          text: question,
        },
      },
    ],
    stream: false,
  };

  try {
    console.log("Sending question:", question);

    const response = await axios.post(
      envConfig.config.PROMPTQL_URL!,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Get trace ID from traceparent header (format: 00-traceId-spanId-01)
    const traceparent = response.headers["traceparent"];
    const traceId = traceparent?.split("-")[1] ?? null;

    if (!traceId) {
      logger.logError("No trace ID found in traceparent header");
      return {
        success: false,
        duration: null,
        traceId: null,
        spanDurations: {
          sql_engine_execute_sql: null,
          call_llm_streaming: null,
          pure_code_execution: null,
        },
        spanInformation: {
          sql_engine_execute_sql: null,
          code_executed: null,
          error: null,
        },
        iterations: null,
        raw_request: requestData,
        raw_response: response.data,
        accuracy: null,
      };
    }

    // Get trace data with retries
    try {
      const traceResponse = await getTrace(traceId, envConfig.name);

      // Calculate total duration from trace
      const traces = traceResponse.data.data.otel_traces;
      if (traces && traces.length > 0) {
        // Find the span with name 'POST:/query'
        const querySpan = traces.find((t: any) => t.SpanName === "POST:/query");
        const sqlEngineSpan = traces.find(
          (t: any) => t.SpanName === "sql_engine_execute_sql"
        );
        const llmStreamingSpan = traces.find(
          (t: any) => t.SpanName === "call_llm_streaming"
        );
        const iterations = traces.filter(
          (t: any) => t.SpanName === "promptql_exec_code_streaming"
        ).length;

        if (querySpan) {
          const durationNs = parseInt(querySpan.Duration);
          const durationS = durationNs / 1_000_000_000; // Convert nanoseconds to seconds

          const sqlEngineTime = sqlEngineSpan
            ? parseInt(sqlEngineSpan.Duration) / 1_000_000_000
            : null;
          const llmStreamingTime = llmStreamingSpan
            ? parseInt(llmStreamingSpan.Duration) / 1_000_000_000
            : null;
          const pureCodeTime =
            durationS - (sqlEngineTime || 0) - (llmStreamingTime || 0);
          const sqlEngineSpanCodeString = sqlEngineSpan
            ? sqlEngineSpan.SpanAttributes["sql"]
            : null;
          const codeAttribute =
            iterations > 0
              ? traces.find(
                  (t: any) => t.SpanName === "promptql_exec_code_streaming"
                )?.Events_Attributes["code"]
              : null;
          const errorAttribute =
            iterations > 0
              ? traces.find(
                  (t: any) => t.SpanName === "promptql_exec_code_streaming"
                )?.Events_Attributes["error"]
              : null;

          const spanDurations = {
            sql_engine_execute_sql: sqlEngineTime,
            call_llm_streaming: llmStreamingTime,
            pure_code_execution: pureCodeTime,
          };

          const spanInformation = {
            sql_engine_execute_sql: sqlEngineSpanCodeString,
            code_executed: codeAttribute,
            error: errorAttribute,
          };

          // Evaluate accuracy only if not skipped and Patronus config is available
          let accuracy = null;
          if (
            !argv["skip-accuracy"] &&
            envConfig.config.PATRONUS_BASE_URL &&
            envConfig.config.PATRONUS_API_KEY &&
            envConfig.config.PATRONUS_PROJECT_ID
          ) {
            accuracy = await evaluateAccuracy(
              question,
              response.data,
              goldAnswer,
              envConfig
            );
          }

          logger.logDuration(durationS, envConfig.name);
          return {
            success: true,
            duration: durationS,
            traceId,
            spanDurations,
            spanInformation,
            iterations,
            raw_request: requestData,
            raw_response: response.data,
            accuracy,
          };
        } else {
          logger.logError("Could not find POST:/query span in trace");
          return {
            success: true,
            duration: null,
            traceId,
            spanDurations: {
              sql_engine_execute_sql: null,
              call_llm_streaming: null,
              pure_code_execution: null,
            },
            spanInformation: {
              sql_engine_execute_sql: null,
              code_executed: null,
              error: null,
            },
            iterations: null,
            raw_request: requestData,
            raw_response: response.data,
            accuracy: null,
          };
        }
      } else {
        logger.logError("No trace data found");
        return {
          success: true,
          duration: null,
          traceId,
          spanDurations: {
            sql_engine_execute_sql: null,
            call_llm_streaming: null,
            pure_code_execution: null,
          },
          spanInformation: {
            sql_engine_execute_sql: null,
            code_executed: null,
            error: null,
          },
          iterations: null,
          raw_request: requestData,
          raw_response: response.data,
          accuracy: null,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.logError(`Error getting trace: ${errorMessage}`);
      return {
        success: true,
        duration: null,
        traceId,
        spanDurations: {
          sql_engine_execute_sql: null,
          call_llm_streaming: null,
          pure_code_execution: null,
        },
        spanInformation: {
          sql_engine_execute_sql: null,
          code_executed: null,
          error: null,
        },
        iterations: null,
        raw_request: requestData,
        raw_response: response.data,
        accuracy: null,
      };
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.logError(
        `Error details: ${JSON.stringify({
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        })}`
      );
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.logError(`Error: ${errorMessage}`);
    }
    return {
      success: false,
      duration: null,
      traceId: null,
      spanDurations: {
        sql_engine_execute_sql: null,
        call_llm_streaming: null,
        pure_code_execution: null,
      },
      spanInformation: {
        sql_engine_execute_sql: null,
        code_executed: null,
        error: null,
      },
      iterations: null,
      raw_request: requestData,
      raw_response: axios.isAxiosError(error)
        ? error.response?.data || null
        : null,
      accuracy: null,
    };
  }
}

async function runQuestionTests(
  question: string,
  runNumber: number,
  envConfig: { name: string; config: ReturnType<typeof getEnvironmentConfig> },
  goldAnswer: any
): Promise<{
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
  span_information: {
    sql_engine_execute_sql: string | null;
    code_executed: string | null;
    error: string | null;
  };
  accuracy: AccuracyResult | null;
  raw_request: any;
  raw_response: any;
} | null> {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);
  logger.startRun(runNumber, envConfig.name);

  const startTime = new Date();
  const result = await callPromptQL(question, envConfig, goldAnswer);

  if (result.success) {
    if (result.duration !== null) {
      logger.endRun(result.duration, result.spanDurations);

      return {
        duration: result.duration,
        timestamp: startTime.toISOString(),
        run_number: runNumber + 1,
        trace_id: result.traceId,
        iterations: result.iterations,
        span_durations: result.spanDurations,
        span_information: result.spanInformation,
        accuracy: result.accuracy,
        raw_request: result.raw_request,
        raw_response: result.raw_response,
      };
    }
    return null;
  }
  return null;
}

interface QuestionData {
  runs: Array<{
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
    span_information: {
      sql_engine_execute_sql: string | null;
    };
    accuracy: AccuracyResult | null;
    raw_request: any;
    raw_response: any;
  }>;
  average: number;
  min: number;
  max: number;
  successful_runs: number;
  failed_runs: number;
  average_iterations: number;
  min_iterations: number;
  max_iterations: number;
  span_averages: {
    sql_engine_execute_sql: number;
    call_llm_streaming: number;
    pure_code_execution: number;
  };
  span_mins: {
    sql_engine_execute_sql: number;
    call_llm_streaming: number;
    pure_code_execution: number;
  };
  span_maxs: {
    sql_engine_execute_sql: number;
    call_llm_streaming: number;
    pure_code_execution: number;
  };
}

// Rate limiter implementation
class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private requestsPerSecond: number;

  constructor(requestsPerSecond: number) {
    this.requestsPerSecond = requestsPerSecond;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.requestsPerSecond <= 0) {
      return fn();
    }

    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - timeSinceLastRequest)
      );
    }

    const next = this.queue.shift();
    if (next) {
      this.lastRequestTime = Date.now();
      await next();
    }

    this.processQueue();
  }
}

// Batch processor implementation
class BatchProcessor {
  private concurrency: number;
  private batchSize: number;
  private rateLimiter: RateLimiter;

  constructor(
    concurrency: number,
    batchSize: number,
    requestsPerSecond: number
  ) {
    this.concurrency = concurrency;
    this.batchSize = batchSize;
    this.rateLimiter = new RateLimiter(requestsPerSecond);
  }

  async processBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    const batches = this.createBatches(items);

    for (const batch of batches) {
      const batchResults = await this.processBatch(batch, processor);
      results.push(...batchResults);
    }

    return results;
  }

  private createBatches<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }

  private async processBatch<T, R>(
    batch: T[],
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    const chunks = this.createChunks(batch);
    const results: R[] = [];

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((item) => this.rateLimiter.enqueue(() => processor(item)))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private createChunks<T>(items: T[]): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += this.concurrency) {
      chunks.push(items.slice(i, i + this.concurrency));
    }
    return chunks;
  }
}

// Memory monitoring utility
class MemoryMonitor {
  private initialMemory: number;
  private peakMemory: number;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initialMemory = process.memoryUsage().heapUsed;
    this.peakMemory = this.initialMemory;
  }

  start(intervalMs: number = 1000) {
    this.checkInterval = setInterval(() => {
      const currentMemory = process.memoryUsage().heapUsed;
      this.peakMemory = Math.max(this.peakMemory, currentMemory);

      const usedMB = Math.round(currentMemory / 1024 / 1024);
      const peakMB = Math.round(this.peakMemory / 1024 / 1024);

      if (usedMB > 1000) {
        // Alert if using more than 1GB
        console.warn(`⚠️ High memory usage: ${usedMB}MB (Peak: ${peakMB}MB)`);
      }
    }, intervalMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getStats() {
    const currentMemory = process.memoryUsage().heapUsed;
    return {
      initialMB: Math.round(this.initialMemory / 1024 / 1024),
      currentMB: Math.round(currentMemory / 1024 / 1024),
      peakMB: Math.round(this.peakMemory / 1024 / 1024),
    };
  }
}

async function runLatencyTests() {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);
  const memoryMonitor = new MemoryMonitor();
  const batchProcessor = new BatchProcessor(
    argv.concurrency,
    argv["batch-size"],
    argv["rate-limit"]
  );

  // Log accuracy testing status
  if (argv["skip-accuracy"]) {
    logger.logInfo(
      "Accuracy testing is disabled (--skip-accuracy flag is set)"
    );
  } else if (
    !process.env.PATRONUS_BASE_URL ||
    !process.env.PATRONUS_API_KEY ||
    !process.env.PATRONUS_PROJECT_ID
  ) {
    logger.logInfo(
      "Accuracy testing is disabled (Patronus configuration is not available)"
    );
  } else {
    logger.logInfo(
      "Accuracy testing is enabled (Patronus configuration is available)"
    );
  }

  const totalRuns = NUM_RUNS * argv["num-batches"];

  const results: {
    metadata: {
      timestamp: string;
      num_runs: number;
      runs_per_batch: number;
      total_questions: number;
      successful_runs: number;
      failed_runs: number;
      memory_stats?: {
        initialMB: number;
        currentMB: number;
        peakMB: number;
      };
      batch_info?: {
        num_batches: number;
        batch_delay: number;
      };
    };
    environments: {
      [env: string]: {
        ddn_url: string;
        questions: {
          [question: string]: QuestionData;
        };
      };
    };
  } = {
    metadata: {
      timestamp: new Date().toISOString(),
      num_runs: totalRuns,
      runs_per_batch: NUM_RUNS,
      total_questions: questions.length,
      successful_runs: 0,
      failed_runs: 0,
      batch_info: {
        num_batches: argv["num-batches"],
        batch_delay: argv["batch-delay"],
      },
    },
    environments: {},
  };

  logger.logInfo(
    `Starting latency tests with ${questions.length} question${
      questions.length === 1 ? "" : "s"
    }, ${NUM_RUNS} concurrent requests per batch, ${argv["num-batches"]} batch${
      argv["num-batches"] === 1 ? "" : "es"
    } (${totalRuns} total runs) across environments: ${envConfigs
      .map((e) => e.name)
      .join(", ")}`
  );

  if (questions.length > 1) {
    logger.logInfo(
      `Concurrency settings: ${argv.concurrency} concurrent questions, ${
        argv["batch-size"]
      } questions per batch${
        argv["rate-limit"] > 0
          ? `, ${argv["rate-limit"]} requests/second rate limit`
          : ""
      }`
    );
  } else {
    logger.logInfo(
      `Running ${NUM_RUNS} concurrent requests per batch${
        argv["batch-delay"] > 0
          ? ` with ${argv["batch-delay"]} second${
              argv["batch-delay"] === 1 ? "" : "s"
            } delay between batches`
          : ""
      }${
        argv["rate-limit"] > 0
          ? ` and ${argv["rate-limit"]} requests/second rate limit`
          : ""
      }`
    );
  }

  // Start memory monitoring
  memoryMonitor.start();

  // Initialize results structure for each environment
  for (const envConfig of envConfigs) {
    results.environments[envConfig.name] = {
      ddn_url: envConfig.config.DDN_URL!,
      questions: {},
    };
  }

  // Process questions in batches
  const processQuestion = async (question: Question, questionIndex: number) => {
    logger.startQuestion(question.question, questionIndex);

    // Run tests for each environment
    for (const envConfig of envConfigs) {
      const allRuns: Array<{
        duration: number | null;
        timestamp: string;
        run_number: number;
        trace_id: string | null;
        iterations: number | null;
        span_information: {
          sql_engine_execute_sql: string | null;
          code_executed: string | null;
          error: string | null;
        };
        span_durations: {
          sql_engine_execute_sql: number | null;
          call_llm_streaming: number | null;
          pure_code_execution: number | null;
        };
        accuracy: AccuracyResult | null;
        raw_request: any;
        raw_response: any;
      } | null> = [];

      // Process runs in batches
      for (let batch = 0; batch < argv["num-batches"]; batch++) {
        const startRun = batch * NUM_RUNS;

        logger.logInfo(
          `Starting batch ${batch + 1}/${
            argv["num-batches"]
          } with ${NUM_RUNS} concurrent runs`
        );

        // Run this batch of runs in parallel
        const runs = await Promise.all(
          Array.from({ length: NUM_RUNS }, (_, j) =>
            runQuestionTests(
              question.question,
              startRun + j,
              envConfig,
              question.gold_answer
            )
          )
        );

        allRuns.push(...runs);

        // Add delay between batches if not the last batch
        if (batch < argv["num-batches"] - 1 && argv["batch-delay"] > 0) {
          logger.logInfo(
            `Waiting ${argv["batch-delay"]} second${
              argv["batch-delay"] === 1 ? "" : "s"
            } before next batch...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, argv["batch-delay"] * 1000)
          );
        }
      }

      // Filter out null results and calculate statistics
      const validRuns = allRuns.filter(
        (run): run is NonNullable<typeof run> => run !== null
      );

      const successfulRuns = validRuns.length;
      const failedRuns = NUM_RUNS - successfulRuns;
      results.metadata.successful_runs += successfulRuns;
      results.metadata.failed_runs += failedRuns;

      if (validRuns.length > 0) {
        const durations = validRuns
          .map((r) => r.duration)
          .filter((d): d is number => d !== null);
        const iterations = validRuns
          .map((r) => r.iterations)
          .filter((i): i is number => i !== null);
        const average =
          durations.length > 0
            ? durations.reduce((sum, duration) => sum + duration, 0) /
              durations.length
            : 0;
        const min = durations.length > 0 ? Math.min(...durations) : 0;
        const max = durations.length > 0 ? Math.max(...durations) : 0;
        const averageIterations =
          iterations.length > 0
            ? iterations.reduce((sum, i) => sum + i, 0) / iterations.length
            : 0;
        const minIterations =
          iterations.length > 0 ? Math.min(...iterations) : 0;
        const maxIterations =
          iterations.length > 0 ? Math.max(...iterations) : 0;

        // Calculate span statistics
        const sqlEngineDurations = validRuns
          .map((r) => r.span_durations.sql_engine_execute_sql)
          .filter((d): d is number => d !== null);
        const llmStreamingDurations = validRuns
          .map((r) => r.span_durations.call_llm_streaming)
          .filter((d): d is number => d !== null);
        const pureCodeDurations = validRuns
          .map((r) => r.span_durations.pure_code_execution)
          .filter((d): d is number => d !== null);

        const spanAverages = {
          sql_engine_execute_sql:
            sqlEngineDurations.length > 0
              ? sqlEngineDurations.reduce((sum, d) => sum + d, 0) /
                sqlEngineDurations.length
              : 0,
          call_llm_streaming:
            llmStreamingDurations.length > 0
              ? llmStreamingDurations.reduce((sum, d) => sum + d, 0) /
                llmStreamingDurations.length
              : 0,
          pure_code_execution:
            pureCodeDurations.length > 0
              ? pureCodeDurations.reduce((sum, d) => sum + d, 0) /
                pureCodeDurations.length
              : 0,
        };

        const spanMins = {
          sql_engine_execute_sql:
            sqlEngineDurations.length > 0 ? Math.min(...sqlEngineDurations) : 0,
          call_llm_streaming:
            llmStreamingDurations.length > 0
              ? Math.min(...llmStreamingDurations)
              : 0,
          pure_code_execution:
            pureCodeDurations.length > 0 ? Math.min(...pureCodeDurations) : 0,
        };

        const spanMaxs = {
          sql_engine_execute_sql:
            sqlEngineDurations.length > 0 ? Math.max(...sqlEngineDurations) : 0,
          call_llm_streaming:
            llmStreamingDurations.length > 0
              ? Math.max(...llmStreamingDurations)
              : 0,
          pure_code_execution:
            pureCodeDurations.length > 0 ? Math.max(...pureCodeDurations) : 0,
        };

        logger.logResults(
          durations,
          {
            sql_engine_execute_sql: sqlEngineDurations,
            call_llm_streaming: llmStreamingDurations,
            pure_code_execution: pureCodeDurations,
          },
          envConfig.name,
          validRuns
            .map((run) => run.accuracy)
            .filter((a): a is AccuracyResult => a !== null)
        );

        results.environments[envConfig.name].questions[question.question] = {
          runs: validRuns,
          average,
          min,
          max,
          average_iterations: averageIterations,
          min_iterations: minIterations,
          max_iterations: maxIterations,
          successful_runs: successfulRuns,
          failed_runs: failedRuns,
          span_averages: spanAverages,
          span_mins: spanMins,
          span_maxs: spanMaxs,
        };
      } else {
        results.environments[envConfig.name].questions[question.question] = {
          runs: [],
          average: 0,
          min: 0,
          max: 0,
          average_iterations: 0,
          min_iterations: 0,
          max_iterations: 0,
          successful_runs: 0,
          failed_runs: NUM_RUNS,
          span_averages: {
            sql_engine_execute_sql: 0,
            call_llm_streaming: 0,
            pure_code_execution: 0,
          },
          span_mins: {
            sql_engine_execute_sql: 0,
            call_llm_streaming: 0,
            pure_code_execution: 0,
          },
          span_maxs: {
            sql_engine_execute_sql: 0,
            call_llm_streaming: 0,
            pure_code_execution: 0,
          },
        };
      }
    }
  };

  // Process all questions using the batch processor
  await batchProcessor.processBatches(
    questions.map((q, i) => ({ question: q, index: i })),
    ({ question, index }) => processQuestion(question, index)
  );

  // Stop memory monitoring and add stats to results
  memoryMonitor.stop();
  results.metadata.memory_stats = memoryMonitor.getStats();

  // Calculate and display final summary
  console.log(`\n${chalk.bold.cyan("=".repeat(80))}`);
  console.log(`${chalk.bold.cyan("🏁 Final Summary")}`);
  console.log(`${chalk.bold.cyan("=".repeat(80))}\n`);

  // Overall statistics in a single line
  console.log(
    `${chalk.bold("📈 Overall:")} ${chalk.green(
      results.metadata.successful_runs
    )}/${chalk.red(results.metadata.failed_runs)} ` +
      `runs (${chalk.cyan(questions.length)} questions, ${chalk.cyan(
        NUM_RUNS
      )} runs each)`
  );

  // Memory usage summary
  if (results.metadata.memory_stats) {
    console.log(
      `\n${chalk.bold("💾 Memory Usage:")} Initial: ${chalk.cyan(
        `${results.metadata.memory_stats.initialMB}MB`
      )}, ` +
        `Current: ${chalk.cyan(
          `${results.metadata.memory_stats.currentMB}MB`
        )}, ` +
        `Peak: ${chalk.cyan(`${results.metadata.memory_stats.peakMB}MB`)}`
    );
  }

  // Environment comparison
  console.log(`\n${chalk.bold("🌍 Environment Comparison")}`);
  console.log(`${chalk.bold.cyan("-".repeat(80))}`);

  for (const question of questions) {
    console.log(
      `\n${chalk.bold("❓ Question:")} ${chalk.yellow(question.question)}`
    );

    const envStats = envConfigs
      .map((envConfig) => {
        const stats =
          results.environments[envConfig.name].questions[question.question];
        const hasValidRuns = stats.successful_runs > 0;

        // Calculate accuracy metrics
        const accuracyResults = stats.runs
          .map((r) => r.accuracy)
          .filter((a): a is AccuracyResult => a !== null);

        const fuzzyMatchPassed = accuracyResults.filter(
          (a) => a.fuzzy_match.passed
        ).length;
        const dataAccuracyPassed = accuracyResults.filter(
          (a) => a.data_accuracy.passed
        ).length;
        const bothPassed = accuracyResults.filter(
          (a) => a.fuzzy_match.passed && a.data_accuracy.passed
        ).length;
        const totalAccuracyRuns = accuracyResults.length;

        const fuzzyMatchRate =
          totalAccuracyRuns > 0
            ? (fuzzyMatchPassed / totalAccuracyRuns) * 100
            : 0;
        const dataAccuracyRate =
          totalAccuracyRuns > 0
            ? (dataAccuracyPassed / totalAccuracyRuns) * 100
            : 0;
        const combinedRate =
          totalAccuracyRuns > 0 ? (bothPassed / totalAccuracyRuns) * 100 : 0;

        return {
          env: envConfig.name,
          average: hasValidRuns ? stats.average : null,
          min: hasValidRuns ? stats.min : null,
          max: hasValidRuns ? stats.max : null,
          successRate:
            (stats.successful_runs /
              (stats.successful_runs + stats.failed_runs)) *
            100,
          span_averages: hasValidRuns
            ? stats.span_averages
            : {
                sql_engine_execute_sql: null,
                call_llm_streaming: null,
                pure_code_execution: null,
              },
          fuzzyMatchRate,
          dataAccuracyRate,
          combinedRate,
        };
      })
      .sort((a, b) => {
        if (a.average === null) return 1;
        if (b.average === null) return -1;
        return a.average - b.average;
      });

    // Find fastest and slowest environments
    const validStats = envStats.filter((stat) => stat.average !== null);
    const fastest = validStats[0];
    const slowest = validStats[validStats.length - 1];
    const avgDiff =
      fastest && slowest ? slowest.average! - fastest.average! : null;
    const pctDiff =
      fastest && slowest ? (avgDiff! / fastest.average!) * 100 : null;

    // Display environment comparison in a single line
    envStats.forEach((stat, index) => {
      const color =
        stat === fastest
          ? chalk.green
          : stat === slowest
            ? chalk.red
            : stat.average === null
              ? chalk.gray
              : chalk.yellow;
      const rank =
        index === 0 && stat.average !== null
          ? "🏆"
          : index === validStats.length - 1
            ? "🐌"
            : "";

      console.log(
        `${chalk.bold(`${index + 1}. ${stat.env}`)} ${rank} ` +
          `${color(`${stat.average?.toFixed(2) || "N/A"}s`)} ` +
          `(${chalk.cyan(`${stat.successRate.toFixed(0)}%`)} success) ` +
          `[Fuzzy: ${chalk.cyan(`${stat.fuzzyMatchRate.toFixed(0)}%`)}, ` +
          `Data: ${chalk.cyan(`${stat.dataAccuracyRate.toFixed(0)}%`)}, ` +
          `Combined: ${chalk.cyan(`${stat.combinedRate.toFixed(0)}%`)}]`
      );
    });

    if (avgDiff && pctDiff) {
      console.log(
        `${chalk.bold("📊 Difference:")} ${fastest.env} is ${chalk.green(
          `${avgDiff.toFixed(2)}s`
        )} ` +
          `(${chalk.green(`${pctDiff.toFixed(0)}%`)}) faster than ${
            slowest.env
          }`
      );
    }
  }

  // Save results
  fs.writeFileSync(argv.output, JSON.stringify(results, null, 2));
  const summaryPath = argv.output.replace(".json", "_summary.md");
  const summary = generateMarkdownSummary(results, envConfigs);
  fs.writeFileSync(summaryPath, summary);
  console.log(
    `\n${chalk.bold.green("✅ Results saved:")} ${chalk.cyan(
      argv.output
    )} and ${chalk.cyan(summaryPath)}`
  );
}

async function callPatronusJudge(
  judgeId: string,
  question: string,
  response: any,
  goldAnswer: any,
  envConfig: { name: string; config: ReturnType<typeof getEnvironmentConfig> }
): Promise<{ passed: boolean; score: number; details: string } | null> {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second between retries

  // Format response and gold answer for Patronus in a consistent way expected by the API
  const formatForPatronus = (data: any) => {
    try {
      if (typeof data === "string") {
        return data;
      }

      let formattedData;
      // If it's from PromptQL API
      if (data.assistant_actions && data.assistant_actions.length > 0) {
        const lastAction =
          data.assistant_actions[data.assistant_actions.length - 1];
        const conversation = data.assistant_actions
          .slice(0, -1)
          .map((action: any) => ({
            message: action.message,
            artifacts: action.modified_artifacts || [],
          }));

        formattedData = {
          final_message: lastAction.message,
          artifacts: data.modified_artifacts || [],
          conversation: conversation,
        };
      }
      // If it's from gold answer in evalset format
      else if (data.answer !== undefined || data.final_message !== undefined) {
        formattedData = {
          final_message: data.answer || data.final_message || "",
          artifacts: data.modified_artifacts || [],
          conversation: data.conversation || [],
        };
      } else {
        formattedData = {
          final_message: "Error formatting response",
          artifacts: [],
          conversation: [],
        };
      }

      return JSON.stringify(formattedData);
    } catch (error) {
      console.error("Error formatting data for Patronus:", error);
      return JSON.stringify({
        final_message: "Error formatting response",
        artifacts: [],
        conversation: [],
      });
    }
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const formattedResponse = formatForPatronus(response);
      const formattedGoldAnswer = formatForPatronus(goldAnswer);

      const requestBody = {
        evaluators: [
          {
            evaluator: "judge",
            criteria: judgeId,
            explain_strategy: "always",
          },
        ],
        evaluated_model_input: question,
        evaluated_model_output: formattedResponse,
        evaluated_model_gold_answer: formattedGoldAnswer,
        capture: "all",
        tags: {},
      };

      if (isDebug) {
        console.log("\n🔍 Debug: Patronus Request:");
        console.log(`🔍 Debug: Judge: ${judgeId}`);
        console.log(`🔍 Debug: Question: ${question}`);
        console.log(`🔍 Debug: Response: ${formattedResponse}`);
        console.log(`🔍 Debug: Gold Answer: ${formattedGoldAnswer}`);
      }

      // Ensure base URL uses HTTPS
      let baseUrl = envConfig.config.PATRONUS_BASE_URL;
      if (!baseUrl) {
        throw new Error("PATRONUS_BASE_URL is not configured");
      }
      if (!baseUrl.startsWith("https://")) {
        baseUrl = `https://${baseUrl.replace(/^https?:\/\//, "")}`;
      }

      logger.logInfo(
        `Calling Patronus judge ${judgeId} (attempt ${attempt}/${maxRetries})`
      );

      const patronusResponse = await axios.post(
        `${baseUrl}/v1/evaluate`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": envConfig.config.PATRONUS_API_KEY,
            "X-Project-ID": envConfig.config.PATRONUS_PROJECT_ID,
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (patronusResponse.status !== 200) {
        throw new Error(
          `HTTP ${patronusResponse.status}: ${JSON.stringify(
            patronusResponse.data
          )}`
        );
      }

      if (patronusResponse.data.results?.[0]?.error_message) {
        throw new Error(patronusResponse.data.results[0].error_message);
      }

      // Try to extract results using the structure we saw in the test-patronus-simple.js
      const result =
        patronusResponse.data.results?.[0]?.evaluation_result ||
        patronusResponse.data.results?.[0] ||
        {};

      if (!result) {
        throw new Error("No evaluation result found in response");
      }

      // Look for score in multiple possible places
      const score =
        result.score_raw !== undefined
          ? result.score_raw
          : result.score !== undefined
            ? result.score
            : 0;

      // Look for passed in multiple possible places
      const passed =
        result.pass !== undefined
          ? result.pass
          : result.passed !== undefined
            ? result.passed
            : false;

      const details =
        result.explanation || result.details || "No details provided";

      if (isDebug) {
        console.log("\n🔍 Debug: Patronus Response:");
        console.log(`🔍 Debug: Passed: ${passed}`);
        console.log(`🔍 Debug: Score: ${score}`);
        console.log(`🔍 Debug: Details: ${details}`);
      }

      logger.logInfo(
        `Patronus judge ${judgeId} result: ${
          passed ? "Pass" : "Fail"
        } (Score: ${score})`
      );

      return {
        passed,
        score,
        details,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (isDebug) {
        console.log("\n🔍 Debug: Patronus Error:");
        if (axios.isAxiosError(error)) {
          console.log(`🔍 Debug: Status: ${error.response?.status}`);
          console.log(`🔍 Debug: Status Text: ${error.response?.statusText}`);
        } else {
          console.log(`🔍 Debug: Error: ${errorMessage}`);
        }
      }

      if (attempt < maxRetries) {
        logger.logRetry(attempt, maxRetries, envConfig.name);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }

      return null;
    }
  }

  return null;
}

async function evaluateAccuracy(
  question: string,
  response: any,
  goldAnswer: any,
  envConfig: { name: string; config: ReturnType<typeof getEnvironmentConfig> }
): Promise<AccuracyResult | null> {
  const logger = Logger.getInstance(questions.length, NUM_RUNS);
  try {
    logger.logInfo(`Evaluating accuracy for question: ${question}`);

    const [fuzzyMatchResult, dataAccuracyResult] = await Promise.all([
      callPatronusJudge(
        "fuzzy-match-v2",
        question,
        response,
        goldAnswer,
        envConfig
      ),
      callPatronusJudge(
        "check-data-accuracy",
        question,
        response,
        goldAnswer,
        envConfig
      ),
    ]);

    if (!fuzzyMatchResult || !dataAccuracyResult) {
      logger.logError("One or both accuracy evaluations failed");
      return null;
    }

    return {
      fuzzy_match: fuzzyMatchResult,
      data_accuracy: dataAccuracyResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.logError(`Error evaluating accuracy: ${errorMessage}`);
    return null;
  }
}

export async function main(args: string[]) {
  const argv = yargs(args)
    .option("env", {
      alias: "e",
      type: "string",
      description:
        "Environment(s) to run against (dev, staging, production). Multiple environments can be specified as comma-separated values. " +
        "You can also specify a version for an environment using parentheses, e.g. 'production,production(3a3d68b8c8)'.",
      coerce: (arg: string) => {
        const envs = arg.split(",").map((e) => e.trim());
        const validEnvs = ["dev", "staging", "production"];

        // Parse each environment string
        return envs.map((envStr) => {
          // Check if it's a versioned environment (e.g. "production(3a3d68b8c8)")
          const match = envStr.match(/^([^(]+)(?:\(([^)]+)\))?$/);
          if (!match) {
            throw new Error(`Invalid environment format: ${envStr}`);
          }

          const [_, baseEnv, version] = match;
          if (!validEnvs.includes(baseEnv)) {
            throw new Error(
              `Invalid environment: ${baseEnv}. Valid environments are: ${validEnvs.join(
                ", "
              )}`
            );
          }

          return {
            baseEnv,
            version,
            displayName: version ? `${baseEnv}(${version})` : baseEnv,
          };
        });
      },
      demandOption: true,
    })
    .option("runs", {
      alias: "r",
      type: "number",
      description: "Number of concurrent requests per batch",
      default: 3,
    })
    .option("questions", {
      alias: "q",
      type: "string",
      description:
        "Questions to run. Can be:\n" +
        "- A single number (e.g. 1)\n" +
        "- A comma-separated list (e.g. 1,2,3)\n" +
        "- A range (e.g. 1-3)\n" +
        '- A search string to match against questions (e.g. "WorkPass")',
      conflicts: "all",
    })
    .option("all", {
      alias: "a",
      type: "boolean",
      description: "Run all questions",
      conflicts: "questions",
    })
    .option("output", {
      alias: "o",
      type: "string",
      description: "Output file for results",
      default: `latency_results_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`,
    })
    .option("concurrency", {
      alias: "c",
      type: "number",
      description: "Maximum number of concurrent questions to run",
      default: 5,
    })
    .option("batch-size", {
      alias: "b",
      type: "number",
      description: "Number of questions to process in each batch",
      default: 10,
    })
    .option("rate-limit", {
      type: "number",
      description: "Maximum requests per second (0 for no limit)",
      default: 0,
    })
    .option("batch-delay", {
      type: "number",
      description: "Delay in seconds between batches of runs",
      default: 0,
    })
    .option("num-batches", {
      type: "number",
      description: "Number of batches to run",
      default: 1,
    })
    .option("skip-accuracy", {
      type: "boolean",
      description:
        "Skip accuracy testing even if Patronus configuration is available",
      default: false,
    })
    .check((argv) => {
      if (!argv.questions && !argv.all) {
        throw new Error("You must specify either --questions or --all");
      }
      return true;
    })
    .help()
    .alias("help", "h")
    .parse();

  // After Logger class definition and before runLatencyTests
  // Log accuracy testing status
  const logger = Logger.getInstance(questions.length, NUM_RUNS);
  if ((argv as any)["skip-accuracy"]) {
    logger.logInfo(
      "Accuracy testing is disabled (--skip-accuracy flag is set)"
    );
  } else if (
    !process.env.PATRONUS_BASE_URL ||
    !process.env.PATRONUS_API_KEY ||
    !process.env.PATRONUS_PROJECT_ID
  ) {
    logger.logInfo(
      "Accuracy testing is disabled (Patronus configuration is not available)"
    );
  } else {
    logger.logInfo(
      "Accuracy testing is enabled (Patronus configuration is available)"
    );
  }

  await runLatencyTests();
}

// Add direct execution block at the end of the file
if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
