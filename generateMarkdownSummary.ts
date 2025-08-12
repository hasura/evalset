import { AccuracyResult } from "./types";

export function generateMarkdownSummary(
  results: any,
  envConfigs: any[]
): string {
  const { metadata, environments } = results;
  const questions = Object.keys(environments[envConfigs[0].name].questions);

  // Calculate overall statistics
  const totalRuns = metadata.num_runs * questions.length * envConfigs.length;
  const successRate = (metadata.successful_runs / totalRuns) * 100;

  // Calculate environment-wide statistics
  const envStats = envConfigs
    .map((envConfig) => {
      const envQuestions = environments[envConfig.name].questions as Record<
        string,
        {
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
            query_ids: string[];
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
      >;

      const allDurations = Object.values(envQuestions).flatMap((q) =>
        q.runs
          .map((r) => r.duration)
          .filter((d: number | null): d is number => d !== null)
      );

      const allIterations = Object.values(envQuestions).flatMap((q) =>
        q.runs
          .map((r) => r.iterations)
          .filter((i: number | null): i is number => i !== null)
      );

      const allSpanDurations = Object.values(envQuestions).reduce(
        (
          acc: {
            sql_engine_execute_sql: number[];
            call_llm_streaming: number[];
            pure_code_execution: number[];
          },
          q
        ) => {
          return {
            sql_engine_execute_sql: [
              ...acc.sql_engine_execute_sql,
              ...q.runs
                .map((r) => r.span_durations.sql_engine_execute_sql)
                .filter((d: number | null): d is number => d !== null),
            ],
            call_llm_streaming: [
              ...acc.call_llm_streaming,
              ...q.runs
                .map((r) => r.span_durations.call_llm_streaming)
                .filter((d: number | null): d is number => d !== null),
            ],
            pure_code_execution: [
              ...acc.pure_code_execution,
              ...q.runs
                .map((r) => r.span_durations.pure_code_execution)
                .filter((d: number | null): d is number => d !== null),
            ],
          };
        },
        {
          sql_engine_execute_sql: [],
          call_llm_streaming: [],
          pure_code_execution: [],
        }
      );

      // Calculate accuracy statistics
      const accuracyResults = Object.values(envQuestions).flatMap((q) =>
        q.runs
          .map((r) => r.accuracy)
          .filter((a: AccuracyResult | null): a is AccuracyResult => a !== null)
      );

      const fuzzyMatchPassed = accuracyResults.filter(
        (a: AccuracyResult) => a.fuzzy_match.passed
      ).length;
      const dataAccuracyPassed = accuracyResults.filter(
        (a: AccuracyResult) => a.data_accuracy.passed
      ).length;
      const bothPassed = accuracyResults.filter(
        (a: AccuracyResult) => a.fuzzy_match.passed && a.data_accuracy.passed
      ).length;

      const avgDuration =
        allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length;
      const minDuration = Math.min(...allDurations);
      const maxDuration = Math.max(...allDurations);

      const avgIterations =
        allIterations.reduce((sum, i) => sum + i, 0) / allIterations.length;
      const minIterations = Math.min(...allIterations);
      const maxIterations = Math.max(...allIterations);

      const spanAverages = {
        sql_engine_execute_sql:
          allSpanDurations.sql_engine_execute_sql.reduce(
            (sum, d) => sum + d,
            0
          ) / allSpanDurations.sql_engine_execute_sql.length,
        call_llm_streaming:
          allSpanDurations.call_llm_streaming.reduce((sum, d) => sum + d, 0) /
          allSpanDurations.call_llm_streaming.length,
        pure_code_execution:
          allSpanDurations.pure_code_execution.reduce((sum, d) => sum + d, 0) /
          allSpanDurations.pure_code_execution.length,
      };

      return {
        name: envConfig.name,
        avgDuration,
        minDuration,
        maxDuration,
        avgIterations,
        minIterations,
        maxIterations,
        spanAverages,
        fuzzyMatchPassed,
        dataAccuracyPassed,
        bothPassed,
        totalRuns: accuracyResults.length,
      };
    })
    .sort((a, b) => a.avgDuration - b.avgDuration);

  // Collect all failure reasons
  const collectAllFailureReasons = () => {
    const allFailureReasons = new Map<
      string,
      {
        question: string;
        judge: string;
        reason: string;
        environment: string;
      }
    >();

    // Loop through all environments and questions
    for (const envStat of envStats) {
      const envQuestions = environments[envStat.name].questions as Record<
        string,
        {
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
            query_ids: string[];
            accuracy: AccuracyResult | null;
            raw_request: any;
            raw_response: any;
          }>;
        }
      >;

      for (const [questionText, questionData] of Object.entries(envQuestions)) {
        if (!questionData || !Array.isArray(questionData.runs)) continue;

        questionData.runs.forEach((run) => {
          if (run.accuracy) {
            if (run.accuracy.fuzzy_match && !run.accuracy.fuzzy_match.passed) {
              const key = `${questionText.substring(0, 30)}...fuzzy`;
              allFailureReasons.set(key, {
                question: questionText,
                judge: "Fuzzy Match",
                reason:
                  run.accuracy.fuzzy_match.details || "No details provided",
                environment: envStat.name,
              });
            }
            if (
              run.accuracy.data_accuracy &&
              !run.accuracy.data_accuracy.passed
            ) {
              const key = `${questionText.substring(0, 30)}...data`;
              allFailureReasons.set(key, {
                question: questionText,
                judge: "Data Accuracy",
                reason:
                  run.accuracy.data_accuracy.details || "No details provided",
                environment: envStat.name,
              });
            }
          }
        });
      }
    }

    return allFailureReasons;
  };

  const allFailureReasons = collectAllFailureReasons();
  let failureSection = "";

  if (allFailureReasons.size > 0) {
    failureSection = `
### Common Failure Reasons

${Array.from(allFailureReasons.values())
  .map(
    (failure) =>
      `**Question:** ${failure.question}\n**Environment:** ${failure.environment}\n**Judge:** ${failure.judge}\n**Reason:** ${failure.reason}\n`
  )
  .join("\n")}
`;
  }

  let summary = `# Latency Test Results

## Overall Statistics
- **Total Questions**: ${questions.length}
- **Total Runs**: ${totalRuns}
- **Successful Runs**: ${metadata.successful_runs}
- **Failed Runs**: ${metadata.failed_runs}
- **Success Rate**: ${successRate.toFixed(1)}%

## Accuracy Results

### Per-Environment Statistics
${envStats
  .map(
    (stat) => `
#### ${stat.name}
- **Total Runs**: ${stat.totalRuns}
- **Fuzzy Match Passed**: ${stat.fuzzyMatchPassed} (${(
      (stat.fuzzyMatchPassed / stat.totalRuns) *
      100
    ).toFixed(1)}%)
- **Data Accuracy Passed**: ${stat.dataAccuracyPassed} (${(
      (stat.dataAccuracyPassed / stat.totalRuns) *
      100
    ).toFixed(1)}%)
- **Both Passed**: ${stat.bothPassed} (${(
      (stat.bothPassed / stat.totalRuns) *
      100
    ).toFixed(1)}%)`
  )
  .join("\n")}${failureSection}

### Per-Environment Accuracy
| Environment | Fuzzy Match Pass Rate | Data Accuracy Pass Rate | Combined Pass Rate |
|------------|----------------------|------------------------|-------------------|
${envStats
  .map(
    (stat) =>
      `| ${stat.name} | ${(
        (stat.fuzzyMatchPassed / stat.totalRuns) *
        100
      ).toFixed(1)}% | ${(
        (stat.dataAccuracyPassed / stat.totalRuns) *
        100
      ).toFixed(1)}% | ${((stat.bothPassed / stat.totalRuns) * 100).toFixed(
        1
      )}% |`
  )
  .join("\n")}

## Environment Performance Summary

### Overall Latency Comparison
| Environment | Average Response Time | Min Response Time | Max Response Time | Performance Rank |
|------------|----------------------|------------------|------------------|-----------------|
${envStats
  .map(
    (stat, index) =>
      `| ${stat.name} | ${stat.avgDuration.toFixed(
        2
      )}s | ${stat.minDuration.toFixed(2)}s | ${stat.maxDuration.toFixed(
        2
      )}s | ${index + 1}${
        index === 0
          ? " (Fastest)"
          : index === envStats.length - 1
            ? " (Slowest)"
            : ""
      } |`
  )
  .join("\n")}

### Component Breakdown (Average)
| Environment | SQL Engine | LLM Streaming | Pure Code Execution | Total |
|------------|-----------|--------------|---------------------|-------|
${envStats
  .map(
    (stat) =>
      `| ${stat.name} | ${stat.spanAverages.sql_engine_execute_sql.toFixed(
        2
      )}s | ${stat.spanAverages.call_llm_streaming.toFixed(
        2
      )}s | ${stat.spanAverages.pure_code_execution.toFixed(
        2
      )}s | ${stat.avgDuration.toFixed(2)}s |`
  )
  .join("\n")}

### Performance Analysis
${envStats
  .map((stat, index) => {
    if (index === 0) return ""; // Skip comparison for fastest environment
    const diff = stat.avgDuration - envStats[0].avgDuration;
    const pctDiff = (diff / envStats[0].avgDuration) * 100;
    return `- **${envStats[0].name}** is ${diff.toFixed(2)}s (${pctDiff.toFixed(
      1
    )}%) faster than ${stat.name} on average`;
  })
  .filter(Boolean)
  .join("\n")}

## Per-Question Analysis
`;

  // Add per-question analysis
  questions.forEach((question) => {
    summary += `\n### Question: ${question}\n\n`;

    // Environment comparison for this question
    const questionEnvStats = envConfigs
      .map((envConfig) => {
        const stats = environments[envConfig.name].questions[question];
        const accuracyResults = stats.runs
          .map((r: { accuracy: AccuracyResult | null }) => r.accuracy)
          .filter(
            (a: AccuracyResult | null): a is AccuracyResult => a !== null
          );

        const fuzzyMatchPassed = accuracyResults.filter(
          (a: AccuracyResult) => a.fuzzy_match.passed
        ).length;
        const dataAccuracyPassed = accuracyResults.filter(
          (a: AccuracyResult) => a.data_accuracy.passed
        ).length;
        const bothPassed = accuracyResults.filter(
          (a: AccuracyResult) => a.fuzzy_match.passed && a.data_accuracy.passed
        ).length;

        return {
          env: envConfig.name,
          average: stats.average,
          min: stats.min,
          max: stats.max,
          average_iterations: stats.average_iterations,
          min_iterations: stats.min_iterations,
          max_iterations: stats.max_iterations,
          successRate:
            (stats.successful_runs /
              (stats.successful_runs + stats.failed_runs)) *
            100,
          span_averages: stats.span_averages,
          fuzzyMatchPassed,
          dataAccuracyPassed,
          bothPassed,
          totalRuns: accuracyResults.length,
        };
      })
      .sort((a, b) => a.average - b.average);

    summary += `#### Environment Comparison

| Environment | Average | Min    | Max    | Success Rate | Avg Iterations | Min Iterations | Max Iterations |
|------------|---------|--------|--------|--------------|----------------|----------------|----------------|
${questionEnvStats
  .map(
    (stat) =>
      `| ${stat.env} | ${stat.average.toFixed(2)}s | ${stat.min.toFixed(
        2
      )}s | ${stat.max.toFixed(2)}s | ${stat.successRate.toFixed(
        1
      )}% | ${stat.average_iterations.toFixed(1)} | ${stat.min_iterations} | ${
        stat.max_iterations
      } |`
  )
  .join("\n")}

#### Accuracy Results
| Environment | Fuzzy Match | Data Accuracy | Combined Result |
|------------|-------------|---------------|----------------|
${questionEnvStats
  .map(
    (stat) =>
      `| ${stat.env} | ${(
        (stat.fuzzyMatchPassed / stat.totalRuns) *
        100
      ).toFixed(1)}% | ${(
        (stat.dataAccuracyPassed / stat.totalRuns) *
        100
      ).toFixed(1)}% | ${((stat.bothPassed / stat.totalRuns) * 100).toFixed(
        1
      )}% |`
  )
  .join("\n")}

${(() => {
  // Extract all unique failure reasons
  const failureReasons = new Map<
    string,
    {
      env: string;
      run: number;
      judge: string;
      reason: string;
    }
  >();

  questionEnvStats.forEach((stat) => {
    const envData = environments[stat.env].questions[question];
    if (!envData || !Array.isArray(envData.runs)) return;

    envData.runs.forEach((run: any, runIndex: number) => {
      if (run.accuracy) {
        if (run.accuracy.fuzzy_match && !run.accuracy.fuzzy_match.passed) {
          failureReasons.set(`${stat.env}-run${runIndex + 1}-fuzzy`, {
            env: stat.env,
            run: runIndex + 1,
            judge: "Fuzzy Match",
            reason: run.accuracy.fuzzy_match.details || "No details provided",
          });
        }
        if (run.accuracy.data_accuracy && !run.accuracy.data_accuracy.passed) {
          failureReasons.set(`${stat.env}-run${runIndex + 1}-data`, {
            env: stat.env,
            run: runIndex + 1,
            judge: "Data Accuracy",
            reason: run.accuracy.data_accuracy.details || "No details provided",
          });
        }
      }
    });
  });

  if (failureReasons.size === 0) {
    return "";
  }

  let result = "#### Failure Details\n\n";
  Array.from(failureReasons.values()).forEach((failure) => {
    result += `**${failure.env} Run ${failure.run} (${failure.judge})**: ${failure.reason}\n\n`;
  });

  return result;
})()}

#### Component Breakdown

| Environment | SQL Engine | LLM Streaming | Pure Code Execution |
|------------|-----------|--------------|---------------------|
${questionEnvStats
  .map(
    (stat) =>
      `| ${stat.env} | ${stat.span_averages.sql_engine_execute_sql.toFixed(
        2
      )}s | ${stat.span_averages.call_llm_streaming.toFixed(
        2
      )}s | ${stat.span_averages.pure_code_execution.toFixed(2)}s |`
  )
  .join("\n")}

#### Individual Run Details

${envConfigs
  .map((envConfig) => {
    const envData = environments[envConfig.name].questions[question];
    if (!envData || !Array.isArray(envData.runs) || envData.runs.length === 0) {
      return `##### ${envConfig.name}
No runs available for this environment.`;
    }

    return `##### ${envConfig.name}

${envData.runs
  .map((run: any, index: number) => {
    const duration = run.duration ? run.duration.toFixed(2) + "s" : "N/A";
    const iterations = run.iterations || "N/A";
    const traceId = run.trace_id || "N/A";
    const queryIds = run.query_ids && run.query_ids.length > 0
      ? run.query_ids.join(", ")
      : "N/A";
    const timestamp = run.timestamp
      ? new Date(run.timestamp).toLocaleString()
      : "N/A";
    const fuzzyMatch = run.accuracy?.fuzzy_match?.passed ? "✅" : "❌";
    const dataAccuracy = run.accuracy?.data_accuracy?.passed ? "✅" : "❌";
    const sqlEngine = run.span_durations?.sql_engine_execute_sql
      ? run.span_durations.sql_engine_execute_sql.toFixed(2) + "s"
      : "N/A";
    const llmStreaming = run.span_durations?.call_llm_streaming
      ? run.span_durations.call_llm_streaming.toFixed(2) + "s"
      : "N/A";
    const pureCode = run.span_durations?.pure_code_execution
      ? run.span_durations.pure_code_execution.toFixed(2) + "s"
      : "N/A";

    // Format LLM response details
    let responseDetails = "";
    if (run.raw_response) {
      try {
        const response = run.raw_response;

        // Add assistant actions (intermediate responses) in chat format
        if (
          response.assistant_actions &&
          response.assistant_actions !== "[REDACTED-ASSISTANT-ACTIONS]"
        ) {
          responseDetails += `\n**Conversation:**\n`;

          let actions;
          if (typeof response.assistant_actions === "string") {
            try {
              actions = JSON.parse(response.assistant_actions);
            } catch {
              actions = null;
            }
          } else {
            actions = response.assistant_actions;
          }

          if (Array.isArray(actions)) {
            actions.forEach((action: any, actionIndex: number) => {
              responseDetails += `\n**Step ${actionIndex + 1}:**\n`;

              if (action.message) {
                responseDetails += `> ${action.message}\n\n`;
              }

              if (action.plan) {
                responseDetails += `**Plan:**\n${action.plan}\n\n`;
              }

              if (action.code) {
                responseDetails += `**Code:**\n\`\`\`python\n${action.code}\n\`\`\`\n\n`;
              }

              if (action.code_output) {
                responseDetails += `**Output:**\n\`\`\`\n${action.code_output}\n\`\`\`\n\n`;
              }

              if (action.code_error) {
                responseDetails += `**Error:**\n\`\`\`\n${action.code_error}\n\`\`\`\n\n`;
              }
            });
          } else {
            // Fallback to JSON if not parseable as array
            responseDetails += `\`\`\`json\n${JSON.stringify(actions, null, 2)}\n\`\`\`\n`;
          }
        }

        // Add artifacts
        if (
          response.modified_artifacts &&
          Array.isArray(response.modified_artifacts)
        ) {
          responseDetails += `\n**Artifacts Generated:**\n`;
          response.modified_artifacts.forEach(
            (artifact: any, artifactIndex: number) => {
              responseDetails += `\n###### Artifact ${artifactIndex + 1}: ${artifact.title || artifact.identifier}\n`;
              responseDetails += `- **Type:** ${artifact.artifact_type}\n`;
              responseDetails += `- **Identifier:** \`${artifact.identifier}\`\n`;

              if (
                artifact.artifact_type === "table" &&
                Array.isArray(artifact.data)
              ) {
                responseDetails += `- **Data:** Table with ${artifact.data.length} rows\n`;
                if (artifact.data.length > 0) {
                  responseDetails += `\n**Table Contents:**\n`;
                  // Create a markdown table from the data
                  const headers = Object.keys(artifact.data[0]);
                  responseDetails += `| ${headers.join(" | ")} |\n`;
                  responseDetails += `| ${headers.map(() => "---").join(" | ")} |\n`;
                  artifact.data.slice(0, 10).forEach((row: any) => {
                    // Limit to first 10 rows
                    const values = headers.map((header) => {
                      const value = row[header];
                      if (
                        typeof value === "string" &&
                        value.startsWith("[REDACTED-")
                      ) {
                        return "[REDACTED]";
                      }
                      return value?.toString().replace(/\|/g, "\\|") || "";
                    });
                    responseDetails += `| ${values.join(" | ")} |\n`;
                  });
                  if (artifact.data.length > 10) {
                    responseDetails += `\n*... and ${artifact.data.length - 10} more rows*\n`;
                  }
                }
              } else if (artifact.artifact_type === "text") {
                responseDetails += `- **Content:** ${typeof artifact.data === "string" ? artifact.data.substring(0, 200) + (artifact.data.length > 200 ? "..." : "") : "N/A"}\n`;
              } else {
                responseDetails += `- **Data:** ${typeof artifact.data === "string" ? artifact.data.substring(0, 200) + (artifact.data.length > 200 ? "..." : "") : JSON.stringify(artifact.data).substring(0, 200) + "..."}\n`;
              }
            }
          );
        }

        // Add thread ID
        if (response.thread_id) {
          responseDetails += `\n**Thread ID:** \`${response.thread_id}\`\n`;
        }
      } catch (error) {
        responseDetails = `\n**Response:** Error parsing response data\n`;
      }
    }

    return `###### Run ${index + 1}

**Performance Metrics:**
- **Duration:** ${duration}
- **Iterations:** ${iterations}
- **Timestamp:** ${timestamp}
- **Trace ID:** \`${traceId}\`
- **Query IDs:** ${queryIds !== "N/A" ? queryIds.split(", ").map((id: string) => `\`${id}\``).join(", ") : "N/A"}

**Component Breakdown:**
- **SQL Engine:** ${sqlEngine}
- **LLM Streaming:** ${llmStreaming}
- **Pure Code Execution:** ${pureCode}

**Accuracy Results:**
- **Fuzzy Match:** ${fuzzyMatch} ${run.accuracy?.fuzzy_match?.score ? `(Score: ${run.accuracy.fuzzy_match.score})` : ""}
- **Data Accuracy:** ${dataAccuracy} ${run.accuracy?.data_accuracy?.score ? `(Score: ${run.accuracy.data_accuracy.score})` : ""}

**LLM Response:**${responseDetails || "\nNo response data available."}
`;
  })
  .join("\n")}`;
  })
  .join("\n\n")}
`;
  });

  return summary;
}
