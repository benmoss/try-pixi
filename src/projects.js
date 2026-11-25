// The header's project picker. Sizes are the compressed downloads of each
// lockfile (pixi list); time is a first install on a desktop browser.
export const PROJECTS = [
  { id: "cli", label: "cli: ripgrep, bat, btop, jq… (19 MB, seconds)" },
  { id: "duckdb", label: "duckdb: SQL engine (24 MB, seconds)" },
  { id: "python", label: "python: numpy + rich (66 MB, ~15 s)" },
  { id: "ros", label: "ros: ROS 2 + turtlesim (340 MB, ~2.5 min)" },
];

export function setupPicker(current) {
  const sel = document.getElementById("project");
  for (const p of PROJECTS) sel.add(new Option(p.label, p.id, false, p.id === current));
  if (!current) sel.add(new Option("custom (?toml=&lock=)", "", true, true));
  sel.addEventListener("change", () => {
    if (!sel.value) return;
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set("project", sel.value);
    location.href = u;
  });
}
