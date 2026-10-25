import { useEffect } from "react";

/** On phones, every <table> inside <main> is shown as a list of cards instead of a wide grid.
 *  The CSS (index.css, `.m-cards`) does the layout; this only labels the cells from the header row
 *  and tags the first text cell as the card title. Add data-no-cards to a table to opt out. */
export function useMobileTables() {
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    const apply = () => {
      main.querySelectorAll<HTMLTableElement>("table:not([data-no-cards])").forEach((t) => {
        t.classList.add("m-cards");
        const heads = Array.from(t.querySelectorAll("thead th")).map((th) => (th.textContent ?? "").trim());
        t.querySelectorAll("tbody tr").forEach((tr) => {
          let primaryDone = false;
          Array.from(tr.children).forEach((cell, i) => {
            const td = cell as HTMLElement;
            if (td.dataset.kind) return;
            const label = heads[i] ?? "";
            const text = (td.textContent ?? "").trim();
            const isCheck = !!td.querySelector('input[type="checkbox"]') && !text;
            td.dataset.label = label;
            if (td.hasAttribute("colspan")) td.dataset.kind = "span";
            else if (isCheck) td.dataset.kind = "check";
            else if (!label) td.dataset.kind = "actions";
            else if (!primaryDone) { td.dataset.kind = "primary"; primaryDone = true; }
            else td.dataset.kind = "field";
          });
        });
      });
    };

    apply();
    const mo = new MutationObserver(apply);
    mo.observe(main, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
}
