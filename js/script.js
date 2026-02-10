/* Tabs */
const tablinks = document.getElementsByClassName("tab-links");
const tabcontents = document.getElementsByClassName("tab-contents");

function opentab(e, tabname) {
  for (const t of tablinks) t.classList.remove("active-link");
  for (const c of tabcontents) c.classList.remove("active-tab");
  e.currentTarget.classList.add("active-link");
  document.getElementById(tabname).classList.add("active-tab");
}

/* Mobile menu */
const sideMenu = document.getElementById("sideMenu");
function openMenu() {
  sideMenu.style.right = "0";
}
function closeMenu() {
  sideMenu.style.right = "-200px";
}

/* this is link to the email service  for the screpit where emails are sent 
https://script.google.com/u/0/home/projects/1HttZA4IJl3RsfAwSqEPrrDrN24fCM6ygCo-oJzEZwA67cx7mhgRwniN2/edit

*/

/* this is for opnening the chatbot */


/* Google Sheet form submit (hardened) */
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

// Private repo modal handler (non-invasive)
document.addEventListener("click", (e) => {
  // delegate
  const link = e.target.closest("a.private-repo"); // link with class "private-repo"
  if (!link) return;

  e.preventDefault(); // prevent navigation
  const modal = document.getElementById("privateRepoModal");
  if (!modal) return;

  const nameSpan = modal.querySelector("#modalProject");
  if (nameSpan)
    nameSpan.textContent = link.dataset.project || "This repository";

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

// ---------- Visible Visitor Counter with Fallback ----------
// WHY: CountAPI gives a simple JSON counter. Some browsers/extensions block it.
//      If it fails, we show a badge image counter that works without JS.
// WHERE: Put this at the end of js/script.js

const COUNT_NS = "ajmal-amir-portfolio"; // keep stable
const COUNT_KEY = "portfolio"; // your page key (Portfolio = home)
const COUNT_SPAN_ID = "visitCount";
const BADGE_ID = "visitBadge";

// Set to true temporarily to see it increment on every refresh (testing only)
const FORCE_HIT_ON_EVERY_LOAD = false;

async function updateVisitorCounter() {
  const span = document.getElementById(COUNT_SPAN_ID);
  const badge = document.getElementById(BADGE_ID);
  if (!span) return;

  // Build endpoints
  const base = "https://api.countapi.xyz";
  const hit = `${base}/hit/${encodeURIComponent(COUNT_NS)}/${encodeURIComponent(COUNT_KEY)}`;
  const get = `${base}/get/${encodeURIComponent(COUNT_NS)}/${encodeURIComponent(COUNT_KEY)}`;

  // De-dup: only +1 once per day per browser unless FORCE_HIT... is true
  const today = new Date().toISOString().slice(0, 10);
  const lastHit = localStorage.getItem("count_hit_portfolio_date");
  const endpoint = FORCE_HIT_ON_EVERY_LOAD
    ? hit
    : lastHit === today
      ? get
      : hit;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || typeof data.value !== "number") throw new Error("Bad payload");
    span.textContent = Number(data.value).toLocaleString();
    if (endpoint === hit && !FORCE_HIT_ON_EVERY_LOAD) {
      localStorage.setItem("count_hit_portfolio_date", today);
    }
  } catch (err) {
    // Fallback: show the badge image counter instead of 'n/a'
    if (badge) {
      span.style.display = "none";
      badge.style.display = "inline";
    } else {
      span.textContent = "—";
    }
    // Optional: console.error("Visitor counter error:", err);
  }
}

document.addEventListener("DOMContentLoaded", updateVisitorCounter);
