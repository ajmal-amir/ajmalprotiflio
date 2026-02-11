// widget.js
// Ajmal AI Recruiter Assistant widget (chat + typing indicator + Siri-style speaking overlay)
//
// Voice Conversation Mode (Siri-style):
// - Click mic ONCE to start a voice session.
// - Overlay opens and stays open for the whole session.
// - Bot speaks, then listens.
// - If user is silent for 5–8 seconds (does not start speaking), bot asks: "Do you have any other question?"
// - Continues until user clicks Stop.
// - Stop closes overlay and returns to normal chat.
//
// Requirements:
// - Best in Chrome/Edge (SpeechRecognition).
// - Mic permission must be allowed for your site.
// - ElevenLabs voice is forced (no browser fallback unless you change FORCE_ELEVENLABS).

const API_BASE =
  "https://ajmalamirairecruiterassistant-production.up.railway.app";

// const API_BASE = "http://localhost:8000";

// Silence window (5–8 seconds). Using 7 seconds default.
const SILENCE_START_WAIT_MS = 7000;

/* ---------------- Networking ---------------- */

async function postJSON(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("API error:", res.status, t);

    if (path === "/chat") {
      alert(`API error ${res.status}: ${t}`);
    }

    throw new Error(t);
  }

  return res.json();
}

/* ---------------- Siri Overlay Helpers ---------------- */

function showSiriOverlay(statusText = "Listening...") {
  const el = document.getElementById("siri-overlay");
  const status = document.getElementById("siri-status");
  if (status) status.textContent = statusText;
  if (el) el.classList.add("active");
}

function setSiriStatus(statusText) {
  const status = document.getElementById("siri-status");
  if (status) status.textContent = statusText;
}

// IMPORTANT: only hide overlay when STOP is clicked / session ends.
function hideSiriOverlay() {
  const el = document.getElementById("siri-overlay");
  if (el) el.classList.remove("active");
}

/* ---------------- Chat UI Helpers ---------------- */

function addMsg(bodyEl, who, text) {
  const row = document.createElement("div");
  row.className = `msg-row ${who}`;

  const bubble = document.createElement("div");
  bubble.className = `msg ${who}`;
  bubble.textContent = text;

  row.appendChild(bubble);
  bodyEl.appendChild(row);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return bubble;
}

function addTyping(bodyEl, label = "Ajmal AI is typing") {
  const row = document.createElement("div");
  row.className = "msg-row bot";

  const bubble = document.createElement("div");
  bubble.className = "msg bot typing";
  bubble.innerHTML = `
    ${label}
    <span class="typing-dots">
      <span></span><span></span><span></span>
    </span>
  `;

  row.appendChild(bubble);
  bodyEl.appendChild(row);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return row;
}

/* ---------------- Voice Output (ElevenLabs) ---------------- */

let currentAudio = null;

function stopAllAudio() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

/**
 * Play ElevenLabs audio and resolve when finished.
 * NOTE: We do NOT hide the overlay here. We only update status.
 */
function playElevenLabsAudioAwait(mime, audioBase64) {
  return new Promise((resolve) => {
    const audio = new Audio(`data:${mime};base64,${audioBase64}`);
    currentAudio = audio;

    setSiriStatus("Speaking...");

    const finish = () => {
      currentAudio = null;
      resolve(true);
    };

    audio.addEventListener("ended", finish);
    audio.addEventListener("pause", finish);
    audio.addEventListener("error", finish);

    audio.play().catch(() => finish());
  });
}

// If true: ONLY use ElevenLabs voice (no browser fallback).
const FORCE_ELEVENLABS = true;

// Speak text using ElevenLabs. Retry once.
async function speakText(text, { bodyForErrors = null } = {}) {
  stopAllAudio();
  setSiriStatus("Speaking...");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const tts = await postJSON("/tts", { text });
      await playElevenLabsAudioAwait(tts.mime, tts.audio_base64);
      return true;
    } catch (e) {
      console.warn(`ElevenLabs TTS attempt ${attempt} failed`, e);

      if (attempt === 2) {
        if (bodyForErrors) {
          addMsg(
            bodyForErrors,
            "bot",
            "Ajmal AI: (Voice is temporarily unavailable. Chat continues.)",
          );
        }
        if (!FORCE_ELEVENLABS) return true;
        return false;
      }
    }
  }

  return false;
}

/* ---------------- Speech-to-Text (Mic) ---------------- */

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function ensureMicPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { ok: false, reason: "getUserMedia_not_supported" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.name || "mic_permission_denied" };
  }
}

/**
 * Listen for ONE user utterance (ROBUST).
 * - Wait up to maxWaitMs for the user to START speaking.
 * - Once speaking begins, keep collecting text.
 * - When silenceMs passes with no new words, stop and return transcript.
 *
 * Robust behavior:
 * - If recognition ends early (common in Chrome), we restart it automatically
 *   until: user speaks OR maxWaitMs expires OR user clicks Stop.
 *
 * NOTE: We do NOT hide the overlay here. We only update status.
 */
function listenUserUtterance({
  lang = "en-US",
  maxWaitMs = SILENCE_START_WAIT_MS,
  silenceMs = 1200,
} = {}) {
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();

  return new Promise((resolve, reject) => {
    if (!SpeechRecognitionCtor) {
      reject(new Error("SpeechRecognition_not_supported"));
      return;
    }

    setSiriStatus("Listening...");

    const deadlineTs = Date.now() + maxWaitMs;

    let transcript = "";
    let hasHeardSpeech = false;

    let silenceTimer = null;

    const clearSilenceTimer = () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    const armSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimer = setTimeout(() => {
        cleanupAndResolve();
      }, silenceMs);
    };

    let rec = null;
    let finished = false;

    const stopRecSafe = () => {
      try {
        if (rec) rec.stop();
      } catch (_) {}
    };

    const cleanupAndResolve = () => {
      if (finished) return;
      finished = true;
      clearSilenceTimer();
      stopRecSafe();
      resolve(transcript.trim());
    };

    const cleanupAndReject = (e) => {
      if (finished) return;
      finished = true;
      clearSilenceTimer();
      stopRecSafe();
      reject(e);
    };

    const startOnce = () => {
      if (finished) return;

      // If user pressed Stop, end immediately.
      if (voiceSessionStopRequested || !voiceSessionActive) {
        cleanupAndResolve();
        return;
      }

      // If no speech yet and deadline expired -> return ""
      if (!hasHeardSpeech && Date.now() >= deadlineTs) {
        cleanupAndResolve();
        return;
      }

      rec = new SpeechRecognitionCtor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;

      rec.onresult = (event) => {
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];

          // Only store FINAL recognized text
          if (res.isFinal) {
            finalText += res[0].transcript + " ";
            hasHeardSpeech = true;
          }
        }

        if (finalText) {
          transcript = (transcript + " " + finalText)
            .replace(/\s+/g, " ")
            .trim();

          armSilenceTimer();
        }
      };

      rec.onerror = (e) => {
        const errName = e?.error || e?.name || "";
        const canRetry =
          !hasHeardSpeech &&
          Date.now() < deadlineTs &&
          !voiceSessionStopRequested &&
          voiceSessionActive &&
          (errName === "no-speech" ||
            errName === "aborted" ||
            errName === "audio-capture");

        if (canRetry) {
          try {
            stopRecSafe();
          } catch (_) {}
          setTimeout(startOnce, 150);
          return;
        }

        cleanupAndReject(e);
      };

      rec.onend = () => {
        if (finished) return;

        if (voiceSessionStopRequested || !voiceSessionActive) {
          cleanupAndResolve();
          return;
        }

        // If we've heard speech, keep restarting until silenceTimer ends the utterance.
        if (hasHeardSpeech) {
          if (!silenceTimer) armSilenceTimer();
          setTimeout(startOnce, 120);
          return;
        }

        // No speech yet: keep trying until deadline
        if (Date.now() < deadlineTs) {
          setTimeout(startOnce, 150);
          return;
        }

        cleanupAndResolve(); // deadline passed -> ""
      };

      try {
        rec.start();
      } catch (e) {
        if (
          !hasHeardSpeech &&
          Date.now() < deadlineTs &&
          !voiceSessionStopRequested &&
          voiceSessionActive
        ) {
          setTimeout(startOnce, 200);
          return;
        }
        cleanupAndReject(e);
      }
    };

    startOnce();
  });
}

/* ---------------- Voice Session Loop ---------------- */

let voiceSessionActive = false;
let voiceSessionStopRequested = false;

/* ---- Overlay lock: keep overlay forced open during voice session ---- */

let overlayLockTimer = null;

function startOverlayLock() {
  stopOverlayLock();
  overlayLockTimer = setInterval(() => {
    if (voiceSessionActive && !voiceSessionStopRequested) {
      const el = document.getElementById("siri-overlay");
      if (el && !el.classList.contains("active")) {
        el.classList.add("active");
      }
    }
  }, 150);
}

function stopOverlayLock() {
  if (overlayLockTimer) {
    clearInterval(overlayLockTimer);
    overlayLockTimer = null;
  }
}

async function runVoiceSession({ body, mode } = {}) {
  voiceSessionActive = true;
  voiceSessionStopRequested = false;

  // Overlay stays open for the whole session (no closing/reopening)
  showSiriOverlay("Starting...");
  startOverlayLock();

  // Optional greet
  await speakText(
    "Hi. You can ask me questions about Ajmal’s projects, skills, or experience.",
    { bodyForErrors: body },
  );

  while (voiceSessionActive && !voiceSessionStopRequested) {
    const permission = await ensureMicPermission();
    if (!permission.ok) {
      addMsg(
        body,
        "bot",
        `Ajmal AI: Microphone permission blocked (${permission.reason}). Please allow mic access.`,
      );
      await speakText(
        "Microphone permission is blocked. Please allow microphone access in your browser settings.",
        {
          bodyForErrors: body,
        },
      );
      break;
    }

    // Listen for user question (robust)
    let spoken = "";
    try {
      spoken = await listenUserUtterance({
        lang: "en-US",
        maxWaitMs: SILENCE_START_WAIT_MS, // 7s to START speaking
        silenceMs: 1200,
      });
    } catch (e) {
      console.error("Speech recognition failed:", e);
      addMsg(
        body,
        "bot",
        "Ajmal AI: (Voice input failed. Please try again or type your question.)",
      );
      await speakText(
        "Voice input failed. Please try again or type your question.",
        { bodyForErrors: body },
      );
      continue;
    }

    if (voiceSessionStopRequested) break;

    // If silent for 5–8 seconds (no speech started)
    if (!spoken) {
      const nudge = "Do you have any other question?";
      addMsg(body, "bot", `Ajmal AI: ${nudge}`);
      await speakText(nudge, { bodyForErrors: body });
      continue;
    }

    // Show user's spoken question in chat
    addMsg(body, "user", `You: ${spoken}`);

    // Call /chat
    setSiriStatus("Thinking...");
    const typingRow = addTyping(body, "Ajmal AI is thinking");

    try {
      const chat = await postJSON("/chat", {
        message: spoken,
        mode: mode.value,
      });
      typingRow.remove();

      addMsg(body, "bot", `Ajmal AI: ${chat.answer}`);

      // Speak answer (overlay stays open)
      await speakText(chat.answer, { bodyForErrors: body });

      setSiriStatus("Listening...");
    } catch (e) {
      typingRow.remove();
      console.error(e);
      addMsg(
        body,
        "bot",
        "Ajmal AI: Sorry — I had trouble answering that. Please try again.",
      );
      await speakText(
        "Sorry, I had trouble answering that. Please try again.",
        { bodyForErrors: body },
      );
      setSiriStatus("Listening...");
      continue;
    }
  }

  // Session end cleanup (ONLY now we close overlay)
  stopOverlayLock();
  stopAllAudio();
  hideSiriOverlay();

  voiceSessionActive = false;
  voiceSessionStopRequested = false;

  addMsg(
    body,
    "bot",
    "Ajmal AI: Voice session ended. You can continue typing here.",
  );
}

/* ---------------- Main Mount ---------------- */

function mount() {
  // Widget
  const bot = document.createElement("div");
  bot.id = "ajmal-bot";

  bot.innerHTML = `
  <header>
    <div class="title">Ajmal AI Recruiter Assistant</div>

    <div class="header-actions">
      <select id="ajmal-mode" title="Answer style">
        <option value="short" selected>Short</option>
        <option value="detailed">Detailed</option>
      </select>

      <button id="ajmal-close" title="Close">✕</button>
    </div>
  </header>

  <div class="body" id="ajmal-body"></div>

  <div class="footer">
    <input id="ajmal-input" placeholder="Ask about my projects, skills, or experience..." />
    <button id="ajmal-send">Send</button>
    <button id="ajmal-mic" title="Talk (voice session)">🎙</button>
  </div>
`;

  document.body.appendChild(bot);

  // Siri overlay (created once)
  const overlay = document.createElement("div");
  overlay.id = "siri-overlay";
  overlay.innerHTML = `
    <div id="siri-card">
      <div id="siri-title">Ajmal AI Voice</div>
      <div id="siri-orb">
        <div class="orb-ring"></div>
        <div class="orb-ring"></div>
        <div class="orb-ring"></div>
      </div>
      <div id="siri-status">Listening...</div>
      <button id="siri-stop">Stop</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Elements
  const body = document.getElementById("ajmal-body");
  const input = document.getElementById("ajmal-input");
  const send = document.getElementById("ajmal-send");
  const mode = document.getElementById("ajmal-mode");
  const mic = document.getElementById("ajmal-mic");
  const stopBtn = document.getElementById("siri-stop");

  // Welcome chat line
  addMsg(
    body,
    "bot",
    "Hi! Ask me anything about Ajmal’s projects, skills, or experience.",
  );

  // Normal typed chat (DOES NOT open overlay)
  async function onSend() {
    const msg = input.value.trim();
    if (!msg) return;

    addMsg(body, "user", `You: ${msg}`);
    input.value = "";

    const typingRow = addTyping(body, "Ajmal AI is typing");
    try {
      const chat = await postJSON("/chat", { message: msg, mode: mode.value });
      typingRow.remove();

      addMsg(body, "bot", `Ajmal AI: ${chat.answer}`);

      // Keep typed chat as chat only (overlay/voice session only starts on mic click)
    } catch (e) {
      typingRow.remove();
      addMsg(
        body,
        "bot",
        "Ajmal AI: Sorry — something went wrong. Please try again.",
      );
      console.error(e);
    }
  }

  const closeBtn = document.getElementById("ajmal-close");

  function setCloseButtonOpenMode(isMinimized) {
    if (isMinimized) {
      // Use your PNG icon
      closeBtn.innerHTML = `<img src="ajmalai.png" alt="Open Ajmal AI" class="ajmal-open-icon" />`;
      closeBtn.title = "Open Ajmal AI";
      closeBtn.setAttribute("aria-label", "Open Ajmal AI");
      closeBtn.classList.add("open-mode");
    } else {
      closeBtn.textContent = "✕";
      closeBtn.title = "Close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.classList.remove("open-mode");
    }
  }

  // Default: not minimized
  setCloseButtonOpenMode(false);

  closeBtn.addEventListener("click", () => {
    const isMinimized = bot.classList.contains("minimized");

    // If minimized, OPEN it
    if (isMinimized) {
      bot.classList.remove("minimized");
      setCloseButtonOpenMode(false);
      return;
    }

    // Otherwise CLOSE it (minimize)
    // If voice session is active, stop it so overlay doesn’t stay open
    voiceSessionStopRequested = true;
    voiceSessionActive = false;
    stopOverlayLock();
    stopAllAudio();
    hideSiriOverlay();

    bot.classList.add("minimized");
    setCloseButtonOpenMode(true);
  });

  // Open/restore
  // openPill.addEventListener("click", () => {
  //   bot.classList.remove("minimized");
  //   openPill.classList.remove("active");
  // });

  send.addEventListener("click", onSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSend();
  });

  // Mic click starts session (ONLY here overlay opens)
  mic.addEventListener("click", async () => {
    if (voiceSessionActive) return;
    await runVoiceSession({ body, mode });
  });

  // Stop ends session (overlay closes only here)
  stopBtn.addEventListener("click", () => {
    voiceSessionStopRequested = true;
    voiceSessionActive = false;
    stopOverlayLock();
    stopAllAudio();
    hideSiriOverlay();
  });
}

document.addEventListener("DOMContentLoaded", mount);
