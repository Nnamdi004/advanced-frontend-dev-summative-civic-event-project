const API_BASE_URL = "http://localhost:4000";
const SESSION_KEY = "civicEventsSession";

const authState = {
  token: null,
  user: null,
};

let toastTimer;
let sessionCheckInProgress = false;

function readSession() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!stored || typeof stored.token !== "string" || !stored.user) {
      return null;
    }

    return stored;
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(token, user) {
  authState.token = token;
  authState.user = user;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}

function clearSession() {
  authState.token = null;
  authState.user = null;
  sessionStorage.removeItem(SESSION_KEY);
}

function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const request = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    request.body = JSON.stringify(options.body);
  }

  if (options.auth !== false && authState.token) {
    headers.set("Authorization", `Bearer ${authState.token}`);
  }

  return fetch(`${API_BASE_URL}${path}`, request).then(async (response) => {
    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new Error("The server returned an unreadable response. Please try again.");
      }
    }

    if (response.status === 401 && options.auth !== false) {
      clearSession();
      showView("login");
      showToast("Your session has expired. Please sign in again.", true);
    }

    if (!response.ok) {
      const validationMessage = Array.isArray(payload.errors)
        ? payload.errors.map((item) => item.message).filter(Boolean).join(" ")
        : "";
      throw new Error(validationMessage || payload.message || `Request failed (${response.status}). Please try again.`);
    }

    return payload;
  }).catch((error) => {
    if (error instanceof TypeError) {
      throw new Error("Unable to reach CivicEvents+. Check your connection and make sure the API is running.");
    }
    throw error;
  });
}

function showView(view) {
  $(".auth-view").prop("hidden", true);
  $(`#${view}-view`).prop("hidden", false);

  if (view === "login" || view === "signup") {
    $("#login-error, #signup-error").prop("hidden", true).text("");
    if (window.location.hash !== `#${view}`) {
      window.history.replaceState(null, "", `#${view}`);
    }
  }
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  $("#toast").toggleClass("error", isError).text(message).prop("hidden", false);
  toastTimer = window.setTimeout(() => $("#toast").prop("hidden", true), 4200);
}

function setFormBusy($form, busy) {
  const $button = $form.find('button[type="submit"]');
  $button.prop("disabled", busy);
  $button.find(".button-spinner").prop("hidden", !busy);
  $button.find(".button-arrow").prop("hidden", busy);
}

function showFormError(selector, message) {
  $(selector).text(message).prop("hidden", false);
}

function renderDashboard() {
  const user = authState.user || {};
  $("#dashboard-name").text(user.full_name || "there");
  $("#dashboard-email").text(user.email || "");
  $("#dashboard-role").text(user.role || "user");
  showView("dashboard");
  window.history.replaceState(null, "", "#dashboard");
}

function passwordScore(password) {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[\W_]/.test(password),
  ];
  return checks.filter(Boolean).length;
}

function isStrongPassword(password) {
  return passwordScore(password) === 5;
}

function updatePasswordMeter() {
  const score = passwordScore($("#signup-password").val());
  const colors = ["#c65a51", "#c65a51", "#d59838", "#d59838", "#6a9c5b", "#2e775c"];
  $("#password-meter-bar").css({
    width: `${score * 20}%`,
    backgroundColor: colors[score],
  });
}

function checkRestoredSession() {
  const session = readSession();
  if (!session) {
    authState.token = null;
    authState.user = null;
    showView(window.location.hash === "#signup" ? "signup" : "login");
    return;
  }

  authState.token = session.token;
  authState.user = session.user;
  sessionCheckInProgress = true;
  apiRequest("/api/users/profile/me").then((response) => {
    const user = response.data;
    if (!user || !user.id || !user.role) {
      throw new Error("The API returned an incomplete user profile. Please sign in again.");
    }
    authState.user = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(authState));
    renderDashboard();
  }).catch((error) => {
    if (authState.token) {
      clearSession();
      showView("login");
      showToast(error.message, true);
    }
  }).finally(() => {
    sessionCheckInProgress = false;
  });
}

$(function () {
  $("#current-year").text(new Date().getFullYear());

  $("#login-form").on("submit", function (event) {
    event.preventDefault();
    if (sessionCheckInProgress) return;

    const email = $("#login-email").val().trim();
    const password = $("#login-password").val();
    $("#login-error").prop("hidden", true).text("");

    if (!email || !$("#login-email")[0].checkValidity() || !password) {
      showFormError("#login-error", "Enter a valid email address and password.");
      return;
    }

    const $form = $(this);
    setFormBusy($form, true);
    apiRequest("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    }).then((response) => {
      if (!response.data || !response.data.token || !response.data.user) {
        throw new Error("The API response did not include a valid login session.");
      }
      saveSession(response.data.token, response.data.user);
      renderDashboard();
    }).catch((error) => {
      showFormError("#login-error", error.message);
    }).finally(() => setFormBusy($form, false));
  });

  $("#signup-password").on("input", updatePasswordMeter);

  $("#signup-form").on("submit", function (event) {
    event.preventDefault();

    const fullName = $("#signup-name").val().trim();
    const email = $("#signup-email").val().trim();
    const password = $("#signup-password").val();
    const confirmPassword = $("#signup-confirm-password").val();
    $("#signup-error").prop("hidden", true).text("");

    if (!fullName || !email || !$("#signup-email")[0].checkValidity()) {
      showFormError("#signup-error", "Enter your full name and a valid email address.");
      return;
    }
    if (!isStrongPassword(password)) {
      showFormError("#signup-error", "Choose a password with at least 8 characters, uppercase and lowercase letters, a number, and a special character.");
      return;
    }
    if (password !== confirmPassword) {
      showFormError("#signup-error", "Your passwords do not match.");
      return;
    }

    const $form = $(this);
    setFormBusy($form, true);
    apiRequest("/api/auth/signup", {
      method: "POST",
      auth: false,
      body: { full_name: fullName, email, password },
    }).then((response) => {
      $form[0].reset();
      updatePasswordMeter();
      showView("login");
      $("#login-email").val(email);
      $("#login-password").trigger("focus");
      showToast(response.message || "Your account has been created. Please sign in.");
    }).catch((error) => {
      showFormError("#signup-error", error.message);
    }).finally(() => setFormBusy($form, false));
  });

  $("#logout-button").on("click", () => {
    clearSession();
    showView("login");
    $("#login-password").val("").trigger("focus");
    showToast("You have been signed out.");
  });

  $(window).on("hashchange", () => {
    if (authState.token) {
      renderDashboard();
      return;
    }
    showView(window.location.hash === "#signup" ? "signup" : "login");
  });

  checkRestoredSession();
});
