// The header's Share button: the native share sheet where there is one
// (phones), else a small menu. Shares the current URL, so ?project= and
// ?toml=/?lock= links carry over.
const TEXT = "conda-forge packages running in a Linux VM in my browser tab, installed with pixi. No server, no install.";

export function setupShare() {
  const btn = document.getElementById("share");
  const menu = document.getElementById("share-menu");
  const copy = document.getElementById("share-copy");
  const url = () => location.href;
  const set = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };

  const refresh = () => {
    const u = encodeURIComponent(url());
    const t = encodeURIComponent(TEXT);
    document.getElementById("share-x").href = `https://x.com/intent/post?text=${t}&url=${u}`;
    document.getElementById("share-bsky").href = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${TEXT} ${url()}`)}`;
    document.getElementById("share-li").href = `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
  };

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const mobile = matchMedia("(pointer: coarse)").matches;
    if (mobile && navigator.share) {
      try { await navigator.share({ title: "try pixi", text: TEXT, url: url() }); } catch {}
      return;
    }
    refresh();
    set(menu.hidden);
  });
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url()); copy.textContent = "Copied!"; }
    catch { prompt("Copy this link:", url()); }
    setTimeout(() => { copy.textContent = "Copy link"; set(false); }, 900);
  });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".share")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
}
