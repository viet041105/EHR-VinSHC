import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
// The backend source now lives in this repository (infra/backend); build it from the working tree.
const fe = dirname(fileURLToPath(import.meta.url)),
  repo = resolve(fe, "../..");
const python = process.platform === "win32" ? "python" : "python3";
const command = process.argv[2] || "status";
function run(executable, args, options = {}) {
  const r = spawnSync(executable, args, {
    cwd: repo,
    stdio: "inherit",
    ...options,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (command === "prepare") {
  run(python, [join(repo, "scripts/bootstrap.py")]);
  console.log(
    "Backend source: working tree",
    repo,
    "; settings: .env at the repository root (not committed).",
  );
} else {
  if (!existsSync(join(repo, ".env")))
    throw Error("Chạy npm run backend:prepare trước.");
  const args = [
    "compose",
    "--project-directory",
    repo,
    "-f",
    join(repo, "compose.yaml"),
    "-f",
    join(repo, "tests/integration/compose.b4-metadata.yaml"),
    "-f",
    join(fe, "compose.local.yaml"),
    "-p",
    "vinshc-fe-local",
  ];
  const operations = {
    build: ["build", "backend"],
    up: ["up", "-d", "--no-build", "--wait", "--wait-timeout", "2400"],
    status: ["ps"],
    down: ["down"],
  };
  if (!operations[command])
    throw Error("Dùng prepare, build, up, status hoặc down.");
  const child = spawn("docker", [...args, ...operations[command]], {
    cwd: repo,
    stdio: "inherit",
    env:
      command === "build"
        ? { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" }
        : process.env,
  });
  child.on("error", () => {
    console.error("Không chạy được Docker. Kiểm tra Docker Desktop.");
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}
