// Install the turtlesim env in the guest, start turtlesim on Qt's VNC platform,
// and read the RFB banner over vm.connect(5900).
import { readFileSync, rmSync, truncateSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKernel, fetchDistro, fetchRoutes, MemoryFs, bundledBoot, loadKernelModule, createImageFromKwsparse, openDisk } from "unkernel/node";

const net = fetchRoutes(undefined, {
  "conda.local": async (req) => {
    const u = new URL(req.url);
    const res = await fetch(`https://prefix.dev${u.pathname}${u.search}`);
    return new Response(await res.arrayBuffer(), { status: res.status });
  },
});
const tools = new MemoryFs();
tools.writeFile("/pixi", new Uint8Array(readFileSync("vendor/pixi/pixi")), { mode: 0o755 });
tools.writeFile("/config.toml", `[mirrors]\n"https://conda.anaconda.org/" = ["http://conda.local/"]\n"https://prefix.dev/" = ["http://conda.local/"]\n`);
const DISK = process.env.DISK ?? join(tmpdir(), "trypixi-data.img");
rmSync(DISK, { force: true });
const mod = await loadKernelModule(readFileSync("node_modules/unkernel/dist/unkernel.wasm"));
console.log("template:", await createImageFromKwsparse(DISK, bundledBoot(mod).datadisk));
truncateSync(DISK, 8 * 2 ** 30);
const vm = await createKernel({
  disks: [await openDisk(DISK)],
  distro: await fetchDistro("debian"), mem: Number(process.env.MEM ?? 4096), net,
  mounts: { "/opt/pixi": tools, "/mnt/project": { "pixi.toml": readFileSync("envs/ros/pixi.toml"), "pixi.lock": readFileSync("envs/ros/pixi.lock") } },
});
const env = { PATH: "/opt/pixi:/usr/bin:/bin", HOME: "/home/user" };
const sh = async (cmd) => {
  const t = performance.now();
  const r = await vm.exec("bash", ["-c", cmd], { env, cwd: "/home/user" });
  console.log(`--- exit ${r.exitCode} in ${((performance.now() - t) / 1000).toFixed(1)}s: ${cmd.slice(0, 80)}\n${(r.stdout + r.stderr).trim().split("\n").slice(-12).join("\n")}`);
  return r;
};
await sh(`df -h / /data | tail -2; mkdir -p .pixi project && cp /opt/pixi/config.toml .pixi/ && cp /mnt/project/* project/ && cd project && pixi install -e turtlesim --frozen 2>&1 | tail -2; df -h / /data | tail -2; free -m | head -2`);
await sh(`cd project && (QT_QPA_PLATFORM=vnc:size=500x500 setsid pixi run -e turtlesim ros2 run turtlesim turtlesim_node > /tmp/ts.log 2>&1 &); for i in $(seq 60); do (echo > /dev/tcp/127.0.0.1/5900) 2>/dev/null && break; sleep 1; done; echo waited $i; cat /tmp/ts.log`);
const sock = await vm.connect(5900);
const reader = sock.readable.getReader();
const { value } = await reader.read();
console.log("RFB banner:", JSON.stringify(new TextDecoder().decode(value)));
await sh(`cd project && timeout 20 pixi run -e turtlesim ros2 topic echo --once /turtle1/pose 2>&1 | tail -8`);
process.exit(0);
