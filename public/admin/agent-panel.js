(function () {
  "use strict";

  var state = {
    currentConversationId: null,
    currentConversation: null,
    messagesCursor: null,
    latestMessageCursor: null,
    messagesLoadGeneration: 0,
    messagesPollTimer: null,
    messagesPollInFlight: false,
    view: "waiting",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function clearError(el) {
    el.textContent = "";
    el.hidden = true;
  }

  function showLogin() {
    stopMessagePolling();
    state.messagesLoadGeneration += 1;
    $("panelView").hidden = true;
    $("loginView").hidden = false;
    $("loginPassword").value = "";
  }

  function showPanel(user) {
    $("loginView").hidden = true;
    $("panelView").hidden = false;
    $("userInfo").textContent = user.email + " (" + user.role + ")";
    loadWaitingList();
  }

  function UnauthorizedError() {
    this.name = "UnauthorizedError";
  }

  async function api(method, url, body, allow401) {
    var init = {
      method: method,
      credentials: "same-origin",
      headers: {},
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new Error("No se pudo conectar con el servidor");
    }
    var data = null;
    if (res.status !== 204) {
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
    }
    if (res.status === 401 && !allow401) {
      showLogin();
      throw new UnauthorizedError();
    }
    return { status: res.status, data: data };
  }

  function serverMessage(result, fallback) {
    if (result.data && result.data.error && typeof result.data.error.message === "string") {
      return result.data.error.message;
    }
    return fallback;
  }

  function errorText(err) {
    if (err instanceof UnauthorizedError) return null;
    if (err && err.message) return err.message;
    return "Ocurrió un error inesperado";
  }

  function forbiddenOr(result, fallback) {
    if (result.status === 403) {
      return "No tienes permisos para acceder al panel de agente";
    }
    return serverMessage(result, fallback);
  }

  function statusLabel(status) {
    switch (status) {
      case "WAITING_AGENT":
        return "En espera";
      case "OPEN":
        return "Asignada";
      case "RESOLVED":
        return "Resuelta";
      case "CLOSED":
        return "Cerrada";
      default:
        return status;
    }
  }

  function statusClass(status) {
    switch (status) {
      case "WAITING_AGENT":
        return "status-waiting-agent";
      case "OPEN":
        return "status-open";
      case "RESOLVED":
        return "status-resolved";
      case "CLOSED":
        return "status-closed";
      default:
        return "";
    }
  }

  function itemClass(status) {
    if (status === "WAITING_AGENT") return "waiting-agent";
    if (status === "RESOLVED" || status === "CLOSED") return "closed";
    return "assigned";
  }

  function isClosedStatus(status) {
    return status === "RESOLVED" || status === "CLOSED";
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr);
    return d.toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getSenderLabel(senderType) {
    switch (senderType) {
      case "USER":
        return "Cliente";
      case "BOT":
        return "Bot";
      case "AGENT":
        return "Agente";
      case "SYSTEM":
        return "Sistema";
      default:
        return senderType;
    }
  }

  function renderMessage(msg) {
    var div = document.createElement("div");
    div.className = "message " + msg.senderType.toLowerCase();
    div.innerHTML =
      '<div class="message-sender">' +
      getSenderLabel(msg.senderType) +
      "</div>" +
      '<div class="message-content">' +
      escapeHtml(msg.content) +
      "</div>" +
      '<div class="message-time">' +
      formatDate(msg.createdAt) +
      "</div>";
    return div;
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function checkSession() {
    try {
      var res = await api("GET", "/auth/me", undefined, true);
      if (res.status === 200 && res.data) {
        showPanel(res.data);
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin();
      showError($("loginError"), errorText(e) || "");
    }
  }

  async function onLogin(ev) {
    ev.preventDefault();
    var errEl = $("loginError");
    clearError(errEl);
    var email = $("loginEmail").value.trim();
    var password = $("loginPassword").value;
    if (email.length === 0 || password.length === 0) {
      showError(errEl, "Escribe tu correo y tu contraseña");
      return;
    }
    $("loginSubmit").disabled = true;
    try {
      var res = await api("POST", "/auth/login", { email: email, password: password }, true);
      if (res.status === 200 && res.data) {
        showPanel(res.data);
        $("loginPassword").value = "";
      } else {
        showError(errEl, serverMessage(res, "No se pudo iniciar sesión"));
      }
    } catch (e) {
      showError(errEl, errorText(e) || "No se pudo iniciar sesión");
    } finally {
      $("loginSubmit").disabled = false;
    }
  }

  async function onLogout() {
    try {
      await api("POST", "/auth/logout", undefined, true);
    } catch (e) {
      // Se muestra el login de todos modos.
    }
    showLogin();
  }

  function renderConversationList(conversations, list, empty) {
    list.innerHTML = "";
    if (conversations.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    conversations.forEach(function (conv) {
      var li = document.createElement("li");
      li.className = "conversation-item " + itemClass(conv.status);
      li.dataset.conversationId = conv.id;

      li.innerHTML =
        '<div class="conversation-header">' +
        '<div class="conversation-info">' +
        "<strong>" +
        escapeHtml(conv.channel + " - " + (conv.userName || "Sin nombre")) +
        "</strong>" +
        '<span class="conversation-meta">Teléfono: ' +
        escapeHtml(conv.userPhone || "N/A") +
        " · " +
        formatDate(conv.updatedAt) +
        "</span>" +
        "</div>" +
        '<span class="status-badge ' + statusClass(conv.status) + '">' + statusLabel(conv.status) + "</span>" +
        "</div>";

      li.addEventListener("click", function () {
        openConversation(conv);
      });
      list.appendChild(li);
    });
  }

  async function loadConversationList(url, listId, emptyId, loadingId, fallbackMessage) {
    var list = $(listId);
    var empty = $(emptyId);
    var loading = $(loadingId);
    var errEl = $("panelError");
    clearError(errEl);

    list.innerHTML = "";
    empty.hidden = true;
    loading.hidden = false;

    try {
      var res = await api("GET", url);
      loading.hidden = true;
      if (res.status !== 200 || !res.data) {
        empty.hidden = false;
        showError(errEl, forbiddenOr(res, fallbackMessage));
        return;
      }
      renderConversationList(res.data.conversations || [], list, empty);
    } catch (e) {
      loading.hidden = true;
      empty.hidden = false;
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  function loadWaitingList() {
    state.view = "waiting";
    return loadConversationList(
      "/api/agent/conversations/waiting",
      "waitingList",
      "emptyWaiting",
      "loadingWaiting",
      "No se pudieron cargar las conversaciones",
    );
  }

  function loadHistory() {
    return loadConversationList(
      "/api/agent/conversations/history",
      "historyList",
      "emptyHistory",
      "loadingHistory",
      "No se pudo cargar el historial",
    );
  }

  function showHistory() {
    state.view = "history";
    $("waitingListContainer").hidden = true;
    $("historyListContainer").hidden = false;
    loadHistory();
  }

  function showWaiting() {
    state.view = "waiting";
    $("historyListContainer").hidden = true;
    $("waitingListContainer").hidden = false;
    loadWaitingList();
  }

  async function openConversation(conv) {
    stopMessagePolling();
    state.messagesLoadGeneration += 1;
    state.currentConversationId = conv.id;
    state.currentConversation = conv;
    state.messagesCursor = null;
    state.latestMessageCursor = null;
    $("messagesContainer").innerHTML = "";

    $("waitingListContainer").hidden = true;
    $("historyListContainer").hidden = true;
    $("conversationDetail").hidden = false;
    $("conversationTitle").textContent = conv.channel + " - " + (conv.userName || "Sin nombre");
    $("conversationMeta").textContent =
      "ID: " + conv.id + " · Teléfono: " + (conv.userPhone || "N/A") + " · Estado: " + statusLabel(conv.status);

    var readOnly = isClosedStatus(conv.status);
    $("replyForm").hidden = readOnly;
    $("closeConversationBtn").hidden = readOnly;
    $("returnToBotBtn").hidden = readOnly;

    await loadMessages();

    if (state.currentConversationId === conv.id) startMessagePolling();
    checkWhatsAppWindow(conv);
  }

  function backToList() {
    stopMessagePolling();
    state.messagesLoadGeneration += 1;
    state.currentConversationId = null;
    state.currentConversation = null;
    state.messagesCursor = null;
    state.latestMessageCursor = null;
    $("conversationDetail").hidden = true;
    $("messagesContainer").innerHTML = "";
    $("whatsappWarning").hidden = true;
    $("whatsappWarning").classList.remove("visible");
    if (state.view === "history") {
      $("waitingListContainer").hidden = true;
      $("historyListContainer").hidden = false;
    } else {
      $("historyListContainer").hidden = true;
      $("waitingListContainer").hidden = false;
    }
  }

  async function loadMessages(reset, incremental) {
    var conversationId = state.currentConversationId;
    if (!conversationId) return;
    var container = $("messagesContainer");
    if (reset) {
      state.messagesLoadGeneration += 1;
      state.messagesCursor = null;
      state.latestMessageCursor = null;
      container.innerHTML = "";
    }
    if (incremental && !state.latestMessageCursor) {
      await loadMessages(true);
      return;
    }
    var loadGeneration = state.messagesLoadGeneration;
    var requestedAfterCursor = incremental ? state.latestMessageCursor : null;
    var loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "Cargando mensajes...";
    if (!incremental) container.appendChild(loading);

    try {
      var url = "/api/agent/conversations/" + encodeURIComponent(conversationId) + "/messages?limit=50";
      if (requestedAfterCursor) {
        url += "&after=" + encodeURIComponent(requestedAfterCursor);
      } else if (state.messagesCursor) {
        url += "&before=" + encodeURIComponent(state.messagesCursor);
      }
      var res = await api("GET", url);
      loading.remove();
      if (
        state.currentConversationId !== conversationId ||
        state.messagesLoadGeneration !== loadGeneration ||
        (requestedAfterCursor && state.latestMessageCursor !== requestedAfterCursor)
      ) return;

      if (res.status !== 200 || !res.data) {
        showError($("panelError"), forbiddenOr(res, "No se pudieron cargar los mensajes"));
        return;
      }

      var messages = res.data.messages || [];
      if (messages.length > 0) {
        if (!incremental) state.messagesCursor = messages[0].createdAt + "|" + messages[0].id;
        state.latestMessageCursor = messages[messages.length - 1].createdAt + "|" + messages[messages.length - 1].id;
      }

      messages.forEach(function (msg) {
        container.appendChild(renderMessage(msg));
      });

      container.scrollTop = container.scrollHeight;
    } catch (e) {
      loading.remove();
      if (state.currentConversationId !== conversationId || state.messagesLoadGeneration !== loadGeneration) return;
      var msg = errorText(e);
      if (msg) showError($("panelError"), msg);
    }
  }

  function stopMessagePolling() {
    if (state.messagesPollTimer !== null) {
      clearInterval(state.messagesPollTimer);
      state.messagesPollTimer = null;
    }
  }

  function pollMessages() {
    if (
      state.messagesPollInFlight ||
      !state.currentConversationId ||
      document.visibilityState !== "visible"
    ) return;

    state.messagesPollInFlight = true;
    loadMessages(false, true).finally(function () {
      state.messagesPollInFlight = false;
    });
  }

  function startMessagePolling() {
    stopMessagePolling();
    state.messagesPollTimer = setInterval(pollMessages, 3000);
  }

  async function checkWhatsAppWindow(conv) {
    var warning = $("whatsappWarning");
    var statusEl = $("whatsappWindowStatus");
    var actionEl = $("whatsappWindowAction");

    if (conv.channel !== "WHATSAPP") {
      warning.hidden = true;
      warning.classList.remove("visible");
      return;
    }

    try {
      var res = await api("GET", "/api/agent/conversations/" + encodeURIComponent(conv.id) + "/whatsapp-window");
      if (res.status === 200 && res.data) {
        var data = res.data;
        warning.hidden = false;
        warning.classList.add("visible");
        if (data.canReply) {
          statusEl.textContent = "está ABIERTA (expira: " + formatDate(data.expiresAt) + ")";
          actionEl.textContent = "";
        } else {
          statusEl.textContent = "ha EXPIRADO (expiró: " + formatDate(data.expiresAt) + ")";
          actionEl.innerHTML = ' <button type="button" id="sendTemplateBtn" class="secondary">Enviar plantilla HSM</button>';
          document.getElementById("sendTemplateBtn").addEventListener("click", function () {
            sendTemplateMessage(conv);
          });
        }
      } else {
        warning.hidden = true;
        warning.classList.remove("visible");
      }
    } catch (e) {
      warning.hidden = true;
      warning.classList.remove("visible");
    }
  }

  async function sendReply() {
    var text = $("replyText").value.trim();
    if (text.length === 0) return;

    var conv = state.currentConversation;
    if (!conv) return;

    var sendBtn = $("sendReplyBtn");
    sendBtn.disabled = true;
    var errEl = $("panelError");
    clearError(errEl);

    try {
      var res = await api("POST", "/api/agent/conversations/" + encodeURIComponent(state.currentConversationId) + "/reply", {
        text: text,
      });
      if (res.status !== 200 && res.status !== 201) {
        showError(errEl, forbiddenOr(res, "No se pudo enviar la respuesta"));
        return;
      }
      $("replyText").value = "";
      await loadMessages(true);
      checkWhatsAppWindow(conv);
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function closeConversation() {
    if (!confirm("¿Seguro que quieres cerrar esta conversación?")) return;

    var errEl = $("panelError");
    clearError(errEl);

    try {
      var res = await api("POST", "/api/agent/conversations/" + encodeURIComponent(state.currentConversationId) + "/close");
      if (res.status !== 200) {
        showError(errEl, forbiddenOr(res, "No se pudo cerrar la conversación"));
        return;
      }
      backToList();
      await loadWaitingList();
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  async function returnToBot() {
    if (!confirm("¿Seguro que quieres devolver esta conversación al bot?")) return;

    var errEl = $("panelError");
    clearError(errEl);

    try {
      var res = await api("POST", "/api/agent/conversations/" + encodeURIComponent(state.currentConversationId) + "/return-to-bot");
      if (res.status !== 200) {
        showError(errEl, forbiddenOr(res, "No se pudo devolver al bot"));
        return;
      }
      backToList();
      await loadWaitingList();
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  async function sendTemplateMessage(conv) {
    if (!confirm("¿Enviar plantilla HSM para reabrir la ventana de 24h?")) return;

    var errEl = $("panelError");
    clearError(errEl);

    try {
      var res = await api("POST", "/api/agent/conversations/" + encodeURIComponent(state.currentConversationId) + "/send-template");
      if (res.status !== 200) {
        showError(errEl, forbiddenOr(res, "No se pudo enviar la plantilla"));
        return;
      }
      checkWhatsAppWindow(conv);
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  $("loginForm").addEventListener("submit", onLogin);
  $("logoutBtn").addEventListener("click", onLogout);
  $("refreshBtn").addEventListener("click", loadWaitingList);
  $("historyBtn").addEventListener("click", showHistory);
  $("refreshHistoryBtn").addEventListener("click", loadHistory);
  $("backToWaitingBtn").addEventListener("click", showWaiting);
  $("backBtn").addEventListener("click", backToList);
  $("replyForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    sendReply();
  });
  $("closeConversationBtn").addEventListener("click", closeConversation);
  $("returnToBotBtn").addEventListener("click", returnToBot);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") pollMessages();
  });

  checkSession();
})();