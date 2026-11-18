const API_BASE_URL = "http://localhost:4000";
const SESSION_KEY = "civicEventsSession";
const EVENTS_PER_PAGE = 6;

const authState = {
  token: null,
  user: null,
};

let toastTimer;
let sessionCheckInProgress = false;
let events = [];
let registrations = [];
let announcements = [];
let promos = [];
let notifications = [];
let eventsLoaded = false;
let registrationsLoaded = false;
let announcementsLoaded = false;
let promosLoaded = false;
let currentEventsPage = 1;
let currentPromosPage = 1;
let promoPagination = { pages: 1 };
let currentRoute = "login";
let currentEventId = null;
let currentAnnouncementId = null;
let currentPromoId = null;
let currentNotificationId = null;
let editingEventId = null;
let imagePreviewObjectUrl = null;
let existingEventImageUrl = "";
let editingAnnouncementId = null;
let announcementPreviewObjectUrl = null;
let editingPromoId = null;
let promoPreviewObjectUrl = null;
let promoCaptionObjectUrl = null;

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
  notifications = [];
  currentNotificationId = null;
  sessionStorage.removeItem(SESSION_KEY);
  updateNotificationUnreadCount();
}

function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const request = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      request.body = options.body;
    } else {
      headers.set("Content-Type", "application/json");
      request.body = JSON.stringify(options.body);
    }
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
      $("#auth-main").prop("hidden", false);
      $("#app-main, #app-nav").prop("hidden", true);
      $("#header-note").prop("hidden", false);
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

function isAdmin() {
  return authState.user && authState.user.role === "admin";
}

function escapePathSegment(value) {
  return encodeURIComponent(String(value));
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return "";
  }
}

function eventDateTime(dateValue) {
  if (!dateValue) return "Date to be announced";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function eventDateRange(event) {
  const start = eventDateTime(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : null;
  const startDate = event.starts_at ? new Date(event.starts_at) : null;
  if (!endDate || Number.isNaN(endDate.getTime())) return start;

  const endTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(endDate);
  if (startDate && startDate.toDateString() === endDate.toDateString()) {
    return `${start} – ${endTime}`;
  }
  return `${start} – ${eventDateTime(event.ends_at)}`;
}

function safeMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const parsedUrl = new URL(url, API_BASE_URL);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:" ? parsedUrl.href : "";
  } catch (error) {
    return "";
  }
}

function isRegistered(eventId) {
  return registrations.some((registration) =>
    registration.event_id === eventId && registration.status === "registered"
  );
}

function hasCancelledRegistration(eventId) {
  return registrations.some((registration) =>
    registration.event_id === eventId && registration.status === "cancelled"
  );
}
