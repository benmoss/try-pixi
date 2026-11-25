# try pixi

conda-forge and RoboStack packages on a Linux VM in the browser:
[unkernel](https://github.com/pithings/unkernel) boots Debian (aarch64) in WebAssembly, and
the real `pixi` (linux-aarch64) installs a `pixi.lock` inside it. The default project is
`cli` (a few command-line tools, installed in seconds); `?project=ros` is ROS 2 Jazzy with
turtlesim, drawn in the page. Inspired by [trynix](https://github.com/fzakaria/trynix).

## How it works

- **Packages, with no relay or server.** The guest's only network route is plain HTTP to
  `conda.local`, which unkernel's `fetchRoutes` answers with the page's own `fetch()` of
  `prefix.dev` (CORS `*`, and it mirrors both conda-forge and RoboStack; conda.anaconda.org
  sends no CORS headers for the robostack channels). pixi is pointed there with mirrors:
  ```toml
  [mirrors]
  "https://conda.anaconda.org/" = ["http://conda.local/"]
  "https://prefix.dev/" = ["http://conda.local/"]
  ```
  `pixi install --frozen`, `pixi add` (solving with sharded repodata) and `pixi run` all work.
- **Storage.** A RoboStack env with Qt is about 2 GB unpacked, more than fits in guest RAM
  (about 2 GB). The root overlay's changes go to unkernel's persistent data disk (8 GB,
  IndexedDB), so a reload reuses the installed env.
- **turtlesim's window.** There is no display server. Qt runs with `QT_QPA_PLATFORM=vnc`,
  the page reaches the guest's `127.0.0.1:5900` with `vm.connect()` (vsock, no network), and
  noVNC draws it through a WebSocket-shaped wrapper (`src/vnc.js`). Qt sends BGR, so a CSS
  filter swaps red and blue back.

## Run it

```sh
npm install
mkdir -p vendor/pixi && curl -sL https://github.com/prefix-dev/pixi/releases/download/v0.84.2/pixi-aarch64-unknown-linux-musl.tar.gz | tar xz -C vendor/pixi
node -e 'import("unkernel/node").then(m => m.fetchDistro("debian")).then(console.log)'   # downloads debian.erofs
mkdir -p public/bin public/distros
ln -sf ../../vendor/pixi/pixi public/bin/pixi
ln -sf ~/.cache/unkernel/v0.2.0-261124-75694e2/debian.erofs public/distros/debian.erofs
npx vite
```

Open http://localhost:5199/. The ROS project's first load downloads about 340 MB of packages; later
loads reuse the disk. URL parameters: `?project=cli|duckdb|python|ros`, `?toml=<url>&lock=<url>` (any project,
e.g. raw.githubusercontent.com links), `?run=<command>`, `?mem=<MiB>`, `?fresh=1` (memory-only disk).

Projects live in `envs/` (source) and `public/projects/` (served copies).

Node versions of the same flow: `node test/node-pixi-routed.mjs envs/ros '<command>'` and
`node test/node-turtlesim-vnc.mjs`.
