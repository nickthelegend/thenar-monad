/* nav.js — the navigation, on a narrow screen.
 *
 * Below 860px the primary nav was set to display:none with nothing put in its
 * place, so every page but the home page was reachable only by scrolling to
 * the footer — on the protocol page that is sixteen thousand pixels. This is
 * the button that was missing.
 */
const btn = document.querySelector(".navtoggle");
const nav = document.querySelector(".topnav");
if (btn && nav) {
  const setOpen = (open) => {
    btn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  setOpen(false);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  // Escape closes and hands focus back, so a keyboard user is never stranded
  // inside a panel they cannot see out of.
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      btn.focus();
    }
  });

  addEventListener("click", (e) => {
    if (btn.getAttribute("aria-expanded") !== "true") return;
    if (!nav.contains(e.target) && e.target !== btn) setOpen(false);
  });

  // Following a link should not leave the panel open behind the new page.
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });

  // Widening past the breakpoint restores the row; leave no stale state behind.
  matchMedia("(min-width: 861px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
}
