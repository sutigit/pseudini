export type LargeRequestRoute = "local" | "provider";

export interface PseudiniConfiguration {
  readonly ollamaUrl: string;
  readonly model: string;
  readonly largeRequestRoute: LargeRequestRoute;
  readonly providerBaseUrl: string;
  readonly providerModel: string;
}

export type ProjectConfigurationOverrides = Partial<PseudiniConfiguration>;

export const DEFAULT_PSEUDINI_CONFIGURATION: PseudiniConfiguration = {
  ollamaUrl: "http://127.0.0.1:11434",
  model: "qwen2.5-coder:3b",
  largeRequestRoute: "local",
  providerBaseUrl: "",
  providerModel: "",
};

const CONFIGURATION_KEYS = new Set<keyof PseudiniConfiguration>([
  "ollamaUrl",
  "model",
  "largeRequestRoute",
  "providerBaseUrl",
  "providerModel",
]);

export function parseProjectConfiguration(
  content: string,
): ProjectConfigurationOverrides {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch {
    throw new ProjectConfigurationError(
      ".cursor/pseudini-config.json must contain valid JSON.",
    );
  }

  if (!isRecord(value)) {
    throw new ProjectConfigurationError(
      ".cursor/pseudini-config.json must contain a JSON object.",
    );
  }

  for (const key of Object.keys(value)) {
    if (!CONFIGURATION_KEYS.has(key as keyof PseudiniConfiguration)) {
      throw new ProjectConfigurationError(
        `.cursor/pseudini-config.json contains an unknown setting: "${key}".`,
      );
    }
  }

  return {
    ...readNonEmptyString(value, "ollamaUrl"),
    ...readNonEmptyString(value, "model"),
    ...readLargeRequestRoute(value),
    ...readString(value, "providerBaseUrl"),
    ...readString(value, "providerModel"),
  };
}

export function mergeProjectConfiguration(
  base: PseudiniConfiguration,
  overrides: ProjectConfigurationOverrides,
): PseudiniConfiguration {
  return { ...base, ...overrides };
}

function readNonEmptyString<K extends "ollamaUrl" | "model">(
  value: Record<string, unknown>,
  key: K,
): Partial<Pick<PseudiniConfiguration, K>> {
  const property = value[key];
  if (property === undefined) {
    return {};
  }
  if (typeof property !== "string" || !property.trim()) {
    throw new ProjectConfigurationError(
      `.cursor/pseudini-config.json setting "${key}" must be a non-empty string.`,
    );
  }

  return { [key]: property.trim() } as Partial<Pick<PseudiniConfiguration, K>>;
}

function readString<K extends "providerBaseUrl" | "providerModel">(
  value: Record<string, unknown>,
  key: K,
): Partial<Pick<PseudiniConfiguration, K>> {
  const property = value[key];
  if (property === undefined) {
    return {};
  }
  if (typeof property !== "string") {
    throw new ProjectConfigurationError(
      `.cursor/pseudini-config.json setting "${key}" must be a string.`,
    );
  }

  return { [key]: property.trim() } as Partial<Pick<PseudiniConfiguration, K>>;
}

function readLargeRequestRoute(
  value: Record<string, unknown>,
): Partial<Pick<PseudiniConfiguration, "largeRequestRoute">> {
  const route = value.largeRequestRoute;
  if (route === undefined) {
    return {};
  }
  if (route !== "local" && route !== "provider") {
    throw new ProjectConfigurationError(
      '.cursor/pseudini-config.json setting "largeRequestRoute" must be ' +
        '"local" or "provider".',
    );
  }

  return { largeRequestRoute: route };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ProjectConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectConfigurationError";
  }
}
