import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { stringify } from "csv-stringify/sync";
import readline from "readline";
import {
  getEnvironmentConfig,
  callPromptQL,
  formatResponse,
  loadQuestions,
  loadSystemPrompt,
  Question,
} from "./shared";

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env") });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("question", {
    alias: "q",
    type: "number",
    description: "Question number to update",
    demandOption: true,
  })
  .option("runs", {
    alias: "r",
    type: "number",
    description: "Number of runs to make",
    default: 3,
  })
  .option("env", {
    alias: "e",
    type: "string",
    description: "Environment to run against (dev, staging, production)",
    default: "dev",
  })
  .help()
  .alias("help", "h")
  .parseSync();

// Read questions from evalset.csv
const questions = loadQuestions();

// Validate question number
if (argv.question < 1 || argv.question > questions.length) {
  console.error(
    `Error: Question number must be between 1 and ${questions.length}`
  );
  process.exit(1);
}

// Get the question to update
const questionToUpdate = questions[argv.question - 1];

// Function to update the CSV file
function updateGoldenAnswer(questionNumber: number, newAnswer: string) {
  // Update the question in memory
  questions[questionNumber - 1].gold_answer = newAnswer;

  // Convert back to CSV format
  const csvContent = stringify(questions, {
    header: true,
    columns: {
      question: "question",
      gold_answer: "gold_answer",
    },
  });

  // Write back to file
  fs.writeFileSync(path.join(process.cwd(), "evalset.csv"), csvContent);
}

// Main function
async function main() {
  const envConfig = getEnvironmentConfig(argv.env);
  const systemPrompt = loadSystemPrompt(argv.env);

  console.log(
    chalk.bold.cyan(`\nUpdating golden answer for question ${argv.question}:`)
  );
  console.log(chalk.yellow(questionToUpdate.question));
  console.log(chalk.bold.cyan("\nCurrent golden answer:"));
  console.log(questionToUpdate.gold_answer);

  console.log(chalk.bold.cyan(`\nRunning ${argv.runs} new responses...`));

  const responses: any[] = [];

  // Run the question multiple times
  for (let i = 0; i < argv.runs; i++) {
    console.log(chalk.bold.cyan(`\nRun ${i + 1}/${argv.runs}:`));
    const response = await callPromptQL(
      questionToUpdate.question,
      envConfig,
      systemPrompt
    );
    if (response) {
      responses.push(response);
      console.log(formatResponse(response));
    }
  }

  if (responses.length === 0) {
    console.error(chalk.red("No successful responses received. Exiting."));
    process.exit(1);
  }

  // Ask user to select which response to use as new golden answer
  console.log(
    chalk.bold.cyan(
      "\nWhich response would you like to use as the new golden answer?"
    )
  );
  console.log(
    "Enter the number of the response (1-" +
      responses.length +
      "), or 0 to keep current:"
  );

  rl.question("> ", (answer) => {
    const selection = parseInt(answer);

    if (isNaN(selection) || selection < 0 || selection > responses.length) {
      console.error(chalk.red("Invalid selection. Exiting."));
      rl.close();
      process.exit(1);
    }

    if (selection === 0) {
      console.log(chalk.green("Keeping current golden answer."));
      rl.close();
      return;
    }

    const selectedResponse = responses[selection - 1];
    const newGoldenAnswer = formatResponse(selectedResponse);

    console.log(chalk.bold.cyan("\nNew golden answer will be:"));
    console.log(newGoldenAnswer);

    rl.question(chalk.yellow("\nConfirm update? (y/N): "), (confirm) => {
      if (confirm.toLowerCase() === "y") {
        updateGoldenAnswer(argv.question, newGoldenAnswer);
        console.log(chalk.green("\nGolden answer updated successfully!"));
      } else {
        console.log(chalk.yellow("\nUpdate cancelled."));
      }
      rl.close();
    });
  });
}

main().catch(console.error);
