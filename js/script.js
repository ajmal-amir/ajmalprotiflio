/* =========================================================
   Portfolio page behaviour
   - Navigation (mobile menu, active section, smooth focus)
   - Projects "View All", detail dialogs (projects/services/experience)
   - Chatbot launch hooks (AI Recruiter Assistant lives in widget.js)
   - Contact form -> Google Apps Script (hardened, unchanged logic)
   - Private repo modal
   - Visitor counter
   ========================================================= */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- Mobile menu ---------------- */
const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.getElementById("nav-menu");

function setMenu(open) {
  if (!navToggle || !navMenu) return;
  navMenu.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  navToggle.innerHTML = open
    ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
}
// Kept for backward compatibility with the previous markup
function openMenu() { setMenu(true); }
function closeMenu() { setMenu(false); }

if (navToggle) {
  navToggle.addEventListener("click", () => setMenu(!navMenu.classList.contains("is-open")));
}
if (navMenu) {
  navMenu.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) setMenu(false);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && navMenu && navMenu.classList.contains("is-open")) {
    setMenu(false);
    navToggle.focus();
  }
});

/* ---------------- Active section highlighting ---------------- */
(function activeNav() {
  const links = [...document.querySelectorAll(".nav-links a[data-nav]")];
  const sections = links
    .map((a) => document.getElementById(a.dataset.nav))
    .filter(Boolean);
  if (!sections.length) return;

  // Services and Experience share one row on desktop, so they start at the
  // same height. Remember the clicked link while its section is in view.
  let clickedId = null;
  links.forEach((a) => a.addEventListener("click", () => {
    clickedId = a.dataset.nav;
    // if the page doesn't need to scroll (same row), no scroll event fires
    setTimeout(update, 50);
  }));

  function update() {
    const offset = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h"), 10) || 72) + 40;
    let current = sections[0].id;
    let currentTop = -Infinity;
    for (const s of sections) {
      const top = Math.round(s.getBoundingClientRect().top - offset);
      // ties (same row) keep the first section
      if (top <= 0 && top > currentTop) { current = s.id; currentTop = top; }
    }
    if (clickedId) {
      const el = document.getElementById(clickedId);
      const top = el ? Math.round(el.getBoundingClientRect().top - offset) : NaN;
      if (top === currentTop) current = clickedId; // same row as the computed one
      else if (!(Math.abs(top) < 80)) clickedId = null; // user scrolled elsewhere
    }
    // At the very bottom, the last section is active
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1].id;
    }
    for (const a of links) {
      const on = a.dataset.nav === current;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  }

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

/* ---------------- Focus target after in-page jumps ---------------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[data-focus]');
  if (!a) return;
  const field = document.getElementById(a.dataset.focus);
  if (field) setTimeout(() => field.focus({ preventScroll: true }), prefersReducedMotion ? 0 : 600);
});

/* ---------------- Reveal on scroll ---------------- */
(function reveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || prefersReducedMotion) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach((el) => io.observe(el));
})();

/* ---------------- About image: working photo -> Charlotte skyline ----------------
   Starts with Ajmal at work. Once the visitor scrolls past the image, it
   crossfades to the skyline and stays that way for the rest of the visit
   (no switching back on scroll-up). A new visit / reload starts over. */
(function aboutImageSwap() {
  const fig = document.getElementById("aboutMedia");
  if (!fig) return;
  const working = fig.querySelector(".about__img--working");
  const city = fig.querySelector(".about__img--city");
  let done = false;

  function swap() {
    if (done) return;
    done = true;
    fig.classList.add("is-swapped");
    if (working) working.setAttribute("aria-hidden", "true");
    if (city) city.removeAttribute("aria-hidden");
    window.removeEventListener("scroll", check);
  }

  function check() {
    // "passed" = the image's bottom edge has scrolled above the sticky header
    const header = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h"), 10) || 72;
    if (fig.getBoundingClientRect().bottom < header) swap();
  }

  window.addEventListener("scroll", check, { passive: true });
})();

/* ---------------- Project count (kept in sync with the page) ---------------- */
(function projectCount() {
  const n = document.querySelectorAll("[data-project-item]").length;
  if (!n) return;
  document.querySelectorAll("[data-project-count]").forEach((el) => { el.textContent = String(n); });
})();

/* ---------------- View all projects ---------------- */
(function allProjects() {
  const btn = document.getElementById("toggle-all-projects");
  const panel = document.getElementById("all-projects");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector("span").textContent = open ? "Show Fewer Projects" : "View All Projects";
    if (open) {
      panel.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
      panel.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }
  });
})();

/* ---------------- Detail dialog ---------------- */
const detailDialog = document.getElementById("detailDialog");
const detailBody = document.getElementById("detailBody");
let detailReturnFocus = null;

function openDetail(key, opener) {
  const tpl = document.getElementById(`detail-${key}`);
  if (!tpl || !detailDialog || !detailBody) return;
  detailBody.replaceChildren(tpl.content.cloneNode(true));
  detailBody.scrollTop = 0;
  detailReturnFocus = opener || document.activeElement;
  if (typeof detailDialog.showModal === "function") {
    detailDialog.showModal();
  } else {
    detailDialog.setAttribute("open", "");
  }
}

function closeDetail() {
  if (!detailDialog || !detailDialog.open) return;
  if (typeof detailDialog.close === "function") detailDialog.close();
  else detailDialog.removeAttribute("open");
}

if (detailDialog) {
  detailDialog.addEventListener("close", () => {
    if (detailReturnFocus && document.contains(detailReturnFocus)) {
      detailReturnFocus.focus({ preventScroll: true });
    }
    detailReturnFocus = null;
  });
  // click on backdrop closes
  detailDialog.addEventListener("click", (e) => {
    if (e.target === detailDialog) closeDetail();
  });
}

document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-dialog-close]");
  if (closer && detailDialog && detailDialog.contains(closer)) {
    detailReturnFocus = null; // the link navigates elsewhere
    closeDetail();
    return;
  }

  const trigger = e.target.closest("[data-detail]");
  if (trigger) {
    e.preventDefault();
    openDetail(trigger.dataset.detail, trigger);
    return;
  }

  // Whole featured-project card opens its details
  const card = e.target.closest(".project-card");
  if (card && !e.target.closest("a, button")) {
    const btn = card.querySelector("[data-detail]");
    if (btn) openDetail(btn.dataset.detail, btn);
  }
});

/* ---------------- AI Recruiter Assistant launchers ---------------- */
function openChatbot() {
  closeDetail();
  if (window.AjmalBot && typeof window.AjmalBot.open === "function") {
    window.AjmalBot.open();
    return;
  }
  // Fallback for the original widget API
  const bot = document.getElementById("ajmal-bot");
  if (bot) bot.classList.remove("minimized");
}

document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open-chat]");
  if (!opener) return;
  e.preventDefault();
  openChatbot();
});

/* ---------------- Footer year ---------------- */
(function year() {
  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();

/* this is link to the email service  for the screpit where emails are sent
https://script.google.com/u/0/home/projects/1HttZA4IJl3RsfAwSqEPrrDrN24fCM6ygCo-oJzEZwA67cx7mhgRwniN2/edit
*/

/* ---------------- Google Sheet form submit (hardened) ---------------- */
const scriptURL =
  "https://script.google.com/macros/s/AKfycbzfj5cQ51aIpdM7EKL3KEwQZPWx7DKViTO51Sz0CEkaO16M_i2LBQUb9uwOAsC0ONj0/exec";
const form = document.forms["submit-to-google-sheet"];
const msg = document.getElementById("msg");

/* OPTIONAL: reCAPTCHA v3 site key (leave empty to skip) */
const RECAPTCHA_SITE_KEY = ""; // e.g. "6Lc...your_site_key..."

/* Set timestamp when DOM is ready */
document.addEventListener("DOMContentLoaded", () => {
  const ts = document.getElementById("form_ts");
  if (ts) ts.value = String(Date.now());
});

const URL_REGEX =
  /\b((?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+\.(?:com|net|org|info|io|xyz|site|ru|cn|top|shop|online)\b[^\s]*)/i;
const BAD_WORDS = [
  "porn",
  "xxx",
  "sex",
  "escort",
  "onlyfans",
  "camgirl",
  "adult",
  "nsfw",
  "casino",
  "betting",
  "gambling",
  "bitcoin",
  "forex",
  "viagra",
  "cialis",
  "loan",
  "credit repair",
  "telegram.me",
  "t.me",
  "whatsapp",
  "click here",
].map((w) => w.toLowerCase());

function looksBad(text) {
  const t = (text || "").toLowerCase();
  if (URL_REGEX.test(t)) return "Links are not allowed in the message.";
  for (const w of BAD_WORDS) {
    if (t.includes(w)) return "Your message contains prohibited content.";
  }
  return "";
}

/* simple per-page rate limit: max 1 submit every 20s */
let lastSubmitAt = 0;

async function maybeGetRecaptchaToken() {
  if (!RECAPTCHA_SITE_KEY || !window.grecaptcha) return "";
  try {
    await grecaptcha.ready();
    return await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "contact" });
  } catch {
    return "";
  }
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // basic client checks
    const name = form.name?.value || "";
    const email = form.email?.value || "";
    const message = form.message?.value || "";
    const hp = form.company?.value || "";
    const tsVal = Number(form.form_ts?.value || 0);
    const now = Date.now();

    // honeypot => bail silently
    if (hp.trim()) {
      form.reset();
      return;
    }

    // too-fast submit (under 3s)
    if (tsVal && now - tsVal < 3000) {
      msg.textContent = "Please wait a moment before submitting.";
      return;
    }

    // per-page rate limit
    if (now - lastSubmitAt < 20000) {
      msg.textContent =
        "Please wait a few seconds before sending another message.";
      return;
    }

    // content checks
    const badReason = looksBad(`${name}\n${message}`);
    if (badReason) {
      msg.textContent = badReason;
      return;
    }

    // basic length checks
    if (name.length > 120 || message.length > 3000) {
      msg.textContent = "Message is too long.";
      return;
    }

    // optional reCAPTCHA token
    const token = await maybeGetRecaptchaToken();

    try {
      const fd = new FormData(form);
      if (token) fd.append("recaptcha_token", token);

      await fetch(scriptURL, { method: "POST", body: fd, mode: "no-cors" });
      lastSubmitAt = now;
      msg.textContent = "Message sent successfully";
      if (window.aaTrack) window.aaTrack("contact_form_submit");
      setTimeout(() => {
        msg.textContent = "";
      }, 5000);
      form.reset();
    } catch (err) {
      console.error("Error!", err);
      msg.textContent = "Failed to send. Try again.";
    }
  });
}

/* ---------------- Private repo modal ---------------- */
document.addEventListener("click", (e) => {
  const link = e.target.closest("a.private-repo"); // link with class "private-repo"
  if (!link) return;

  e.preventDefault(); // prevent navigation
  const modal = document.getElementById("privateRepoModal");
  if (!modal) return;

  const nameSpan = modal.querySelector("#modalProject");
  if (nameSpan)
    nameSpan.textContent = link.dataset.project || "This repository";

  // A <dialog> in the top layer would cover this modal; close it first.
  detailReturnFocus = null;
  closeDetail();
  openPrivateRepoModal(modal);
});

function openPrivateRepoModal(modal) {
  modal.hidden = false;
  const first =
    modal.querySelector(".modal__close") ||
    modal.querySelector("[data-close]") ||
    modal;
  first && first.focus();
  document.addEventListener("keydown", escClosePrivateModal);
}

function escClosePrivateModal(ev) {
  if (ev.key === "Escape")
    closePrivateRepoModal(document.getElementById("privateRepoModal"));
}

function closePrivateRepoModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.removeEventListener("keydown", escClosePrivateModal);
}

// close buttons & backdrop
document.querySelectorAll("#privateRepoModal [data-close]").forEach((el) => {
  el.addEventListener("click", () =>
    closePrivateRepoModal(document.getElementById("privateRepoModal")),
  );
});

/* ---------------- Visitor Counter ----------------
   Uses Abacus (https://abacus.jasoncameron.dev), a free, CountAPI-compatible
   counter. (api.countapi.xyz and hits.seeyoufarm.com have shut down.)
   - Counts each browser at most once per day (unique daily visitors).
   - Visits from localhost are never counted, so local testing doesn't inflate it.
   - If the service is unreachable, the counter is hidden instead of showing "—".
   - Owner mode (see <head>): the owner's visits are never counted, and the
     counter is shown only to the owner. Everyone else is counted but never sees it. */

const COUNT_BASE = "https://abacus.jasoncameron.dev";
const COUNT_NS = "ajmal-amir-portfolio"; // keep stable — changing it starts from 0
const COUNT_KEY = "portfolio";
const COUNT_SPAN_ID = "visitCount";

// Set to true temporarily to see it increment on every refresh (testing only)
const FORCE_HIT_ON_EVERY_LOAD = false;

function safeGetItem(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSetItem(k, v) {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
}

async function updateVisitorCounter() {
  const span = document.getElementById(COUNT_SPAN_ID);
  if (!span) return;
  const wrap = span.closest(".visit-counter");

  const path = `${encodeURIComponent(COUNT_NS)}/${encodeURIComponent(COUNT_KEY)}`;
  const hit = `${COUNT_BASE}/hit/${path}`;
  const get = `${COUNT_BASE}/get/${path}`;

  const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const today = new Date().toISOString().slice(0, 10);
  const lastHit = safeGetItem("count_hit_portfolio_date");
  const isOwner = window.AA_OWNER === true;
  const shouldHit = !isOwner && !isLocal && (FORCE_HIT_ON_EVERY_LOAD || lastHit !== today);
  const endpoint = shouldHit ? hit : get;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || typeof data.value !== "number") throw new Error("Bad payload");
    span.textContent = Number(data.value).toLocaleString();
    if (shouldHit && !FORCE_HIT_ON_EVERY_LOAD) safeSetItem("count_hit_portfolio_date", today);
    if (wrap) wrap.hidden = !isOwner;
  } catch (err) {
    // Service down, blocked by an extension, or counter not created yet
    if (wrap) wrap.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", updateVisitorCounter);

/* ---------------- Engagement events (Google Analytics) ----------------
   Records which actions visitors take, so you can tell real interest
   (résumé downloads, project views, code requests) from quick bounces.
   Sends only the action and which item, never anything a visitor typed.
   Skipped entirely in owner mode. */
document.addEventListener("click", (e) => {
  if (!window.aaTrack) return;
  const el = e.target.closest("a, button");
  if (!el) return;
  const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const href = el.getAttribute("href") || "";

  if (href.includes("Resume.pdf")) {
    window.aaTrack("resume_download", { link_text: label });
  } else if (el.classList.contains("private-repo")) {
    window.aaTrack("private_repo_request", { project: el.dataset.project || label });
  } else if (el.dataset.detail) {
    window.aaTrack("detail_open", { item: el.dataset.detail });
  } else if (href.startsWith("mailto:")) {
    window.aaTrack("email_click");
  } else if (/^https?:\/\//.test(href) && !href.includes(location.hostname)) {
    let host = "";
    try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    window.aaTrack("outbound_click", { destination: host, link_text: label });
  }
});
