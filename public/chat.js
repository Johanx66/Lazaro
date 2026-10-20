const DEFAULT_FROM = "573143900375";
const DEFAULT_NAME = "Wilso";
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const phoneSelectEl = document.getElementById("phoneSelect");
const nameInputEl = document.getElementById("nameInput");

let from = DEFAULT_FROM;
let name = DEFAULT_NAME;
if (nameInputEl) {
  nameInputEl.value = name;
}
if (phoneSelectEl) {
  const opt = document.createElement("option");
  opt.value = from;
  opt.textContent = from;
  phoneSelectEl.appendChild(opt);
  phoneSelectEl.value = from;
}

if (phoneSelectEl) {
  phoneSelectEl.addEventListener("change", () => {
    from = phoneSelectEl.value || DEFAULT_FROM;
    afterId = 0;
    if (messagesEl) {
      messagesEl.innerHTML = "";
    }
  });
}
if (nameInputEl) {
  nameInputEl.addEventListener("input", () => {
    name = nameInputEl.value || "";
  });
}

let afterId = 0;

function addBubble(kind, text, meta) {
  const div = document.createElement("div");
  div.className = "bubble " + kind;
  div.textContent = text;
  if (meta) {
    const m = document.createElement("span");
    m.className = "meta";
    m.textContent = meta;
    div.appendChild(m);
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function showError(message) {
  errorEl.textContent = "\u2716 " + message;
  errorEl.style.display = "block";
}

function hideError() {
  errorEl.style.display = "none";
}

async function pollResponses() {
  try {
    const url = "/dev/chat/messages?phone=" + encodeURIComponent(from) + "&afterId=" + encodeURIComponent(afterId);
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data && Array.isArray(data.messages)) {
      for (let i = 0; i < data.messages.length; i++) {
        const m = data.messages[i];
        const text = m && m.text ? m.text : "";
        if (text) {
          addBubble("bot", text);
        }
      }
    }
    if (data && typeof data.nextCursor === "number" && !Number.isNaN(data.nextCursor)) {
      afterId = data.nextCursor;
    }
  } catch (err) {
    // ignorar errores de polling
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  hideError();
  addBubble("user", text);
  const typing = addBubble("bot", "escribiendo\u2026");
  sendEl.disabled = true;

  try {
    const payload = {
      phone: from,
      name: name,
      text: text,
    };
    const res = await fetch("/dev/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || (data && data.status !== "ok")) {
      throw new Error((data && data.error && data.error.message) || "Error al enviar el mensaje");
    }
    typing.remove();
    // Consultar respuestas mediante polling con afterId actualizado
    await pollResponses();
    // Intentar obtener posibles mensajes adicionales con un pequeño retraso
    setTimeout(pollResponses, 300);
    setTimeout(pollResponses, 800);
  } catch (err) {
    typing.remove();
    showError(err.message || "Error de red");
  } finally {
    sendEl.disabled = false;
    inputEl.focus();
  }
}

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send();
});
sendEl.addEventListener("click", send);

Promise.all([
  fetch("/api/health").then((r) => r.json()).catch(() => null),
  fetch("/dev/chat/test-phones").then((r) => (r.ok ? r.json() : null)).catch(() => null),
])
  .then(([health, testPhones]) => {
    if (health) {
      statusEl.textContent = health.database === "connected" ? "conectado a la base" : "base: " + health.database;
    } else {
      statusEl.textContent = "sin conexión";
      showError("No se pudo conectar con el backend en :3000");
    }
    if (testPhones && Array.isArray(testPhones.phones) && phoneSelectEl) {
      while (phoneSelectEl.firstChild) {
        phoneSelectEl.removeChild(phoneSelectEl.firstChild);
      }
      for (let i = 0; i < testPhones.phones.length; i++) {
        const p = testPhones.phones[i];
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        phoneSelectEl.appendChild(opt);
      }
      if (testPhones.phones.indexOf(from) === -1) {
        from = testPhones.phones[0];
      }
      phoneSelectEl.value = from;
      afterId = 0;
    }
    if (sendEl) sendEl.disabled = false;
  })
  .catch(() => {
    statusEl.textContent = "sin conexión";
    showError("No se pudo conectar con el backend en :3000");
    if (sendEl) sendEl.disabled = false;
  });

// Iniciar polling de respuestas para mensajes ya en outbox
setInterval(pollResponses, 1000);
pollResponses();

inputEl.focus();