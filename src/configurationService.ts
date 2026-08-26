import * as vscode from "vscode";
import {
  DEFAULT_PSEUDINI_CONFIGURATION,
  mergeProjectConfiguration,
  parseProjectConfiguration,
  ProjectConfigurationError,
  ProjectConfigurationOverrides,
  PseudiniConfiguration,
} from "./projectConfiguration";

const CONFIGURATION_SECTION = "pseudini";
const PROJECT_CONFIGURATION_PATTERN = "**/.cursor/pseudini-config.json";
const PROJECT_CONFIGURATION_PATH = [".cursor", "pseudini-config.json"] as const;

export class ConfigurationService implements vscode.Disposable {
  private readonly projectConfigurations = new Map<
    string,
    Promise<ProjectConfigurationOverrides>
  >();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | undefined>();
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly settingsListener: vscode.Disposable;

  public readonly onDidChange = this.changeEmitter.event;

  public constructor(private readonly output: vscode.OutputChannel) {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      PROJECT_CONFIGURATION_PATTERN,
    );
    this.watcher.onDidCreate((uri) => this.invalidateProject(uri));
    this.watcher.onDidChange((uri) => this.invalidateProject(uri));
    this.watcher.onDidDelete((uri) => this.invalidateProject(uri));
    this.settingsListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIGURATION_SECTION)) {
        this.changeEmitter.fire(undefined);
      }
    });
  }

  public async resolve(resource?: vscode.Uri): Promise<PseudiniConfiguration> {
    const workspace = resolveWorkspaceFolder(resource);
    const configurationResource = resource ?? workspace?.uri;
    const base = readCursorConfiguration(configurationResource);
    if (!workspace) {
      return base;
    }

    const overrides = await this.readProjectConfiguration(workspace);
    return mergeProjectConfiguration(base, overrides);
  }

  public dispose(): void {
    this.watcher.dispose();
    this.settingsListener.dispose();
    this.changeEmitter.dispose();
    this.projectConfigurations.clear();
  }

  private readProjectConfiguration(
    workspace: vscode.WorkspaceFolder,
  ): Promise<ProjectConfigurationOverrides> {
    const key = workspace.uri.toString();
    let configuration = this.projectConfigurations.get(key);
    if (!configuration) {
      configuration = readProjectConfiguration(workspace.uri);
      this.projectConfigurations.set(key, configuration);
    }
    return configuration;
  }

  private invalidateProject(configurationUri: vscode.Uri): void {
    const workspace = vscode.workspace.getWorkspaceFolder(configurationUri);
    if (!workspace) {
      return;
    }

    this.projectConfigurations.delete(workspace.uri.toString());
    this.output.appendLine(
      `[info] project configuration changed file=${configurationUri.fsPath}`,
    );
    this.changeEmitter.fire(workspace.uri);
  }
}

function resolveWorkspaceFolder(
  resource?: vscode.Uri,
): vscode.WorkspaceFolder | undefined {
  if (resource) {
    const workspace = vscode.workspace.getWorkspaceFolder(resource);
    if (workspace) {
      return workspace;
    }
  }

  const activeResource = vscode.window.activeTextEditor?.document.uri;
  return (
    (activeResource && vscode.workspace.getWorkspaceFolder(activeResource)) ||
    vscode.workspace.workspaceFolders?.[0]
  );
}

function readCursorConfiguration(resource?: vscode.Uri): PseudiniConfiguration {
  const configuration = vscode.workspace.getConfiguration(
    CONFIGURATION_SECTION,
    resource,
  );
  const route = configuration.get<string>(
    "largeRequestRoute",
    DEFAULT_PSEUDINI_CONFIGURATION.largeRequestRoute,
  );

  return {
    ollamaUrl: configuration
      .get<string>("ollamaUrl", DEFAULT_PSEUDINI_CONFIGURATION.ollamaUrl)
      .trim(),
    model: configuration
      .get<string>("model", DEFAULT_PSEUDINI_CONFIGURATION.model)
      .trim(),
    largeRequestRoute: route === "provider" ? "provider" : "local",
    providerBaseUrl: configuration
      .get<string>(
        "providerBaseUrl",
        DEFAULT_PSEUDINI_CONFIGURATION.providerBaseUrl,
      )
      .trim(),
    providerModel: configuration
      .get<string>("providerModel", DEFAULT_PSEUDINI_CONFIGURATION.providerModel)
      .trim(),
  };
}

async function readProjectConfiguration(
  workspaceUri: vscode.Uri,
): Promise<ProjectConfigurationOverrides> {
  const configurationUri = vscode.Uri.joinPath(
    workspaceUri,
    ...PROJECT_CONFIGURATION_PATH,
  );
  let content: Uint8Array;

  try {
    content = await vscode.workspace.fs.readFile(configurationUri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return {};
    }

    throw new ProjectConfigurationError(
      `Could not read ${configurationUri.fsPath}: ${readErrorMessage(error)}`,
    );
  }

  return parseProjectConfiguration(new TextDecoder().decode(content));
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
