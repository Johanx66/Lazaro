(function () {
  "use strict";

  var MIN_PASSWORD = 12;
  var MAX_USERNAME = 60;
  var MAX_DISPLAY_NAME = 120;
  var MAX_PHONE = 40;

  var state = { editingId: null };

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
    $("panelView").hidden = true;
    $("loginView").hidden = false;
    $("loginPassword").value = "";
  }

  function showPanel(user) {
    $("loginView").hidden = true;
    $("panelView").hidden = false;
    $("userInfo").textContent = user.email + " (" + user.role + ")";
  }

  function UnauthorizedError() {
    this.name = "UnauthorizedError";
  }

  async function api(method, url, body, allow401) {
    var init = { method: method, credentials: "same-origin", headers: {} };
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

  function forbidden(result, fallback) {
    if (result.status === 403) return "Solo los administradores pueden gestionar esta sección";
    return serverMessage(result, fallback);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    if (!value) return "";
    var d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toLocaleString();
  }

  // ---------- Sesión ----------

  async function checkSession() {
    try {
      var res = await api("GET", "/auth/me", undefined, true);
      if (res.status === 200 && res.data) {
        showPanel(res.data);
        await Promise.all([loadUsers(), loadSessions()]);
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
        await Promise.all([loadUsers(), loadSessions()]);
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

  // ---------- Usuarios de empresa ----------

  function loadUsers() {
    return refreshUsers();
  }

  async function refreshUsers() {
    var errEl = $("panelError");
    clearError(errEl);
    try {
      var res = await api("GET", "/api/company-users");
      if (res.status !== 200 || !res.data) {
        renderUsers([]);
        showError(errEl, forbidden(res, "No se pudieron cargar los usuarios"));
        return;
      }
      renderUsers(res.data);
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  function renderUsers(items) {
    var list = $("usersList");
    while (list.firstChild) list.removeChild(list.firstChild);
    $("usersEmpty").hidden = items.length > 0;

    items.forEach(function (user) {
      var li = el("li", user.active ? "item" : "item inactive");
      li.appendChild(el("div", "item-title", user.displayName + " (" + user.username + ")"));
      li.appendChild(
        el(
          "div",
          "item-meta",
          "Rol: " +
            (user.role === "ADMIN" ? "Administrador" : "Usuario") +
            " · " +
            (user.active ? "Activo" : "Inactivo") +
            (user.registeredPhone ? " · Teléfono: " + user.registeredPhone : ""),
        ),
      );

      var row = el("div", "row");
      var editBtn = el("button", "secondary", "Editar");
      editBtn.type = "button";
      editBtn.addEventListener("click", function () {
        openUserForm(user);
      });
      var toggleBtn = el("button", "secondary", user.active ? "Desactivar" : "Activar");
      toggleBtn.type = "button";
      toggleBtn.addEventListener("click", function () {
        toggleUser(user, toggleBtn);
      });
      row.appendChild(editBtn);
      row.appendChild(toggleBtn);
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function openUserForm(user) {
    state.editingId = user ? user.id : null;
    $("userSaveBtn").textContent = user ? "Guardar cambios" : "Crear usuario";
    $("uUsername").value = user ? user.username : "";
    $("uUsername").disabled = Boolean(user);
    $("uDisplayName").value = user ? user.displayName : "";
    $("uPassword").value = "";
    $("uPassword").placeholder = user ? "Nueva contraseña (opcional)" : "Contraseña (mínimo 12)";
    $("uPhone").value = user && user.registeredPhone ? user.registeredPhone : "";
    $("uRole").value = user ? user.role : "USER";
    $("userCancelBtn").hidden = !user;
    clearError($("userFormError"));
    $("uDisplayName").focus();
  }

  function hideUserForm() {
    state.editingId = null;
    $("userForm").reset();
    $("uUsername").disabled = false;
    $("uPassword").placeholder = "Contraseña (mínimo 12)";
    $("userSaveBtn").textContent = "Crear usuario";
    $("userCancelBtn").hidden = true;
    clearError($("userFormError"));
  }

  function validateUser(values, editing) {
    if (!editing) {
      if (values.username.length < 3) return "El usuario debe tener al menos 3 caracteres";
      if (values.username.length > MAX_USERNAME) return "El usuario es demasiado largo";
      if (!/^[a-z0-9._-]+$/.test(values.username)) {
        return "El usuario solo admite minúsculas, dígitos, punto, guion y guion bajo";
      }
      if (values.password.length < MIN_PASSWORD) {
        return "La contraseña debe tener al menos " + MIN_PASSWORD + " caracteres";
      }
    } else if (values.password.length > 0 && values.password.length < MIN_PASSWORD) {
      return "La nueva contraseña debe tener al menos " + MIN_PASSWORD + " caracteres";
    }
    if (values.displayName.length === 0) return "El nombre para mostrar es obligatorio";
    if (values.displayName.length > MAX_DISPLAY_NAME) return "El nombre es demasiado largo";
    if (values.registeredPhone.length > MAX_PHONE) return "El teléfono es demasiado largo";
    return null;
  }

  async function onUserSave(ev) {
    ev.preventDefault();
    var errEl = $("userFormError");
    clearError(errEl);
    var editing = state.editingId !== null;
    var values = {
      username: $("uUsername").value.trim().toLowerCase(),
      displayName: $("uDisplayName").value.trim(),
      password: $("uPassword").value,
      registeredPhone: $("uPhone").value.trim(),
      role: $("uRole").value,
    };
    var problem = validateUser(values, editing);
    if (problem) {
      showError(errEl, problem);
      return;
    }
    $("userSaveBtn").disabled = true;
    try {
      var res;
      if (!editing) {
        res = await api("POST", "/api/company-users", {
          username: values.username,
          password: values.password,
          displayName: values.displayName,
          role: values.role,
          registeredPhone: values.registeredPhone.length > 0 ? values.registeredPhone : null,
        });
      } else {
        var patch = {
          displayName: values.displayName,
          role: values.role,
          registeredPhone: values.registeredPhone.length > 0 ? values.registeredPhone : null,
        };
        if (values.password.length > 0) patch.password = values.password;
        res = await api("PATCH", "/api/company-users/" + encodeURIComponent(state.editingId), patch);
      }
      if (res.status === 200 || res.status === 201) {
        hideUserForm();
        await refreshUsers();
      } else {
        showError(errEl, forbidden(res, "No se pudo guardar el usuario"));
      }
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    } finally {
      $("userSaveBtn").disabled = false;
    }
  }

  async function toggleUser(user, btn) {
    var errEl = $("panelError");
    clearError(errEl);
    btn.disabled = true;
    try {
      var res = await api("PATCH", "/api/company-users/" + encodeURIComponent(user.id), {
        active: !user.active,
      });
      if (res.status !== 200) {
        showError(errEl, forbidden(res, "No se pudo cambiar el estado"));
        btn.disabled = false;
        return;
      }
      await refreshUsers();
    } catch (e) {
      btn.disabled = false;
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  // ---------- Sesiones de chat ----------

  function loadSessions() {
    return refreshSessions();
  }

  async function refreshSessions() {
    var errEl = $("panelError");
    clearError(errEl);
    try {
      var res = await api("GET", "/api/chat-sessions");
      if (res.status !== 200 || !res.data) {
        renderSessions([]);
        showError(errEl, forbidden(res, "No se pudieron cargar las sesiones"));
        return;
      }
      renderSessions(res.data);
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  function renderSessions(items) {
    var list = $("sessionsList");
    while (list.firstChild) list.removeChild(list.firstChild);
    $("sessionsEmpty").hidden = items.length > 0;

    items.forEach(function (session) {
      var li = el("li", "item");
      li.appendChild(
        el(
          "div",
          "item-title",
          session.displayName + " (" + (session.role === "ADMIN" ? "Administrador" : "Usuario") + ")",
        ),
      );
      li.appendChild(
        el(
          "div",
          "item-meta",
          "Canal: " +
            session.channel +
            " · Contacto: " +
            session.maskedContact +
            " · Inicio: " +
            formatDate(session.createdAt) +
            " · Última actividad: " +
            formatDate(session.lastActivityAt) +
            " · Vence (inactividad): " +
            formatDate(session.expiresAt),
        ),
      );

      var row = el("div", "row");
      var revokeBtn = el("button", "secondary", "Revocar");
      revokeBtn.type = "button";
      revokeBtn.addEventListener("click", function () {
        revokeSession(session, revokeBtn);
      });
      row.appendChild(revokeBtn);
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  async function revokeSession(session, btn) {
    var errEl = $("panelError");
    clearError(errEl);
    if (!window.confirm("¿Revocar la sesión de " + session.displayName + "?")) return;
    btn.disabled = true;
    try {
      var res = await api("DELETE", "/api/chat-sessions/" + encodeURIComponent(session.id));
      if (res.status !== 204) {
        showError(errEl, forbidden(res, "No se pudo revocar la sesión"));
        btn.disabled = false;
        return;
      }
      await refreshSessions();
    } catch (e) {
      btn.disabled = false;
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  // ---------- Eventos ----------

  $("loginForm").addEventListener("submit", onLogin);
  $("logoutBtn").addEventListener("click", onLogout);
  $("userForm").addEventListener("submit", onUserSave);
  $("userCancelBtn").addEventListener("click", hideUserForm);
  $("refreshSessionsBtn").addEventListener("click", refreshSessions);

  checkSession();
})();
