const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const env = { ...process.env };
if (process.platform === "win32") {
  // Java 17's AF_UNIX wakeup pipe fails on some Windows hosts. A nonexistent
  // socket directory makes its documented PipeImpl fallback use loopback TCP.
  const socketDirectory = resolve(".artifacts", `unavailable-unix-sockets-${process.pid}`);
  if (existsSync(socketDirectory)) throw new Error("Expected an unused emulator socket path.");
  env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS ?? ""} -Djdk.net.unixdomain.tmpdir="${socketDirectory.replaceAll("\\", "/")}"`.trim();
}
const command = 'npx --yes firebase-tools@13.35.1 emulators:exec --only firestore --project demo-copic-dual-agent --config firebase.emulators.json "npx tsx --test tests/agent-firestore.emulator.ts"';
const child = spawn(command, { shell: true, stdio: "inherit", env });
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
