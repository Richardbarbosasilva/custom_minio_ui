(() => {
  if (window.__MINIO_TOTP_LOGIN_PATCH__) {
    return;
  }
  window.__MINIO_TOTP_LOGIN_PATCH__ = true;

  const state = {
    challenge: "",
    setup: null,
    passcode: "",
    busy: false,
    error: "",
    credentials: null,
  };

  const ids = {
    panel: "minio-totp-panel",
    input: "minio-totp-passcode",
    error: "minio-totp-error",
    copy: "minio-totp-copy",
    reset: "minio-totp-reset",
    submit: "minio-totp-submit",
    style: "minio-totp-style",
  };

  let syncQueued = false;
  let bootstrapped = false;

  const escapeHtml = (value) =>
    String(value || "").replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });

  const isLoginLocation = () => /^\/login\/?$/.test(window.location.pathname);

  const fieldSelectors = {
    accessKey: ['input[name="accessKey"]', "#accessKey"],
    secretKey: ['input[name="secretKey"]', "#secretKey"],
    sts: ['input[name="STS"]', 'input[name="sts"]', "#sts"],
  };

  const getField = (id) => {
    const selectors = fieldSelectors[id] || [`#${id}`];

    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (!candidate) {
        continue;
      }

      if (typeof candidate.value === "string") {
        return candidate;
      }

      const nestedControl = candidate.querySelector("input, textarea, select");
      if (nestedControl && typeof nestedControl.value === "string") {
        return nestedControl;
      }
    }

    return null;
  };

  const getLoginForm = () => {
    if (!isLoginLocation()) {
      return null;
    }

    return (
      document.getElementById(ids.panel)?.closest("form") ||
      document.getElementById("do-login")?.closest("form") ||
      getField("accessKey")?.closest("form") ||
      document.querySelector("form")
    );
  };

  const getCredentials = () => {
    if (state.challenge && state.credentials) {
      return { ...state.credentials };
    }

    const accessKey = getField("accessKey");
    const secretKey = getField("secretKey");
    const sts = getField("sts");
    const readValue = (field) =>
      field && typeof field.value === "string" ? field.value.trim() : "";

    return {
      accessKey: readValue(accessKey),
      secretKey: readValue(secretKey),
      sts: readValue(sts),
    };
  };

  const getRedirectTarget = () => {
    try {
      const storedTarget = localStorage.getItem("redirect-path");
      if (storedTarget && storedTarget !== "") {
        localStorage.setItem("redirect-path", "");
        if (storedTarget === "/" || storedTarget === "/browser") {
          return "/tools/metrics";
        }
        return storedTarget;
      }
    } catch (error) {
      console.warn("Unable to read redirect-path from localStorage", error);
    }

    return "/tools/metrics";
  };

  const rememberLoggedUser = (accessKey) => {
    try {
      if (accessKey) {
        localStorage.setItem("userLoggedIn", accessKey);
      }
    } catch (error) {
      console.warn("Unable to persist logged user", error);
    }
  };

  const ensureStyles = () => {
    if (document.getElementById(ids.style)) {
      return;
    }

    const style = document.createElement("style");
    style.id = ids.style;
    style.textContent = `
      #${ids.panel} {
        display: none;
        margin: 24px 0 18px;
        padding: 18px 16px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.32);
        color: #e5edf7;
      }
      #${ids.panel}.is-visible {
        display: block;
      }
      #${ids.panel} .totp-title {
        margin: 0 0 10px;
        font-size: 16px;
        font-weight: 600;
        color: #f8fafc;
      }
      #${ids.panel} .totp-copy-row,
      #${ids.panel} .totp-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      #${ids.panel} .totp-copy-row {
        align-items: center;
        justify-content: space-between;
      }
      #${ids.panel} .totp-text,
      #${ids.panel} .totp-helper,
      #${ids.panel} .totp-manual-label {
        color: #cbd5e1;
        line-height: 1.5;
      }
      #${ids.panel} .totp-helper {
        margin: 0 0 16px;
        font-size: 13px;
      }
      #${ids.panel} .totp-manual-label {
        margin: 0 0 6px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      #${ids.panel} .totp-manual-secret {
        margin: 0 0 10px;
        font-family: monospace;
        font-size: 14px;
        color: #f8fafc;
        word-break: break-all;
      }
      #${ids.panel} .totp-error {
        display: none;
        margin-bottom: 14px;
        padding: 10px 12px;
        border: 1px solid rgba(248, 113, 113, 0.32);
        border-radius: 10px;
        background: rgba(127, 29, 29, 0.28);
        color: #fecaca;
        font-size: 13px;
      }
      #${ids.panel} .totp-error.is-visible {
        display: block;
      }
      #${ids.panel} .totp-qr-wrap {
        display: flex;
        justify-content: center;
        margin: 0 0 14px;
      }
      #${ids.panel} .totp-qr {
        width: 196px;
        height: 196px;
        border-radius: 14px;
        background: #ffffff;
        padding: 12px;
        box-sizing: border-box;
      }
      #${ids.panel} .totp-input {
        width: 100%;
        height: 40px;
        margin: 0 0 14px;
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.55);
        color: #f8fafc;
        padding: 0 14px;
        box-sizing: border-box;
        outline: none;
        direction: ltr;
        text-align: left;
        unicode-bidi: plaintext;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.12em;
      }
      #${ids.panel} .totp-input:focus {
        border-color: rgba(96, 165, 250, 0.9);
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.16);
      }
      #${ids.panel} .totp-button {
        height: 38px;
        border: none;
        border-radius: 10px;
        padding: 0 16px;
        font: inherit;
        cursor: pointer;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #${ids.panel} .totp-button:hover:not(:disabled) {
        transform: translateY(-1px);
      }
      #${ids.panel} .totp-button:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }
      #${ids.panel} .totp-button.primary {
        background: #e2e8f0;
        color: #0f172a;
        flex: 1 1 160px;
      }
      #${ids.panel} .totp-button.secondary {
        background: rgba(51, 65, 85, 0.9);
        color: #e2e8f0;
        flex: 1 1 140px;
      }
      #${ids.panel} .totp-button.ghost {
        background: rgba(30, 41, 59, 0.4);
        color: #cbd5e1;
      }
      @media (max-width: 720px) {
        #${ids.panel} {
          margin-top: 18px;
          padding: 16px 14px;
        }
        #${ids.panel} .totp-qr {
          width: 176px;
          height: 176px;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const getTopLevelFormChild = (element, form) => {
    if (!element || !form) {
      return null;
    }

    let current = element;
    while (current && current.parentElement && current.parentElement !== form) {
      current = current.parentElement;
    }

    return current && current.parentElement === form ? current : null;
  };

  const ensurePanel = (form) => {
    let panel = document.getElementById(ids.panel);
    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = ids.panel;

    let insertionPoint = document.getElementById("alternativeMethods") || null;
    while (insertionPoint && insertionPoint.parentElement !== form) {
      insertionPoint = insertionPoint.parentElement;
    }

    if (insertionPoint && insertionPoint.parentElement === form) {
      form.insertBefore(panel, insertionPoint);
    } else {
      form.appendChild(panel);
    }
    return panel;
  };

  const setCredentialsVisibility = (visible) => {
    const form = getLoginForm();
    const handledSections = new Set();

    ["accessKey", "secretKey", "sts"].forEach((fieldId) => {
      const input = getField(fieldId);
      if (!input) {
        return;
      }

      input.disabled = !visible || state.busy;

      const wrapper =
        getTopLevelFormChild(input, form) || input.closest("div");
      if (wrapper && !handledSections.has(wrapper)) {
        wrapper.style.display = visible ? "" : "none";
        handledSections.add(wrapper);
      }
    });

    const loginButton = document.getElementById("do-login");
    if (loginButton) {
      loginButton.disabled = !visible || state.busy;

      const wrapper =
        getTopLevelFormChild(loginButton, form) || loginButton.closest("div");
      if (wrapper && !handledSections.has(wrapper)) {
        wrapper.style.display = visible ? "" : "none";
        handledSections.add(wrapper);
      }
    }

    const alternativeMethods = document.getElementById("alternativeMethods");
    if (alternativeMethods) {
      const wrapper =
        getTopLevelFormChild(alternativeMethods, form) ||
        alternativeMethods.closest("div");
      if (wrapper && !handledSections.has(wrapper)) {
        wrapper.style.display = visible ? "" : "none";
        handledSections.add(wrapper);
      }
    }
  };

  const resetTotpState = () => {
    state.challenge = "";
    state.setup = null;
    state.passcode = "";
    state.busy = false;
    state.error = "";
    state.credentials = null;
    renderPanel();
  };

  const copyText = async (text) => {
    if (!text) {
      return false;
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }

    return copied;
  };

  const renderPanel = () => {
    const form = getLoginForm();
    if (!form) {
      return;
    }

    ensureStyles();

    const panel = ensurePanel(form);
    const challengeVisible = state.challenge !== "";
    const visible = challengeVisible || state.error !== "";
    panel.classList.toggle("is-visible", visible);
    setCredentialsVisibility(!challengeVisible);

    if (!visible) {
      panel.innerHTML = "";
      return;
    }

    if (!challengeVisible) {
      panel.innerHTML = `
        <div id="${ids.error}" class="totp-error is-visible">${escapeHtml(
          state.error,
        )}</div>
      `;
      return;
    }

    const setup = state.setup || {};
    const verifyLabel = state.busy ? "Verificando..." : "Verificar codigo";
    const copyLabel = state.busy ? "Copiando..." : "Copiar chave manual";
    const safeSecret = escapeHtml(setup.secret || "");
    const safeIssuer = escapeHtml(setup.issuer || "MinIO Console");
    const safeAccountName = escapeHtml(setup.accountName || "");
    const errorVisible = state.error ? "is-visible" : "";

    panel.innerHTML = `
      <div id="${ids.error}" class="totp-error ${errorVisible}">${escapeHtml(
        state.error,
      )}</div>
      <p class="totp-title">Verificacao em duas etapas</p>
      <p class="totp-helper">
        Digite o codigo de 6 digitos do seu aplicativo autenticador para concluir o acesso.
      </p>
      ${
        setup.secret
          ? `
            <div class="totp-setup">
              <p class="totp-helper">
                Escaneie o QR code abaixo com o Google Authenticator, Authy ou um aplicativo equivalente.
                Depois confirme o codigo gerado para ativar o segundo fator desta conta.
              </p>
              ${
                setup.qrCode
                  ? `
                    <div class="totp-qr-wrap">
                      <img class="totp-qr" src="${setup.qrCode}" alt="TOTP QR code for ${safeAccountName || safeIssuer}" />
                    </div>
                  `
                  : ""
              }
              <p class="totp-manual-label">Chave manual</p>
              <p class="totp-manual-secret">${safeSecret}</p>
              <div class="totp-copy-row">
                <span class="totp-text">${safeIssuer}${safeAccountName ? ` / ${safeAccountName}` : ""}</span>
                <button
                  id="${ids.copy}"
                  type="button"
                  class="totp-button ghost"
                  ${state.busy ? "disabled" : ""}
                >${copyLabel}</button>
              </div>
            </div>
          `
          : ""
      }
      <input
        id="${ids.input}"
        class="totp-input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        placeholder="Codigo do autenticador"
        value="${escapeHtml(state.passcode)}"
        dir="ltr"
        ${state.busy ? "disabled" : ""}
      />
      <div class="totp-actions">
        <button
          id="${ids.submit}"
          type="button"
          class="totp-button primary"
          ${state.busy ? "disabled" : ""}
        >${verifyLabel}</button>
        <button
          id="${ids.reset}"
          type="button"
          class="totp-button secondary"
          ${state.busy ? "disabled" : ""}
        >Voltar</button>
      </div>
    `;

    const passcodeInput = document.getElementById(ids.input);
    if (passcodeInput) {
      passcodeInput.addEventListener("input", (event) => {
        state.passcode = event.target.value.replace(/\D+/g, "").slice(0, 6);
      });

      passcodeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void submitLogin();
        }
      });

      if (!state.busy) {
        passcodeInput.focus();
        const length = passcodeInput.value.length;
        passcodeInput.setSelectionRange(length, length);
      }
    }
  };

  const parseJSON = async (response) => {
    const raw = await response.text();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Unable to parse login response JSON", error);
      return {};
    }
  };

  const submitLogin = async () => {
    if (state.busy) {
      return;
    }

    const credentials = getCredentials();
    if (!credentials.accessKey || !credentials.secretKey) {
      return;
    }

    if (state.challenge && !state.passcode.trim()) {
      state.error = "O codigo do autenticador e obrigatorio.";
      renderPanel();
      return;
    }

    const payload = {
      accessKey: credentials.accessKey,
      secretKey: credentials.secretKey,
    };

    if (credentials.sts) {
      payload.sts = credentials.sts;
    }

    if (state.challenge) {
      payload.totpChallenge = state.challenge;
      payload.totpPasscode = state.passcode.trim();
    }

    state.busy = true;
    state.error = "";
    renderPanel();

    try {
      const response = await fetch("/api/v1/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = response.status === 204 ? {} : await parseJSON(response);

      if (response.status === 202 && data.requiresTotp && data.totpChallenge) {
        state.challenge = data.totpChallenge;
        state.setup = data.totpSetup || null;
        state.passcode = "";
        state.error = "";
        state.credentials = {
          accessKey: credentials.accessKey,
          secretKey: credentials.secretKey,
          sts: credentials.sts,
        };
        return;
      }

      if (response.ok) {
        rememberLoggedUser(credentials.accessKey);
        window.location.assign(getRedirectTarget());
        return;
      }

      state.error =
        data.message ||
        data.detailedMessage ||
        "Nao foi possivel entrar. Verifique as credenciais e tente novamente.";
    } catch (error) {
      state.error =
        error && error.message
          ? error.message
          : "Nao foi possivel comunicar com o backend do MinIO Console.";
    } finally {
      state.busy = false;
      renderPanel();
    }
  };

  document.addEventListener(
    "submit",
    (event) => {
      const form = getLoginForm();
      if (!form || event.target !== form) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void submitLogin();
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const target =
        event.target instanceof Element
          ? event.target
          : event.target && event.target.parentElement
            ? event.target.parentElement
            : null;

      if (!target) {
        return;
      }

      const copyTrigger = target.closest(`#${ids.copy}`);
      if (copyTrigger) {
        event.preventDefault();
        event.stopImmediatePropagation();

        void (async () => {
          try {
            const copied = await copyText(state.setup?.secret || "");
            if (!copied) {
              state.error = "Nao foi possivel copiar a chave manual.";
              renderPanel();
            }
          } catch (error) {
            console.warn("Unable to copy TOTP secret", error);
            state.error = "Nao foi possivel copiar a chave manual.";
            renderPanel();
          }
        })();
        return;
      }

      const resetTrigger = target.closest(`#${ids.reset}`);
      if (resetTrigger) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resetTotpState();
        return;
      }

      const trigger = target.closest(
        `#do-login, #${ids.submit}`,
      );
      if (!trigger) {
        return;
      }

      const form = getLoginForm();
      if (!form) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void submitLogin();
    },
    true,
  );

  const start = () => {
    const tryBootstrap = () => {
      if (bootstrapped) {
        return true;
      }

      const form = getLoginForm();
      if (!form) {
        return false;
      }

      bootstrapped = true;
      renderPanel();
      return true;
    };

    if (tryBootstrap()) {
      return;
    }

    if (document.body) {
      const observer = new MutationObserver(() => {
        if (syncQueued) {
          return;
        }

        syncQueued = true;
        window.requestAnimationFrame(() => {
          syncQueued = false;
          if (tryBootstrap()) {
            observer.disconnect();
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
