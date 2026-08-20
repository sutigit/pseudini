import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

interface AgentResult {
  readonly result: string;
}

export interface AgentRequest {
  readonly prompt: string;
  readonly workspaceDirectory: string;
  readonly token: vscode.CancellationToken;
}

const CONFIGURATION_SECTION = "pseudini";
const DEFAULT_AGENT_PATH = path.join(os.homedir(), ".local", "bin", "agent");

export async function requestImplementation(request: AgentRequest): Promise<string> {
  const output = await runAgent(resolveAgentPath(), buildArguments(), request);

  return readResultText(output);
}

function buildArguments(): string[] {
  const model = vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>("model", "")
    .trim();

  // Ask mode is read-only, so the agent answers with text instead of editing files itself.
  // Headless runs also need --trust, because the CLI cannot ask about the directory.
  const args = ["--print", "--output-format", "json", "--mode", "ask", "--trust"];

  return model ? [...args, "--model", model] : args;
}

function resolveAgentPath(): string {
  const configured = vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>("agentPath", "")
    .trim();

  if (configured) {
    return configured;
  }

  // Cursor does not inherit the shell PATH on macOS, so prefer the installer location.
  return existsSync(DEFAULT_AGENT_PATH) ? DEFAULT_AGENT_PATH : "agent";
}

function runAgent(
  agentPath: string,
  args: readonly string[],
  request: AgentRequest,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(agentPath, args, {
      cwd: request.workspaceDirectory,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(describeSpawnError(error, agentPath));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(describeFailure(code, stderr)));
    });

    const cancellation = request.token.onCancellationRequested(() => child.kill());
    child.on("close", () => cancellation.dispose());

    child.stdin.end(request.prompt);
  });
}

function readResultText(output: string): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output.trim());
  } catch {
    throw new Error("The Cursor CLI returned output that is not valid JSON.");
  }

  if (!isAgentResult(parsed)) {
    throw new Error("The Cursor CLI response does not contain a result text.");
  }

  return parsed.result;
}

function isAgentResult(value: unknown): value is AgentResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).result === "string"
  );
}

function describeSpawnError(error: NodeJS.ErrnoException, agentPath: string): Error {
  if (error.code === "ENOENT") {
    return new Error(
      `The Cursor CLI was not found at "${agentPath}". Install it with ` +
        "curl https://cursor.com/install -fsS | bash, or set pseudini.agentPath.",
    );
  }

  return error;
}

function describeFailure(code: number | null, stderr: string): string {
  const detail = stderr.trim();

  if (/not logged in|unauthenticated|authentication/i.test(detail)) {
    return "The Cursor CLI is not logged in. Run 'agent login' in a terminal, then try again.";
  }

  return detail || `The Cursor CLI exited with code ${code}.`;
}
