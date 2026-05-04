export type UnifiedDiffFileFacts = {
  path: string;
  additions: number;
  deletions: number;
  is_test_file: boolean;
  is_sensitive_path: boolean;
};

export type DiffFileFact = UnifiedDiffFileFacts;

type PendingFile = {
  diffPath?: string;
  oldPath?: string;
  newPath?: string;
  additions: number;
  deletions: number;
  inHunk: boolean;
};

export function parseUnifiedDiff(diff: string): UnifiedDiffFileFacts[] {
  const files: UnifiedDiffFileFacts[] = [];
  let current: PendingFile | undefined;

  const finishCurrent = () => {
    if (!current) {
      return;
    }

    const path = choosePath(current);
    if (!path && current.additions === 0 && current.deletions === 0) {
      current = undefined;
      return;
    }

    const normalizedPath = path || current.diffPath || "";
    files.push({
      path: normalizedPath,
      additions: current.additions,
      deletions: current.deletions,
      is_test_file: isTestFilePath(normalizedPath),
      is_sensitive_path: isSensitivePath(normalizedPath),
    });
    current = undefined;
  };

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      finishCurrent();
      const parsed = parseDiffGitLine(line);
      current = {
        diffPath: parsed?.newPath ?? parsed?.oldPath,
        additions: 0,
        deletions: 0,
        inHunk: false,
      };
      continue;
    }

    if (!current && line.startsWith("--- ")) {
      current = { additions: 0, deletions: 0, inHunk: false };
    }

    if (!current) {
      continue;
    }

    if (current.inHunk) {
      if (line.startsWith("+")) {
        current.additions += 1;
        continue;
      }
      if (line.startsWith("-")) {
        current.deletions += 1;
        continue;
      }
    }

    if (line.startsWith("@@")) {
      current.inHunk = true;
      continue;
    }

    if (line.startsWith("--- ")) {
      if (!current.diffPath && (current.oldPath || current.newPath)) {
        finishCurrent();
        current = { additions: 0, deletions: 0, inHunk: false };
      }
      current.oldPath = normalizeDiffPath(line.slice(4));
      current.inHunk = false;
      continue;
    }

    if (line.startsWith("+++ ")) {
      current.newPath = normalizeDiffPath(line.slice(4));
      current.inHunk = false;
      continue;
    }

    if (line.startsWith("rename from ")) {
      current.oldPath = normalizeDiffPath(line.slice("rename from ".length));
      continue;
    }

    if (line.startsWith("rename to ")) {
      current.newPath = normalizeDiffPath(line.slice("rename to ".length));
      continue;
    }
  }

  finishCurrent();
  return files;
}

function choosePath(file: PendingFile): string {
  if (file.newPath && file.newPath !== "/dev/null") {
    return file.newPath;
  }
  if (file.oldPath && file.oldPath !== "/dev/null") {
    return file.oldPath;
  }
  return file.diffPath ?? "";
}

function parseDiffGitLine(
  line: string,
): { oldPath: string; newPath: string } | undefined {
  const parts = splitDiffGitArgs(line.slice("diff --git ".length));
  if (parts.length < 2) {
    return undefined;
  }

  return {
    oldPath: normalizeDiffPath(parts[0] ?? ""),
    newPath: normalizeDiffPath(parts[1] ?? ""),
  };
}

function splitDiffGitArgs(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (inQuotes && char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function normalizeDiffPath(rawPath: string): string {
  const path = rawPath.split("\t", 1)[0]?.trim() ?? "";

  if (path === "/dev/null") {
    return path;
  }

  return stripDiffPrefix(path.replace(/\\/g, "/"));
}

function stripDiffPrefix(path: string): string {
  if (path.startsWith("a/") || path.startsWith("b/")) {
    return path.slice(2);
  }
  return path;
}

function isTestFilePath(path: string): boolean {
  const lowerPath = path.toLowerCase().replace(/\\/g, "/");
  const segments = lowerPath.split("/");
  const basename = segments.at(-1) ?? "";

  return (
    segments.some((segment) =>
      ["__test__", "__tests__", "test", "tests"].includes(segment),
    ) || /(^|[._-])(test|tests|spec|specs)([._-]|$)/.test(basename)
  );
}

function isSensitivePath(path: string): boolean {
  const lowerPath = path.toLowerCase().replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = lowerPath.split("/");
  const basename = segments.at(-1) ?? "";
  const tokens = lowerPath.split(/[\/._-]+/).filter(Boolean);

  if (isCiPath(lowerPath, segments, basename)) {
    return true;
  }

  if (isDatabaseMigrationPath(segments, basename)) {
    return true;
  }

  if (isDeploymentOrConfigPath(segments, basename)) {
    return true;
  }

  return tokens.some((token) =>
    [
      "acl",
      "auth",
      "authentication",
      "authorization",
      "iam",
      "jwt",
      "oauth",
      "oauth2",
      "permission",
      "permissions",
      "rbac",
      "security",
      "sso",
    ].includes(token),
  );
}

function isCiPath(
  lowerPath: string,
  segments: string[],
  basename: string,
): boolean {
  return (
    lowerPath.startsWith(".github/workflows/") ||
    lowerPath.startsWith(".github/actions/") ||
    segments.includes(".circleci") ||
    segments.includes(".buildkite") ||
    segments.includes("workflows") ||
    [
      ".gitlab-ci.yml",
      ".gitlab-ci.yaml",
      ".travis.yml",
      "appveyor.yml",
      "azure-pipelines.yml",
      "bitbucket-pipelines.yml",
      "buildkite.yml",
      "jenkinsfile",
    ].includes(basename)
  );
}

function isDatabaseMigrationPath(
  segments: string[],
  basename: string,
): boolean {
  return (
    segments.includes("migrations") ||
    segments.includes("migration") ||
    (segments.includes("migrate") &&
      /\.(sql|js|jsx|ts|tsx|mjs|cjs|py|rb|go)$/.test(basename))
  );
}

function isDeploymentOrConfigPath(
  segments: string[],
  basename: string,
): boolean {
  return (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename.endsWith(".env") ||
    /(^|[._-])env([._-]|$)/.test(basename) ||
    /(^|[._-])config([._-]|$)/.test(basename) ||
    segments.some((segment) =>
      [
        "config",
        "configs",
        "deploy",
        "deployment",
        "deployments",
        "helm",
        "infra",
        "infrastructure",
        "k8s",
        "kubernetes",
        "terraform",
      ].includes(segment),
    ) ||
    [
      "dockerfile",
      "docker-compose.yml",
      "docker-compose.yaml",
      "fly.toml",
      "netlify.toml",
      "procfile",
      "railway.json",
      "render.yaml",
      "render.yml",
      "vercel.json",
      "wrangler.toml",
    ].includes(basename) ||
    /\.(tf|tfvars)$/.test(basename)
  );
}
