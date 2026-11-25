// try pixi: boot Debian (aarch64) in unkernel, mount pixi and a pixi project,
// and run `pixi install --frozen` in the guest. The guest has no general
// network: plain HTTP to conda.local is answered by this page's fetch() of
// prefix.dev (CORS: *; it serves conda-forge and robostack), the way trynix
// fetches from cache.nixos.org. The root file system's changes live on a
// persistent data disk in IndexedDB, so a reload keeps the installed env.
//
// URL parameters:
//   ?project=<name>          a project under /projects (default: cli)
//   ?toml=<url>&lock=<url>   any pixi.toml and pixi.lock instead
//   ?run=<command>           typed into the shell once the environment is installed
//   ?mem=<MiB>               guest memory (default 2048)
//   ?fresh=1                 don't keep anything: a memory-only disk
import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import RFB from "@novnc/novnc";
import { createKernel, fetchRoutes, MemoryFs } from "unkernel/web";
import { socketChannel } from "./vnc.js";
import { setupShare } from "./share.js";
import { setupPicker } from "./projects.js";

setupShare();

const params = new URLSearchParams(location.search);
const project = params.get("project") ?? "cli";
const tomlUrl = params.get("toml") ?? `/projects/${project}/pixi.toml`;
const lockUrl = params.get("lock") ?? `/projects/${project}/pixi.lock`;
const name = params.get("toml") ? "project" : project;
setupPicker(params.get("toml") ? null : project);
const run = params.get("run") ?? "";
const mem = Number(params.get("mem") ?? 2048);
const fresh = params.get("fresh") === "1";

const statusEl = document.getElementById("status");
const status = (s) => { statusEl.textContent = s; };

const term = new Terminal({ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, theme: { background: "#0f1115" }, cursorBlink: true });
const fit = new FitAddon();
term.loadAddon(fit);
term.open(document.getElementById("term"));
fit.fit();

const fetchBytes = async (url, label) => {
  status(`downloading ${label}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

// Guest HTTP to conda.local → the page's fetch of prefix.dev. Only the path
// goes across: forwarding the guest's headers (If-None-Match, ...) would make
// the browser send a CORS preflight.
let fetches = 0;
let fetchedBytes = 0;
const net = fetchRoutes(undefined, {
  "conda.local": async (req) => {
    const u = new URL(req.url);
    fetches++;
    const res = await fetch(`https://prefix.dev${u.pathname}${u.search}`);
    const body = await res.arrayBuffer();
    fetchedBytes += body.byteLength;
    status(`${fetches} fetches from prefix.dev · ${(fetchedBytes / 1e6).toFixed(1)} MB`);
    const headers = new Headers();
    for (const h of ["content-type", "etag", "last-modified", "cache-control"]) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(body, { status: res.status, headers });
  },
}, { log: (m) => console.debug("[net]", m) });

const MIRRORS = `[mirrors]
"https://conda.anaconda.org/" = ["http://conda.local/"]
"https://prefix.dev/" = ["http://conda.local/"]
`;

// Draw the guest's VNC server (Qt's vnc platform plugin) once something listens on :5900.
async function watchVnc(vm) {
  const side = document.getElementById("side");
  const screen = document.getElementById("screen");
  side.hidden = false;
  fit.fit();
  for (;;) {
    let sock;
    try {
      sock = await vm.connect(5900);
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    screen.classList.remove("waiting");
    screen.textContent = "";
    const rfb = new RFB(screen, socketChannel(sock));
    rfb.scaleViewport = true;
    window.rfb = rfb;
    await new Promise((r) => rfb.addEventListener("disconnect", r));
    screen.classList.add("waiting");
    screen.textContent = "turtlesim stopped · pixi run turtlesim";
  }
}

async function main() {
  const [pixi, toml, lock] = await Promise.all([
    fetchBytes("/bin/pixi", "pixi"),
    fetchBytes(tomlUrl, "pixi.toml"),
    fetchBytes(lockUrl, "pixi.lock"),
  ]);
  const tools = new MemoryFs();
  tools.writeFile("/pixi", pixi, { mode: 0o755 });
  tools.writeFile("/config.toml", MIRRORS);

  status("booting Debian…");
  const t0 = performance.now();
  const vm = await createKernel({
    distro: "/distros/debian.erofs",
    mem,
    worker: false, // fetchRoutes' handler is a function: keep the kernel on this thread
    net,
    // The root overlay's changes go here (IndexedDB), not to guest RAM: a
    // RoboStack env with Qt is ~2 GB unpacked.
    disks: [{ kind: "data", template: "bundled", name: "trypixi", size: 8 * 2 ** 30, ...(fresh ? { mode: "snapshot" } : {}) }],
    mounts: {
      "/opt/pixi": { fs: tools, readOnly: true },
      "/mnt/project": { fs: { "pixi.toml": toml, "pixi.lock": lock }, readOnly: true },
    },
  });
  window.vm = vm;
  status(`booted in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  const sh = await vm.spawn(undefined, [], { cols: term.cols, rows: term.rows });
  window.sh = sh;
  sh.output.pipeTo(new WritableStream({ write: (b) => term.write(b) }));
  term.onData((d) => sh.write(d));
  const resize = () => { fit.fit(); sh.resize(term.cols, term.rows); };
  window.addEventListener("resize", resize);
  term.focus();

  const isRos = new TextDecoder().decode(toml).includes("turtlesim");
  if (isRos) watchVnc(vm).then(resize);
  setTimeout(resize, 50);

  const setup = [
    "export PATH=/opt/pixi:$PATH",
    "mkdir -p ~/.pixi && cp /opt/pixi/config.toml ~/.pixi/config.toml",
    `mkdir -p ~/${name} && cp /mnt/project/pixi.toml /mnt/project/pixi.lock ~/${name}/ && cd ~/${name}`,
    "clear",
    "pixi install --frozen",
    "eval \"$(pixi shell-hook)\"",
    ...(isRos
      ? ["(setsid pixi run turtlesim > /tmp/turtlesim.log 2>&1 &)", "echo 'turtlesim is starting → try: pixi run teleop'"]
      : ["echo", "pixi task list", "echo 'try one with: pixi run <task>'"]),
  ].join(" && ");
  await sh.write(`${setup}${run ? ` && ${run}` : ""}\n`);
}

main().catch((e) => {
  console.error(e);
  status(`error: ${e.message}`);
  term.write(`\r\n\x1b[31m${e.stack ?? e}\x1b[0m\r\n`);
});
