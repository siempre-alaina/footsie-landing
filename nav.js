/* footsie.ai — mobile navigation toggle.
 *
 * Below 920px the nav links collapse behind a button (see the media query in
 * styles.css). Everything else on the page is static, so this is the only
 * interactive behaviour on the site.
 */
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.getElementById("nav-links");
  if (!toggle || !links) return;

  function setOpen(open) {
    links.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", function () {
    setOpen(!links.classList.contains("is-open"));
  });

  // Following a link should close the menu — the anchors scroll within the
  // same page, so without this the panel would stay open over the target.
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && links.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // If the viewport grows past the breakpoint the panel is no longer relevant;
  // clear the state so the desktop layout isn't left with a stale is-open.
  window.addEventListener("resize", function () {
    if (window.innerWidth > 920) setOpen(false);
  });
})();
