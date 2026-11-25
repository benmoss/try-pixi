// pixi in the guest, with no general network: the guest's only route is plain
// HTTP to "conda.local", answered by the host's fetch() of prefix.dev (CORS: *,
// and it mirrors conda-forge and robostack). pixi is mounted from the host.
//
//   node test/node-pixi-routed.mjs [project dir] [command ...]
import { readFileSync } from "node:fs";
import { createKernel, fetchDistro, fetchRoutes, MemoryFs } from "unkernel/node";

const project = process.argv[2] ?? new URL("../envs/demo", import.meta.url).pathname;
const commands = process.argv.slice(3);
if (!commands.length) commands.push(`pixi run python -c "import numpy, rich; rich.print('[bold]numpy', numpy.__version__)"`);

let fetches = 0;
let bytes = 0;
const net = fetchRoutes(undefined, {
  "conda.local": async (req) => {
    fetches++;
    const u = new URL(req.url);
    const res = await fetch(`https://prefix.dev${u.pathname}${u.search}`);
    const body = await res.arrayBuffer();
    bytes += body.byteLength;
    return new Response(body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" } });
  },
});

const config = `[mirrors]
"https://conda.anaconda.org/" = ["http://conda.local/"]
"https://prefix.dev/" = ["http://conda.local/"]
`;
const tools = new MemoryFs();
tools.writeFile("/pixi", new Uint8Array(readFileSync(new URL("../vendor/pixi/pixi", import.meta.url))), { mode: 0o755 });
tools.writeFile("/config.toml", config);
const vm = await createKernel({
  distro: await fetchDistro("debian"),
  mem: Number(process.env.MEM ?? 2048),
  net,
  mounts: {
    "/opt/pixi": tools,
    "/mnt/project": { "pixi.toml": readFileSync(`${project}/pixi.toml`), "pixi.lock": readFileSync(`${project}/pixi.lock`) },
  },
});
const env = { PATH: "/opt/pixi:/usr/bin:/bin", HOME: "/home/user" };
const step = async (label, cmd) => {
  const t = performance.now();
  const r = await vm.exec("bash", ["-c", cmd], { env, cwd: "/home/user" });
  console.log(`--- ${label}: exit ${r.exitCode} in ${((performance.now() - t) / 1000).toFixed(1)}s (${fetches} fetches, ${(bytes / 1e6).toFixed(0)} MB)`);
  console.log((r.stdout + r.stderr).trim().split("\n").slice(-25).join("\n"));
  return r.exitCode;
};
let failed = await step("setup", `mkdir -p .pixi project && cp /opt/pixi/config.toml .pixi/ && cp /mnt/project/* project/`)
  || await step("pixi install --frozen", `cd project && pixi install --frozen 2>&1 && df -h / | tail -1 && free -m`);
for (const c of commands) failed ||= await step(c, `cd project && ${c}`);
process.exit(failed ? 1 : 0);
