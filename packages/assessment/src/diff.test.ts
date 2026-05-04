import { describe, expect, test } from "bun:test";
import { parseUnifiedDiff, type UnifiedDiffFileFacts } from "./diff";

describe("parseUnifiedDiff", () => {
  test("returns per-file additions and deletions without counting diff headers", () => {
    const files = parseUnifiedDiff(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 import { run } from "./run";
-const mode = "old";
+const mode = "new";
+console.log(mode);
 run(mode);
`);

    expect(files).toEqual<UnifiedDiffFileFacts[]>([
      {
        path: "src/app.ts",
        additions: 2,
        deletions: 1,
        is_test_file: false,
        is_sensitive_path: false,
      },
    ]);
  });

  test("parses multiple files and marks test files", () => {
    const files = parseUnifiedDiff(`diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
 export const value = 1;
+export const next = 2;
diff --git a/src/app.test.ts b/src/app.test.ts
--- a/src/app.test.ts
+++ b/src/app.test.ts
@@ -1,2 +1,2 @@
 import { expect, test } from "bun:test";
-test.todo("old");
+test("new", () => expect(1).toBe(1));
`);

    expect(files).toEqual([
      {
        path: "src/app.ts",
        additions: 1,
        deletions: 0,
        is_test_file: false,
        is_sensitive_path: false,
      },
      {
        path: "src/app.test.ts",
        additions: 1,
        deletions: 1,
        is_test_file: true,
        is_sensitive_path: false,
      },
    ]);
  });

  test("uses the created or deleted file path instead of /dev/null", () => {
    const files = parseUnifiedDiff(`diff --git a/dev/null b/tests/new.spec.ts
new file mode 100644
--- /dev/null
+++ b/tests/new.spec.ts
@@ -0,0 +1,2 @@
+import { test } from "bun:test";
+test("works", () => {});
diff --git a/src/removed.ts b/src/removed.ts
deleted file mode 100644
--- a/src/removed.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const removed = true;
-export const old = true;
`);

    expect(files).toEqual([
      {
        path: "tests/new.spec.ts",
        additions: 2,
        deletions: 0,
        is_test_file: true,
        is_sensitive_path: false,
      },
      {
        path: "src/removed.ts",
        additions: 0,
        deletions: 2,
        is_test_file: false,
        is_sensitive_path: false,
      },
    ]);
  });

  test("uses renamed destination paths", () => {
    const files =
      parseUnifiedDiff(`diff --git a/src/old-auth.ts b/src/new-auth.ts
similarity index 88%
rename from src/old-auth.ts
rename to src/new-auth.ts
--- a/src/old-auth.ts
+++ b/src/new-auth.ts
@@ -1 +1 @@
-export const name = "old";
+export const name = "new";
`);

    expect(files).toEqual([
      {
        path: "src/new-auth.ts",
        additions: 1,
        deletions: 1,
        is_test_file: false,
        is_sensitive_path: true,
      },
    ]);
  });

  test("marks CI, auth, deployment config, env, and migrations as sensitive", () => {
    const paths = [
      ".github/workflows/ci.yml",
      "src/auth/login.ts",
      "src/security/permissions.ts",
      "deploy/render.yaml",
      "config/production.yml",
      ".env.example",
      "db/migrations/001_create_users.sql",
    ];

    const diff = paths
      .map(
        (path) => `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-old
+new
`,
      )
      .join("");

    expect(
      parseUnifiedDiff(diff).map((file) => file.is_sensitive_path),
    ).toEqual(paths.map(() => true));
  });
});
