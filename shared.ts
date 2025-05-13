import * as dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { parse } from "csv-parse/sync";

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

// Set debug mode
const isDebug = process.env.DEBUG === "true";

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

// Question interface
export interface Question {
  question: string;
  gold_answer: string;
}

// Get environment configuration
export function getEnvironmentConfig(env: string) {
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

  const config = configs[env as keyof typeof configs];
  if (!config) {
    throw new Error(`Invalid environment: ${env}`);
  }

  return config;
}

// Function to call PromptQL
export async function callPromptQL(
  question: string,
  envConfig: ReturnType<typeof getEnvironmentConfig>,
  systemPrompt: string
) {
  const requestData = {
    version: "v1",
    promptql_api_key: envConfig.PROMPTQL_API_KEY,
    llm: {
      provider: "hasura",
    },
    ddn: {
      url: envConfig.DDN_URL,
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
    const response = await axios.post(envConfig.PROMPTQL_URL!, requestData, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Error details: ${JSON.stringify({
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        })}`
      );
    } else {
      console.error(`Error: ${error}`);
    }
    return null;
  }
}

// Function to format response for display
export function formatResponse(response: any): string {
  if (!response) return "Error: No response received";

  let formatted = "";

  // Add the final message
  if (response.assistant_actions && response.assistant_actions.length > 0) {
    const lastAction =
      response.assistant_actions[response.assistant_actions.length - 1];
    formatted += lastAction.message + "\n\n";
  }

  // Add artifacts
  if (response.modified_artifacts && response.modified_artifacts.length > 0) {
    formatted += "Artifacts:\n";
    response.modified_artifacts.forEach((artifact: any) => {
      formatted += `- ${artifact.identifier}: ${JSON.stringify(
        artifact.data,
        null,
        2
      )}\n`;
    });
  }

  return formatted;
}

// Function to read questions from evalset.csv
export function readQuestions(): Question[] {
  return parse(fs.readFileSync(path.join(__dirname, "evalset.csv"), "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

// Function to load system prompt
export function loadSystemPrompt(env: string): string {
  const promptPath = path.join(__dirname, "system_prompts", `${env}.txt`);
  try {
    return fs.readFileSync(promptPath, "utf-8").trim();
  } catch (error) {
    console.error(`Error reading system prompt: ${error}`);
    throw new Error(`Failed to read system prompt from ${promptPath}`);
  }
}

// Function to call Patronus judge
export async function callPatronusJudge(
  judgeId: string,
  question: string,
  response: any,
  goldAnswer: any,
  envConfig: ReturnType<typeof getEnvironmentConfig>
): Promise<{ passed: boolean; score: number; details: string } | null> {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second between retries

  // Format response and gold answer for Patronus
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
      let baseUrl = envConfig.PATRONUS_BASE_URL;
      if (!baseUrl) {
        throw new Error("PATRONUS_BASE_URL is not configured");
      }
      if (!baseUrl.startsWith("https://")) {
        baseUrl = `https://${baseUrl.replace(/^https?:\/\//, "")}`;
      }

      const patronusResponse = await axios.post(
        `${baseUrl}/v1/evaluate`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": envConfig.PATRONUS_API_KEY,
            "X-Project-ID": envConfig.PATRONUS_PROJECT_ID,
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

      const result =
        patronusResponse.data.results?.[0]?.evaluation_result ||
        patronusResponse.data.results?.[0] ||
        {};

      if (!result) {
        throw new Error("No evaluation result found in response");
      }

      const score =
        result.score_raw !== undefined
          ? result.score_raw
          : result.score !== undefined
          ? result.score
          : 0;

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
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }

      return null;
    }
  }

  return null;
}

// Function to evaluate accuracy
export async function evaluateAccuracy(
  question: string,
  response: any,
  goldAnswer: any,
  envConfig: ReturnType<typeof getEnvironmentConfig>
): Promise<AccuracyResult | null> {
  try {
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
      console.error("One or both accuracy evaluations failed");
      return null;
    }

    return {
      fuzzy_match: fuzzyMatchResult,
      data_accuracy: dataAccuracyResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error evaluating accuracy: ${errorMessage}`);
    return null;
  }
}
