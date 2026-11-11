// Jumping to a section of the current page (e.g. "/en#new" while already on /en).
// Next's router can glue the hash onto the old one ("/en#new#new"), so for a link to a
// section of the page that is already open we scroll ourselves and set a clean address.
// Returns false when the link points to another page; the caller then navigates normally.
export function scrollToSection(href: string): boolean {
  const at = href.indexOf("#");
  if (at < 0) return false;
  const path = href.slice(0, at);
  const id = decodeURIComponent(href.slice(at + 1));
  if (path && path.replace(/\/$/, "") !== window.location.pathname.replace(/\/$/, "")) return false;
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(window.history.state, "", `${window.location.pathname}#${encodeURIComponent(id)}`);
  return true;
}
