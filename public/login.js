(function () {
  "use strict";

  var token = new URLSearchParams(window.location.search).get("t") || "";

  function $(id) {
    return document.getElementById(id);
  }

  function show(viewId) {
    ["loadingView", "invalidView", "formView", "successView"].forEach(function (id) {
      $(id).hidden = id !== viewId;
    });
  }

  function showInvalid(message) {
    $("invalidError").textContent = message;
    show("invalidView");
  }

  async function request(method, url, body) {
    var init = { method: method, headers: {} };
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
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status: res.status, data: data };
  }

  function messageOf(result, fallback) {
    if (result.data && result.data.error && typeof result.data.error.message === "string") {
      return result.data.error.message;
    }
    return fallback;
  }

  async function checkLink() {
    if (token.length === 0) {
      showInvalid("El enlace de acceso no es válido, ya venció o ya se usó");
      return;
    }
    var res;
    try {
      res = await request("GET", "/api/identity/login-link/" + encodeURIComponent(token));
    } catch (e) {
      showInvalid(e.message);
      return;
    }
    if (res.status !== 200 || !res.data) {
      showInvalid(messageOf(res, "El enlace de acceso no es válido, ya venció o ya se usó"));
      return;
    }
    $("maskedContact").textContent = res.data.maskedContact;
    show("formView");
    $("username").focus();
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    var errEl = $("formError");
    errEl.hidden = true;
    var username = $("username").value.trim();
    var password = $("password").value;
    if (username.length === 0 || password.length === 0) {
      errEl.textContent = "Escribe tu usuario y tu contraseña";
      errEl.hidden = false;
      return;
    }
    $("submitBtn").disabled = true;
    try {
      var res = await request("POST", "/api/identity/login", {
        token: token,
        username: username,
        password: password,
      });
      if (res.status === 200 && res.data) {
        $("password").value = "";
        $("successName").textContent = res.data.displayName;
        show("successView");
        return;
      }
      errEl.textContent = messageOf(res, "No se pudo iniciar sesión");
      errEl.hidden = false;
    } catch (e) {
      errEl.textContent = e.message || "No se pudo iniciar sesión";
      errEl.hidden = false;
    } finally {
      $("submitBtn").disabled = false;
    }
  }

  $("loginForm").addEventListener("submit", onSubmit);
  checkLink();
})();
