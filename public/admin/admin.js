(function () {
  "use strict";

  var PAGE_SIZE = 10;
  var MAX_TITLE = 200;
  var MAX_CONTENT = 20000;
  var MAX_CATEGORY = 50;
  var MAX_KEYWORDS = 10;
  var MAX_KEYWORD_LENGTH = 40;

  var state = { page: 1, total: 0, editingId: null };

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

  // Devuelve {status, data}. Ante 401 vuelve al login y lanza UnauthorizedError
  // (salvo que opts.allow401 sea true, usado por /auth/login y /auth/me).
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
      return "No tienes permisos para gestionar preguntas frecuentes";
    }
    return serverMessage(result, fallback);
  }

  // ---------- Sesión ----------

  async function checkSession() {
    try {
      var res = await api("GET", "/auth/me", undefined, true);
      if (res.status === 200 && res.data) {
        showPanel(res.data);
        await loadList();
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
        await loadList();
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
    hideForm();
    showLogin();
  }

  // ---------- Lista ----------

  function buildQuery() {
    var params = new URLSearchParams();
    params.set("page", String(state.page));
    params.set("pageSize", String(PAGE_SIZE));
    var q = $("filterQ").value.trim();
    var category = $("filterCategory").value.trim();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    params.set("active", $("filterActive").value);
    return params.toString();
  }

  async function loadList() {
    var errEl = $("panelError");
    clearError(errEl);
    try {
      var res = await api("GET", "/api/knowledge?" + buildQuery());
      if (res.status !== 200 || !res.data) {
        renderList([]);
        state.total = 0;
        updatePager();
        showError(errEl, forbiddenOr(res, "No se pudieron cargar las preguntas"));
        return;
      }
      state.total = res.data.total;
      renderList(res.data.items || []);
      updatePager();
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  function updatePager() {
    var pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    $("pageInfo").textContent = "Página " + state.page + " de " + pages + " (" + state.total + " en total)";
    $("prevBtn").disabled = state.page <= 1;
    $("nextBtn").disabled = state.page >= pages;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderList(items) {
    var list = $("list");
    while (list.firstChild) list.removeChild(list.firstChild);
    $("listEmpty").hidden = items.length > 0;

    items.forEach(function (item) {
      var li = el("li", item.active ? "item" : "item inactive");
      li.appendChild(el("div", "item-title", item.title));
      var keywords = Array.isArray(item.keywords) ? item.keywords.join(", ") : "";
      li.appendChild(
        el(
          "div",
          "item-meta",
          "Categoría: " +
            item.category +
            " · " +
            (item.active ? "Activa" : "Inactiva") +
            (keywords ? " · Palabras clave: " + keywords : ""),
        ),
      );
      li.appendChild(el("div", "item-content", item.content));

      var row = el("div", "row");
      var editBtn = el("button", "secondary", "Editar");
      editBtn.type = "button";
      editBtn.addEventListener("click", function () {
        openForm(item);
      });
      var toggleBtn = el("button", "secondary", item.active ? "Desactivar" : "Activar");
      toggleBtn.type = "button";
      toggleBtn.addEventListener("click", function () {
        toggleActive(item, toggleBtn);
      });
      row.appendChild(editBtn);
      row.appendChild(toggleBtn);
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  async function toggleActive(item, btn) {
    var errEl = $("panelError");
    clearError(errEl);
    btn.disabled = true;
    try {
      var res = await api("PATCH", "/api/knowledge/" + encodeURIComponent(item.id), {
        active: !item.active,
      });
      if (res.status !== 200) {
        showError(errEl, forbiddenOr(res, "No se pudo cambiar el estado"));
        btn.disabled = false;
        return;
      }
      await loadList();
    } catch (e) {
      btn.disabled = false;
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    }
  }

  // ---------- Formulario ----------

  function openForm(item) {
    state.editingId = item ? item.id : null;
    $("formTitle").textContent = item ? "Editar pregunta" : "Nueva pregunta";
    $("fTitle").value = item ? item.title : "";
    $("fContent").value = item ? item.content : "";
    $("fCategory").value = item ? item.category : "";
    $("fKeywords").value = item && Array.isArray(item.keywords) ? item.keywords.join(", ") : "";
    $("fActive").checked = item ? Boolean(item.active) : true;
    clearError($("formError"));
    $("editForm").hidden = false;
    $("fTitle").focus();
  }

  function hideForm() {
    state.editingId = null;
    $("editForm").hidden = true;
    clearError($("formError"));
  }

  function parseKeywords(text) {
    return text
      .split(",")
      .map(function (k) {
        return k.trim();
      })
      .filter(function (k) {
        return k.length > 0;
      });
  }

  function validateForm(values) {
    if (values.title.length === 0) return "La pregunta es obligatoria";
    if (values.title.length > MAX_TITLE) return "La pregunta no puede superar los " + MAX_TITLE + " caracteres";
    if (values.content.length === 0) return "La respuesta es obligatoria";
    if (values.content.length > MAX_CONTENT) {
      return "La respuesta no puede superar los " + MAX_CONTENT + " caracteres";
    }
    if (values.category.length === 0) return "La categoría es obligatoria";
    if (values.category.length > MAX_CATEGORY) {
      return "La categoría no puede superar los " + MAX_CATEGORY + " caracteres";
    }
    if (values.keywords.length > MAX_KEYWORDS) return "Máximo " + MAX_KEYWORDS + " palabras clave";
    for (var i = 0; i < values.keywords.length; i++) {
      if (values.keywords[i].length > MAX_KEYWORD_LENGTH) {
        return "Una palabra clave supera los " + MAX_KEYWORD_LENGTH + " caracteres";
      }
    }
    return null;
  }

  async function onSave(ev) {
    ev.preventDefault();
    var errEl = $("formError");
    clearError(errEl);
    var values = {
      title: $("fTitle").value.trim(),
      content: $("fContent").value.trim(),
      category: $("fCategory").value.trim(),
      keywords: parseKeywords($("fKeywords").value),
      active: $("fActive").checked,
    };
    var problem = validateForm(values);
    if (problem) {
      showError(errEl, problem);
      return;
    }
    $("saveBtn").disabled = true;
    try {
      var res;
      if (state.editingId === null) {
        // POST no acepta "active": se crea y, si hace falta, se desactiva con PATCH.
        res = await api("POST", "/api/knowledge", {
          title: values.title,
          content: values.content,
          category: values.category,
          keywords: values.keywords,
        });
        if ((res.status === 200 || res.status === 201) && res.data && !values.active) {
          var id = res.data.id !== undefined ? res.data.id : res.data.item && res.data.item.id;
          if (id !== undefined) {
            res = await api("PATCH", "/api/knowledge/" + encodeURIComponent(id), { active: false });
          }
        }
      } else {
        res = await api("PATCH", "/api/knowledge/" + encodeURIComponent(state.editingId), values);
      }
      if (res.status === 200 || res.status === 201) {
        hideForm();
        await loadList();
      } else {
        showError(errEl, forbiddenOr(res, "No se pudo guardar la pregunta"));
      }
    } catch (e) {
      var msg = errorText(e);
      if (msg) showError(errEl, msg);
    } finally {
      $("saveBtn").disabled = false;
    }
  }

  // ---------- Eventos ----------

  $("loginForm").addEventListener("submit", onLogin);
  $("logoutBtn").addEventListener("click", onLogout);
  $("filtersForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    state.page = 1;
    loadList();
  });
  $("newBtn").addEventListener("click", function () {
    openForm(null);
  });
  $("prevBtn").addEventListener("click", function () {
    if (state.page > 1) {
      state.page -= 1;
      loadList();
    }
  });
  $("nextBtn").addEventListener("click", function () {
    state.page += 1;
    loadList();
  });
  $("editForm").addEventListener("submit", onSave);
  $("cancelBtn").addEventListener("click", hideForm);

  checkSession();
})();
