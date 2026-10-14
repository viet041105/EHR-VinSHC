import { execFileSync, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const directory = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
const vite = fileURLToPath(
  new URL("./node_modules/vite/bin/vite.js", import.meta.url),
);
const args = process.argv.slice(2);
// Vite uses the last supplied port, including `npm run dev -- --port 5174`.
let port = 5173;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--port") port = Number(args[++index]);
  else if (args[index].startsWith("--port="))
    port = Number(args[index].slice(7));
}

function command(program, parameters) {
  try {
    return execFileSync(program, parameters, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}

function listeners() {
  return command("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
}

function belongsToThisFrontend(pid) {
  const owner = command("ps", ["-p", String(pid), "-o", "uid="]);
  const invocation = command("ps", ["-p", String(pid), "-o", "command="]);
  const cwd = command("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const vitePaths = [vite, `${directory}/node_modules/.bin/vite`];
  return (
    Number(owner) === process.getuid() &&
    cwd.split("\n").includes(`n${directory}`) &&
    vitePaths.some(
      (path) =>
        invocation.includes(` ${path} `) || invocation.endsWith(` ${path}`),
    )
  );
}

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Cổng không hợp lệ.");
  if (process.platform === "darwin" || process.platform === "linux") {
    const previous = [...new Set(listeners())];
    // Inspect every listener before stopping anything; never stop another project's server.
    for (const pid of previous) {
      if (!belongsToThisFrontend(pid)) {
        throw new Error(
          `Cổng ${port} đang được ứng dụng khác sử dụng (PID ${pid}). Chạy npm run dev -- --port 5174 hoặc dừng ứng dụng đó.`,
        );
      }
    }
    for (const pid of previous) {
      console.log(
        `Khởi động lại Vite của FE trên cổng ${port} (dừng PID ${pid}).`,
      );
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    for (let attempt = 0; previous.length && listeners().length; attempt += 1) {
      if (attempt >= 40)
        throw new Error(
          `Vite cũ chưa giải phóng cổng ${port}; hãy dừng terminal cũ rồi thử lại.`,
        );
      await setTimeout(100);
    }
  }
  const child = spawn(process.execPath, [vite, ...args], {
    cwd: directory,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
