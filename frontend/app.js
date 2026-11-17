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
  sessionStorage.removeItem(SESSION_KEY);
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

function eventActionButton(eventId) {
  const $button = $("<button>").addClass("registration-button").attr("data-event-action", "");
  $button.attr("data-event-id", eventId);
  if (isRegistered(eventId)) {
    return $button.addClass("cancel-registration").attr("data-event-action", "cancel").text("Cancel registration");
  }
  if (hasCancelledRegistration(eventId)) {
    return $button.addClass("cancelled-registration").prop("disabled", true).text("Registration canceled");
  }
  return $button.addClass("register-event").attr("data-event-action", "register").text("Register");
}

function makeEventCard(event, registration = null) {
  const eventId = registration ? registration.event_id : event.id;
  const $card = $("<article>").addClass("event-card");
  const imageUrl = safeMediaUrl(event.metadata && event.metadata.image_url);

  if (imageUrl) {
    $("<img>").addClass("event-card-image").attr({
      src: imageUrl,
      alt: "",
      loading: "lazy",
    }).appendTo($card);
  } else {
    $("<div>").addClass("event-card-placeholder").attr("aria-hidden", "true")
      .append($("<span>").text("C+")).appendTo($card);
  }

  const $body = $("<div>").addClass("event-card-body").appendTo($card);
  const $meta = $("<div>").addClass("event-card-meta").appendTo($body);
  $("<span>").addClass("event-date-label").text(eventDateTime(event.starts_at)).appendTo($meta);
  if (registration && registration.status === "cancelled") {
    $("<span>").addClass("status-pill cancelled-pill").text("Canceled").appendTo($meta);
  } else if (registration && registration.status === "registered") {
    $("<span>").addClass("status-pill registered-pill").text("Registered").appendTo($meta);
  }

  $("<h2>").addClass("event-card-title").text(event.title || "Community event").appendTo($body);
  $("<p>").addClass("event-card-description").text(event.description || "Details coming soon.").appendTo($body);

  const $location = $("<p>").addClass("event-card-location");
  $("<span>").attr("aria-hidden", "true").text("⌖").appendTo($location);
  $location.append(document.createTextNode(` ${event.location || "Location to be announced"}`)).appendTo($body);
  $("<a>").addClass("event-view-link").attr("href", `#event/${escapePathSegment(eventId)}`)
    .text("View details").appendTo($body);

  const $actions = $("<div>").addClass("event-card-actions").appendTo($body);
  if (!registration || registration.status === "registered") {
    eventActionButton(eventId).appendTo($actions);
  }
  if (isAdmin()) {
    $("<a>").addClass("event-edit-button")
      .attr("href", `#edit-event/${escapePathSegment(eventId)}`)
      .text("Edit").appendTo($actions);
    $("<button>").attr({
      type: "button",
      "data-delete-event": eventId,
    }).addClass("event-delete-button").text("Delete").appendTo($actions);
  }
  return $card;
}

function visibleEvents() {
  const search = $("#event-search").val().trim().toLowerCase();
  const location = $("#event-location-filter").val().trim().toLowerCase();
  const startsAfter = $("#event-date-filter").val();

  return events.filter((event) => {
    if (!isAdmin() && event.published !== true) return false;
    const searchableText = `${event.title || ""} ${event.description || ""}`.toLowerCase();
    if (search && !searchableText.includes(search)) return false;
    if (location && !(event.location || "").toLowerCase().includes(location)) return false;
    if (startsAfter && event.starts_at && event.starts_at.slice(0, 10) < startsAfter) return false;
    return true;
  });
}

function renderPagination(pageCount) {
  const $pagination = $("#events-pagination").empty();
  if (pageCount <= 1) {
    $pagination.prop("hidden", true);
    return;
  }

  $pagination.prop("hidden", false);
  const $previous = $("<button>").addClass("page-button").text("← Previous")
    .prop("disabled", currentEventsPage === 1)
    .on("click", () => changeEventsPage(currentEventsPage - 1));
  const $next = $("<button>").addClass("page-button").text("Next →")
    .prop("disabled", currentEventsPage === pageCount)
    .on("click", () => changeEventsPage(currentEventsPage + 1));
  const $status = $("<span>").addClass("page-status")
    .text(`Page ${currentEventsPage} of ${pageCount}`);
  $pagination.append($previous, $status, $next);
}

function changeEventsPage(page) {
  currentEventsPage = page;
  renderEvents();
  $("#events-title")[0].scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderEvents() {
  const filtered = visibleEvents();
  const pageCount = Math.max(1, Math.ceil(filtered.length / EVENTS_PER_PAGE));
  currentEventsPage = Math.min(currentEventsPage, pageCount);
  const start = (currentEventsPage - 1) * EVENTS_PER_PAGE;
  const pageEvents = filtered.slice(start, start + EVENTS_PER_PAGE);
  const $grid = $("#events-grid").empty();

  pageEvents.forEach((event) => $grid.append(makeEventCard(event)));
  $("#events-empty").prop("hidden", filtered.length > 0);
  $("#events-pagination").prop("hidden", filtered.length === 0);
  renderPagination(pageCount);
}

function loadEvents() {
  $("#events-loading").prop("hidden", false);
  $("#events-error, #events-empty, #events-pagination").prop("hidden", true);
  $("#events-grid").empty();

  return Promise.all([
    apiRequest("/api/events"),
    apiRequest("/api/event-registrations/my-registrations"),
  ]).then(([eventResponse, registrationResponse]) => {
    if (!Array.isArray(eventResponse.data) || !Array.isArray(registrationResponse.data)) {
      throw new Error("The API returned an unexpected events response.");
    }
    events = eventResponse.data;
    registrations = registrationResponse.data;
    eventsLoaded = true;
    registrationsLoaded = true;
    currentEventsPage = 1;
    $("#events-loading").prop("hidden", true);
    renderEvents();
    updateDashboardSummary();
  }).catch((error) => {
    $("#events-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#events-error-message").text(error.message);
    $("#events-error").prop("hidden", false);
  });
}

function dateTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
}

function setEventImagePreview(url, caption) {
  if (imagePreviewObjectUrl) {
    URL.revokeObjectURL(imagePreviewObjectUrl);
    imagePreviewObjectUrl = null;
  }
  if (url && url.startsWith("blob:")) imagePreviewObjectUrl = url;

  if (!url) {
    $("#event-image-preview").prop("hidden", true);
    $("#event-image-preview-img").removeAttr("src");
    $("#event-image-preview-caption").text("");
    return;
  }

  $("#event-image-preview-img").attr("src", url);
  $("#event-image-preview-caption").text(caption || "Image preview");
  $("#event-image-preview").prop("hidden", false);
}

function validateEventImage(file) {
  if (!file) return "";
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["jpg", "jpeg", "png", "gif"].includes(extension)) {
    return "Choose a JPG, PNG, or GIF image.";
  }
  if (file.size > 2 * 1024 * 1024) {
    return "The image must be 2 MB or smaller.";
  }
  return "";
}

function loadEventForm(eventId = null) {
  const form = $("#event-form")[0];
  form.reset();
  editingEventId = eventId;
  existingEventImageUrl = "";
  $("#event-form-error").prop("hidden", true).text("");
  $("#event-form-title").text(eventId ? "Edit event" : "Create event");
  $("#event-form-submit .event-form-button-label").text(eventId ? "Save changes" : "Create event");
  $("#event-form-image").val("");
  setEventImagePreview("", "");

  if (!eventId) return;

  $("#event-form-submit .event-form-button-label").text("Loading event…");
  apiRequest(`/api/events/${escapePathSegment(eventId)}`).then((response) => {
    if (editingEventId !== eventId) return;
    const event = response.data;
    if (!event || !event.id) {
      throw new Error("This event could not be found.");
    }

    $("#event-form-title-input").val(event.title || "");
    $("#event-form-description").val(event.description || "");
    $("#event-form-location").val(event.location || "");
    $("#event-form-start").val(dateTimeInputValue(event.starts_at));
    $("#event-form-end").val(dateTimeInputValue(event.ends_at));
    const imageUrl = safeMediaUrl(event.metadata && event.metadata.image_url);
    existingEventImageUrl = imageUrl;
    if (imageUrl) setEventImagePreview(imageUrl, "Current event image");
    $("#event-form-submit .event-form-button-label").text("Save changes");
  }).catch((error) => {
    if (editingEventId !== eventId) return;
    $("#event-form-error").text(error.message).prop("hidden", false);
    $("#event-form-submit .event-form-button-label").text("Save changes");
  });
}

function saveEventForm(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Only administrators can manage events.", true);
    return;
  }

  const title = $("#event-form-title-input").val().trim();
  const description = $("#event-form-description").val().trim();
  const location = $("#event-form-location").val().trim();
  const startsAt = $("#event-form-start").val();
  const endsAt = $("#event-form-end").val();
  const image = $("#event-form-image")[0].files[0];
  $("#event-form-error").prop("hidden", true).text("");

  if (!title || !location || !startsAt || !endsAt) {
    $("#event-form-error").text("Enter an event title, location, start time, and end time.").prop("hidden", false);
    return;
  }
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    $("#event-form-error").text("The end time must be after the start time.").prop("hidden", false);
    return;
  }
  const imageError = validateEventImage(image);
  if (imageError) {
    $("#event-form-error").text(imageError).prop("hidden", false);
    return;
  }

  const formData = new FormData();
  formData.append("title", title);
  formData.append("description", description);
  formData.append("location", location);
  formData.append("starts_at", startDate.toISOString());
  formData.append("ends_at", endDate.toISOString());
  if (image) formData.append("image", image);

  const isEditing = Boolean(editingEventId);
  const path = isEditing ? `/api/events/${escapePathSegment(editingEventId)}` : "/api/events";
  const $button = $("#event-form-submit");
  $button.prop("disabled", true);
  $button.find(".event-form-button-label").text("Saving event…");
  $button.find(".button-spinner").prop("hidden", false);

  apiRequest(path, {
    method: isEditing ? "PUT" : "POST",
    body: formData,
  }).then((response) => {
    eventsLoaded = false;
    window.history.replaceState(null, "", "#admin-events");
    navigateAuthenticatedRoute("admin-events");
    showToast(response.message || (isEditing ? "Event updated." : "Event created."));
  }).catch((error) => {
    $("#event-form-error").text(error.message).prop("hidden", false);
  }).finally(() => {
    $button.prop("disabled", false);
    $button.find(".event-form-button-label").text(isEditing ? "Save changes" : "Create event");
    $button.find(".button-spinner").prop("hidden", true);
  });
}

function deleteEvent(eventId) {
  if (!isAdmin()) {
    showToast("Only administrators can manage events.", true);
    return;
  }
  const event = events.find((item) => item.id === eventId);
  const eventTitle = event ? event.title : "this event";
  if (!window.confirm(`Delete "${eventTitle}"? This action cannot be undone.`)) return;

  apiRequest(`/api/events/${escapePathSegment(eventId)}`, { method: "DELETE" }).then((response) => {
    events = events.filter((item) => item.id !== eventId);
    eventsLoaded = true;
    registrations = registrations.filter((item) => item.event_id !== eventId);
    if (currentRoute === "event-detail") {
      window.history.replaceState(null, "", "#admin-events");
      navigateAuthenticatedRoute("admin-events");
    } else {
      renderEvents();
      updateDashboardSummary();
    }
    showToast(response.message || "Event deleted.");
  }).catch((error) => {
    showToast(error.message, true);
  });
}

function formatAudioDuration(durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration < 0) return "";
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function announcementIsPublished(announcement) {
  return announcement.published === true;
}

function makeAnnouncementAdminActions(announcement, $container) {
  const $actions = $("<div>").addClass("announcement-admin-actions").appendTo($container);
  $("<a>").addClass("event-edit-button")
    .attr("href", `#edit-announcement/${escapePathSegment(announcement.id)}`)
    .text("Edit").appendTo($actions);
  $("<button>").attr({
    type: "button",
    "data-announcement-toggle": announcement.id,
    "data-publish-action": announcementIsPublished(announcement) ? "unpublish" : "publish",
  }).addClass("announcement-publish-button")
    .text(announcementIsPublished(announcement) ? "Unpublish" : "Publish")
    .appendTo($actions);
  $("<button>").attr({
    type: "button",
    "data-delete-announcement": announcement.id,
  }).addClass("event-delete-button").text("Delete").appendTo($actions);
}

function makeAnnouncementCard(announcement) {
  const $card = $("<article>").addClass("announcement-card");
  const $header = $("<div>").addClass("announcement-card-header").appendTo($card);
  $("<span>").addClass("announcement-icon").attr("aria-hidden", "true").text("♫").appendTo($header);
  if (isAdmin() && !announcementIsPublished(announcement)) {
    $("<span>").addClass("status-pill cancelled-pill").text("Unpublished").appendTo($header);
  }

  const $body = $("<div>").addClass("announcement-card-body").appendTo($card);
  $("<p>").addClass("announcement-date").text(announcement.created_at ? eventDateTime(announcement.created_at) : "Community update")
    .appendTo($body);
  $("<h2>").addClass("font-display announcement-card-title")
    .text(announcement.title || "Community announcement").appendTo($body);
  const duration = formatAudioDuration(announcement.duration_seconds);
  if (duration) $("<p>").addClass("announcement-duration").text(`Audio · ${duration}`).appendTo($body);

  const audioUrl = safeMediaUrl(announcement.audio_url);
  if (audioUrl) {
    $("<audio>").attr({
      controls: true,
      preload: "none",
      src: audioUrl,
      "aria-label": `Play announcement: ${announcement.title || "community update"}`,
    }).addClass("announcement-audio").text("Your browser does not support audio playback.")
      .appendTo($body);
  } else {
    $("<p>").addClass("announcement-error").text("Audio is currently unavailable.").appendTo($body);
  }
  $("<a>").addClass("event-view-link")
    .attr("href", `#announcement/${escapePathSegment(announcement.id)}`)
    .text("Announcement details").appendTo($body);

  if (isAdmin()) makeAnnouncementAdminActions(announcement, $body);
  return $card;
}

function visibleAnnouncements() {
  return announcements.filter((announcement) => isAdmin() || announcementIsPublished(announcement));
}

function renderAnnouncements() {
  const visible = visibleAnnouncements();
  const $grid = $("#announcements-grid").empty();
  visible.forEach((announcement) => $grid.append(makeAnnouncementCard(announcement)));
  $("#announcements-empty").prop("hidden", visible.length > 0);
}

function loadAnnouncements() {
  $("#announcements-loading").prop("hidden", false);
  $("#announcements-error, #announcements-empty").prop("hidden", true);
  $("#announcements-grid").empty();

  return apiRequest("/api/announcements").then((response) => {
    if (!Array.isArray(response.data)) {
      throw new Error("The API returned an unexpected announcements response.");
    }
    announcements = response.data;
    announcementsLoaded = true;
    $("#announcements-loading").prop("hidden", true);
    renderAnnouncements();
  }).catch((error) => {
    $("#announcements-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#announcements-error-message").text(error.message);
    $("#announcements-error").prop("hidden", false);
  });
}

function loadAnnouncementDetail(announcementId) {
  currentAnnouncementId = announcementId;
  $("#announcement-detail-content, #announcement-detail-error").prop("hidden", true);
  $("#announcement-detail-loading").prop("hidden", false);
  apiRequest(`/api/announcements/${escapePathSegment(announcementId)}`).then((response) => {
    if (currentAnnouncementId !== announcementId) return;
    const announcement = response.data;
    if (!announcement || !announcement.id) {
      throw new Error("This announcement could not be found.");
    }
    if (!isAdmin() && !announcementIsPublished(announcement)) {
      throw new Error("This announcement is not available.");
    }
    $("#announcement-detail-loading").prop("hidden", true);
    renderAnnouncementDetail(announcement);
  }).catch((error) => {
    if (currentAnnouncementId !== announcementId) return;
    $("#announcement-detail-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#announcement-detail-error-message").text(error.message);
    $("#announcement-detail-error").prop("hidden", false);
  });
}

function renderAnnouncementDetail(announcement) {
  const $content = $("#announcement-detail-content").empty();
  const $body = $("<div>").addClass("announcement-detail-body").appendTo($content);
  const $meta = $("<div>").addClass("announcement-detail-meta").appendTo($body);
  $("<p>").addClass("form-eyebrow").text("COMMUNITY ANNOUNCEMENT").appendTo($meta);
  if (isAdmin()) {
    $("<span>").addClass(`status-pill ${announcementIsPublished(announcement) ? "registered-pill" : "cancelled-pill"}`)
      .text(announcementIsPublished(announcement) ? "Published" : "Unpublished").appendTo($meta);
  }
  $("<h1>").attr("id", "announcement-detail-title").addClass("font-display announcement-detail-title")
    .text(announcement.title || "Community announcement").appendTo($body);
  if (announcement.created_at) {
    $("<p>").addClass("announcement-date").text(`Posted ${eventDateTime(announcement.created_at)}`).appendTo($body);
  }

  const audioUrl = safeMediaUrl(announcement.audio_url);
  if (audioUrl) {
    const $audio = $("<audio>").attr({
      controls: true,
      preload: "metadata",
      src: audioUrl,
      "aria-label": `Audio announcement: ${announcement.title || "community update"}`,
    }).addClass("announcement-detail-audio");
    $audio.append("Your browser does not support audio playback.");
    $audio.on("loadedmetadata", function () {
      const duration = formatAudioDuration(this.duration);
      if (duration) $("#announcement-detail-duration").text(duration).prop("hidden", false);
    });
    $audio.appendTo($body);
    const duration = formatAudioDuration(announcement.duration_seconds);
    $("<p>").attr("id", "announcement-detail-duration").addClass("announcement-duration")
      .text(duration).prop("hidden", !duration).appendTo($body);
  } else {
    $("<p>").addClass("announcement-error").text("Audio is currently unavailable.").appendTo($body);
  }

  const transcript = announcement.transcript || announcement.transcript_text;
  if (typeof transcript === "string" && transcript.trim()) {
    const $transcript = $("<section>").addClass("announcement-transcript")
      .attr("aria-labelledby", "announcement-transcript-title").appendTo($body);
    $("<h2>").attr("id", "announcement-transcript-title").addClass("font-display")
      .text("Transcript").appendTo($transcript);
    $("<p>").text(transcript).appendTo($transcript);
  }

  if (isAdmin()) makeAnnouncementAdminActions(announcement, $("<div>").addClass("announcement-detail-actions").appendTo($body));
  $("#announcement-detail-content").prop("hidden", false);
}

function setAnnouncementAudioPreview(url) {
  if (announcementPreviewObjectUrl) {
    URL.revokeObjectURL(announcementPreviewObjectUrl);
    announcementPreviewObjectUrl = null;
  }
  if (url && url.startsWith("blob:")) announcementPreviewObjectUrl = url;
  $("#announcement-audio-preview").attr("src", url || "").prop("hidden", !url);
}

function validateAnnouncementAudio(file) {
  if (!file) return "";
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["mp3", "wav", "m4a", "ogg"].includes(extension)) {
    return "Choose an MP3, WAV, M4A, or OGG audio file.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "The audio file must be 5 MB or smaller.";
  }
  return "";
}

function loadAnnouncementForm(announcementId = null) {
  $("#announcement-form")[0].reset();
  editingAnnouncementId = announcementId;
  $("#announcement-form-error").prop("hidden", true).text("");
  $("#announcement-form-title").text(announcementId ? "Edit announcement" : "Create announcement");
  $("#announcement-form-submit .event-form-button-label")
    .text(announcementId ? "Save changes" : "Create announcement");
  $("#announcement-audio-upload-field").prop("hidden", Boolean(announcementId));
  $("#announcement-edit-audio-note").prop("hidden", !announcementId);
  $("#announcement-current-audio").removeAttr("src").prop("hidden", true);
  setAnnouncementAudioPreview("");
  $("#announcement-form-published").prop("checked", true);

  if (!announcementId) return;

  apiRequest(`/api/announcements/${escapePathSegment(announcementId)}`).then((response) => {
    if (editingAnnouncementId !== announcementId) return;
    const announcement = response.data;
    if (!announcement || !announcement.id) {
      throw new Error("This announcement could not be found.");
    }
    $("#announcement-form-title-input").val(announcement.title || "");
    $("#announcement-form-published").prop("checked", announcementIsPublished(announcement));
    const audioUrl = safeMediaUrl(announcement.audio_url);
    if (audioUrl) $("#announcement-current-audio").attr("src", audioUrl).prop("hidden", false);
  }).catch((error) => {
    if (editingAnnouncementId === announcementId) {
      $("#announcement-form-error").text(error.message).prop("hidden", false);
    }
  });
}

function saveAnnouncementForm(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Only administrators can manage announcements.", true);
    return;
  }

  const title = $("#announcement-form-title-input").val().trim();
  const published = $("#announcement-form-published").is(":checked");
  const audioFile = $("#announcement-form-audio")[0].files[0];
  $("#announcement-form-error").prop("hidden", true).text("");

  if (!title) {
    $("#announcement-form-error").text("Enter an announcement title.").prop("hidden", false);
    return;
  }
  if (!editingAnnouncementId && !audioFile) {
    $("#announcement-form-error").text("Choose an audio file to upload.").prop("hidden", false);
    return;
  }
  const audioError = validateAnnouncementAudio(audioFile);
  if (audioError) {
    $("#announcement-form-error").text(audioError).prop("hidden", false);
    return;
  }

  const isEditing = Boolean(editingAnnouncementId);
  const options = isEditing
    ? { method: "PUT", body: { title, published } }
    : (() => {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("published", String(published));
      formData.append("audio", audioFile);
      return { method: "POST", body: formData };
    })();

  const path = isEditing
    ? `/api/announcements/${escapePathSegment(editingAnnouncementId)}`
    : "/api/announcements";
  const $button = $("#announcement-form-submit");
  $button.prop("disabled", true);
  $button.find(".event-form-button-label").text("Saving announcement…");
  $button.find(".button-spinner").prop("hidden", false);
  apiRequest(path, options).then((response) => {
    announcementsLoaded = false;
    setAnnouncementAudioPreview("");
    window.history.replaceState(null, "", "#announcements");
    navigateAuthenticatedRoute("announcements");
    showToast(response.message || (isEditing ? "Announcement updated." : "Announcement created."));
  }).catch((error) => {
    $("#announcement-form-error").text(error.message).prop("hidden", false);
  }).finally(() => {
    $button.prop("disabled", false);
    $button.find(".event-form-button-label").text(isEditing ? "Save changes" : "Create announcement");
    $button.find(".button-spinner").prop("hidden", true);
  });
}

function deleteAnnouncement(announcementId) {
  if (!isAdmin()) {
    showToast("Only administrators can manage announcements.", true);
    return;
  }
  const announcement = announcements.find((item) => item.id === announcementId);
  const title = announcement ? announcement.title : "this announcement";
  if (!window.confirm(`Delete "${title}"? This action cannot be undone.`)) return;

  apiRequest(`/api/announcements/${escapePathSegment(announcementId)}`, { method: "DELETE" }).then((response) => {
    if (announcementsLoaded) {
      announcements = announcements.filter((item) => item.id !== announcementId);
    }
    if (currentRoute === "announcement-detail") {
      announcementsLoaded = false;
      window.history.replaceState(null, "", "#announcements");
      navigateAuthenticatedRoute("announcements");
    } else {
      announcementsLoaded = true;
      renderAnnouncements();
    }
    showToast(response.message || "Announcement deleted.");
  }).catch((error) => {
    showToast(error.message, true);
  });
}

function toggleAnnouncementPublication(announcementId, action) {
  if (!isAdmin()) {
    showToast("Only administrators can manage announcements.", true);
    return;
  }
  const endpoint = action === "publish" ? "publish" : "unpublish";
  apiRequest(`/api/announcements/${escapePathSegment(announcementId)}/${endpoint}`, { method: "PATCH" })
    .then((response) => {
      if (!response.data) throw new Error("The API returned an unexpected announcement response.");
      if (announcementsLoaded) {
        announcements = announcements.map((item) => item.id === announcementId ? response.data : item);
      }
      if (currentRoute === "announcement-detail" && currentAnnouncementId === announcementId) {
        renderAnnouncementDetail(response.data);
      } else {
        announcementsLoaded = true;
        renderAnnouncements();
      }
      showToast(response.message || `Announcement ${action === "publish" ? "published" : "unpublished"}.`);
    }).catch((error) => {
      showToast(error.message, true);
    });
}

function promoIsPublished(promo) {
  return promo.published === true;
}

function makePromoAdminActions(promo, $container) {
  const $actions = $("<div>").addClass("promo-admin-actions").appendTo($container);
  $("<a>").addClass("event-edit-button")
    .attr("href", `#edit-promo/${escapePathSegment(promo.id)}`)
    .text("Edit").appendTo($actions);
  $("<button>").attr({
    type: "button",
    "data-promo-toggle": promo.id,
    "data-publish-action": promoIsPublished(promo) ? "unpublish" : "publish",
  }).addClass("announcement-publish-button")
    .text(promoIsPublished(promo) ? "Unpublish" : "Publish")
    .appendTo($actions);
  $("<button>").attr({
    type: "button",
    "data-delete-promo": promo.id,
  }).addClass("event-delete-button").text("Delete").appendTo($actions);
}

function makePromoCard(promo) {
  const $card = $("<article>").addClass("promo-card");
  const $visual = $("<div>").addClass("promo-card-visual").appendTo($card);
  const posterUrl = safeMediaUrl(promo.thumbnail_url || (promo.metadata && promo.metadata.thumbnail_url));
  if (posterUrl) {
    $("<img>").attr({ src: posterUrl, alt: "", loading: "lazy" }).appendTo($visual);
  } else {
    $("<span>").attr("aria-hidden", "true").text("▶").appendTo($visual);
  }
  if (isAdmin() && !promoIsPublished(promo)) {
    $("<span>").addClass("status-pill cancelled-pill promo-status-pill").text("Unpublished").appendTo($visual);
  }

  const $body = $("<div>").addClass("promo-card-body").appendTo($card);
  $("<p>").addClass("announcement-date").text(promo.created_at ? eventDateTime(promo.created_at) : "Community video")
    .appendTo($body);
  $("<h2>").addClass("font-display promo-card-title")
    .text(promo.title || "Community promo").appendTo($body);
  $("<p>").addClass("promo-card-description")
    .text(promo.description || "Watch this community update.").appendTo($body);
  $("<a>").addClass("primary-button promo-play-button")
    .attr("href", `#promo/${escapePathSegment(promo.id)}`)
    .text("Play promo").append($("<span>").attr("aria-hidden", "true").text("▶"))
    .appendTo($body);
  if (isAdmin()) makePromoAdminActions(promo, $body);
  return $card;
}

function visiblePromos() {
  return promos.filter((promo) => isAdmin() || promoIsPublished(promo));
}

function renderPromoPagination() {
  const pages = Math.max(1, Number(promoPagination.pages) || 1);
  const $pagination = $("#promos-pagination").empty();
  if (pages <= 1) {
    $pagination.prop("hidden", true);
    return;
  }

  $pagination.prop("hidden", false);
  $("<button>").addClass("page-button").text("← Previous")
    .prop("disabled", currentPromosPage <= 1)
    .on("click", () => loadPromos(currentPromosPage - 1))
    .appendTo($pagination);
  $("<span>").addClass("page-status").text(`Page ${currentPromosPage} of ${pages}`).appendTo($pagination);
  $("<button>").addClass("page-button").text("Next →")
    .prop("disabled", currentPromosPage >= pages)
    .on("click", () => loadPromos(currentPromosPage + 1))
    .appendTo($pagination);
}

function renderPromos() {
  const visible = visiblePromos();
  const $grid = $("#promos-grid").empty();
  visible.forEach((promo) => $grid.append(makePromoCard(promo)));
  $("#promos-empty").prop("hidden", visible.length > 0);
  renderPromoPagination();
}

function loadPromos(page = 1) {
  currentPromosPage = page;
  $("#promos-loading").prop("hidden", false);
  $("#promos-error, #promos-empty, #promos-pagination").prop("hidden", true);
  $("#promos-grid").empty();

  return apiRequest(`/api/promos?page=${page}&limit=20`).then((response) => {
    if (!Array.isArray(response.data)) {
      throw new Error("The API returned an unexpected promos response.");
    }
    promos = response.data;
    promoPagination = response.pagination || { pages: 1 };
    currentPromosPage = Number(promoPagination.page) || page;
    promosLoaded = true;
    $("#promos-loading").prop("hidden", true);
    renderPromos();
  }).catch((error) => {
    $("#promos-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#promos-error-message").text(error.message);
    $("#promos-error").prop("hidden", false);
  });
}

function releasePromoCaptionUrl() {
  if (promoCaptionObjectUrl) {
    URL.revokeObjectURL(promoCaptionObjectUrl);
    promoCaptionObjectUrl = null;
  }
}

function renderPromoDetail(promo) {
  releasePromoCaptionUrl();
  const $content = $("#promo-detail-content").empty();
  const $body = $("<div>").addClass("promo-detail-body").appendTo($content);
  $("<p>").addClass("form-eyebrow").text("COMMUNITY PROMO").appendTo($body);
  if (isAdmin()) {
    $("<span>").addClass(`status-pill ${promoIsPublished(promo) ? "registered-pill" : "cancelled-pill"}`)
      .text(promoIsPublished(promo) ? "Published" : "Unpublished").appendTo($body);
  }
  $("<h1>").attr("id", "promo-detail-title").addClass("font-display promo-detail-title")
    .text(promo.title || "Community promo").appendTo($body);
  $("<p>").addClass("promo-detail-description")
    .text(promo.description || "Community video.").appendTo($body);

  const videoUrl = safeMediaUrl(promo.video_url);
  if (videoUrl) {
    const $video = $("<video>").attr({
      controls: true,
      playsinline: true,
      preload: "metadata",
      src: videoUrl,
      "aria-label": `Promo video: ${promo.title || "community promo"}`,
    }).addClass("promo-detail-video");
    const posterUrl = safeMediaUrl(promo.thumbnail_url || (promo.metadata && promo.metadata.thumbnail_url));
    if (posterUrl) $video.attr("poster", posterUrl);
    $video.append("Your browser does not support HTML video playback.");

    let captionUrl = safeMediaUrl(promo.caption_url);
    const captionText = typeof promo.caption_text === "string" ? promo.caption_text.trim() : "";
    const hasWebVtt = /^WEBVTT(?:\s|$)/i.test(captionText);
    if (!captionUrl && hasWebVtt) {
      promoCaptionObjectUrl = URL.createObjectURL(new Blob([captionText], { type: "text/vtt" }));
      captionUrl = promoCaptionObjectUrl;
    }
    if (captionUrl) {
      const track = document.createElement("track");
      track.kind = "captions";
      track.label = "English";
      track.srclang = "en";
      track.default = true;
      track.src = captionUrl;
      $video[0].append(track);
      $video.on("loadedmetadata", function () {
        if (this.textTracks.length) this.textTracks[0].mode = "showing";
      });
    }
    $video.appendTo($body);
    if (captionUrl) {
      $("<p>").addClass("promo-caption-note").text("English captions are available in the video player’s captions menu.")
        .appendTo($body);
    }
  } else {
    $("<p>").addClass("announcement-error").text("Video is currently unavailable.").appendTo($body);
  }

  const captionText = typeof promo.caption_text === "string" ? promo.caption_text.trim() : "";
  if (captionText && !/^WEBVTT(?:\s|$)/i.test(captionText)) {
    const $transcript = $("<section>").addClass("promo-transcript")
      .attr("aria-labelledby", "promo-transcript-title").appendTo($body);
    $("<h2>").attr("id", "promo-transcript-title").addClass("font-display")
      .text("Transcript").appendTo($transcript);
    $("<p>").text(captionText).appendTo($transcript);
  }
  if (isAdmin()) makePromoAdminActions(promo, $("<div>").addClass("promo-detail-actions").appendTo($body));
  $("#promo-detail-content").prop("hidden", false);
}

function loadPromoDetail(promoId) {
  currentPromoId = promoId;
  $("#promo-detail-content, #promo-detail-error").prop("hidden", true);
  $("#promo-detail-loading").prop("hidden", false);
  apiRequest(`/api/promos/${escapePathSegment(promoId)}`).then((response) => {
    if (currentPromoId !== promoId) return;
    const promo = response.data;
    if (!promo || !promo.id) throw new Error("This promo could not be found.");
    if (!isAdmin() && !promoIsPublished(promo)) throw new Error("This promo is not available.");
    $("#promo-detail-loading").prop("hidden", true);
    renderPromoDetail(promo);
  }).catch((error) => {
    if (currentPromoId !== promoId) return;
    $("#promo-detail-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#promo-detail-error-message").text(error.message);
    $("#promo-detail-error").prop("hidden", false);
  });
}

function setPromoVideoPreview(url) {
  if (promoPreviewObjectUrl) {
    URL.revokeObjectURL(promoPreviewObjectUrl);
    promoPreviewObjectUrl = null;
  }
  if (url && url.startsWith("blob:")) promoPreviewObjectUrl = url;
  $("#promo-video-preview").attr("src", url || "").prop("hidden", !url);
}

function validatePromoVideo(file) {
  if (!file) return "";
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["mp4", "mov", "avi", "mkv"].includes(extension)) {
    return "Choose an MP4, MOV, AVI, or MKV video.";
  }
  if (file.size > 8 * 1024 * 1024) {
    return "The video must be 8 MB or smaller.";
  }
  return "";
}

function loadPromoForm(promoId = null) {
  $("#promo-form")[0].reset();
  editingPromoId = promoId;
  $("#promo-form-error").prop("hidden", true).text("");
  $("#promo-form-title").text(promoId ? "Edit promo" : "Create promo");
  $("#promo-form-submit .event-form-button-label").text(promoId ? "Save changes" : "Create promo");
  $("#promo-video-upload-field").prop("hidden", false);
  $("#promo-edit-video-note").prop("hidden", !promoId);
  $("#promo-publish-note").prop("hidden", Boolean(promoId));
  $("#promo-current-video").removeAttr("src").prop("hidden", true);
  $("#promo-form-video").val("");
  setPromoVideoPreview("");

  if (!promoId) return;

  apiRequest(`/api/promos/${escapePathSegment(promoId)}`).then((response) => {
    if (editingPromoId !== promoId) return;
    const promo = response.data;
    if (!promo || !promo.id) throw new Error("This promo could not be found.");
    $("#promo-form-title-input").val(promo.title || "");
    $("#promo-form-description").val(promo.description || "");
    $("#promo-form-captions").val(promo.caption_text || "");
    const videoUrl = safeMediaUrl(promo.video_url);
    if (videoUrl) $("#promo-current-video").attr("src", videoUrl).prop("hidden", false);
  }).catch((error) => {
    if (editingPromoId === promoId) $("#promo-form-error").text(error.message).prop("hidden", false);
  });
}

function savePromoForm(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Only administrators can manage promos.", true);
    return;
  }

  const title = $("#promo-form-title-input").val().trim();
  const description = $("#promo-form-description").val().trim();
  const captionText = $("#promo-form-captions").val().trim();
  const videoFile = $("#promo-form-video")[0].files[0];
  $("#promo-form-error").prop("hidden", true).text("");

  if (!title || !description || !captionText) {
    $("#promo-form-error").text("Enter a title, description, and captions or transcript.").prop("hidden", false);
    return;
  }
  if (!editingPromoId && !videoFile) {
    $("#promo-form-error").text("Choose a video to upload.").prop("hidden", false);
    return;
  }
  const videoError = validatePromoVideo(videoFile);
  if (videoError) {
    $("#promo-form-error").text(videoError).prop("hidden", false);
    return;
  }

  const formData = new FormData();
  formData.append("title", title);
  formData.append("description", description);
  formData.append("caption_text", captionText);
  if (videoFile) formData.append("video", videoFile);

  const isEditing = Boolean(editingPromoId);
  const path = isEditing ? `/api/promos/${escapePathSegment(editingPromoId)}` : "/api/promos";
  const $button = $("#promo-form-submit");
  $button.prop("disabled", true);
  $button.find(".event-form-button-label").text("Saving promo…");
  $button.find(".button-spinner").prop("hidden", false);
  apiRequest(path, { method: isEditing ? "PUT" : "POST", body: formData }).then((response) => {
    promosLoaded = false;
    setPromoVideoPreview("");
    currentPromosPage = 1;
    window.history.replaceState(null, "", "#promos");
    navigateAuthenticatedRoute("promos");
    showToast(response.message || (isEditing ? "Promo updated." : "Promo created."));
  }).catch((error) => {
    $("#promo-form-error").text(error.message).prop("hidden", false);
  }).finally(() => {
    $button.prop("disabled", false);
    $button.find(".event-form-button-label").text(isEditing ? "Save changes" : "Create promo");
    $button.find(".button-spinner").prop("hidden", true);
  });
}

function deletePromo(promoId) {
  if (!isAdmin()) {
    showToast("Only administrators can manage promos.", true);
    return;
  }
  const promo = promos.find((item) => item.id === promoId);
  const title = promo ? promo.title : "this promo";
  if (!window.confirm(`Delete "${title}"? This action cannot be undone.`)) return;

  apiRequest(`/api/promos/${escapePathSegment(promoId)}`, { method: "DELETE" }).then((response) => {
    if (promosLoaded) promos = promos.filter((item) => item.id !== promoId);
    if (currentRoute === "promo-detail") {
      promosLoaded = false;
      window.history.replaceState(null, "", "#promos");
      navigateAuthenticatedRoute("promos");
    } else {
      promosLoaded = false;
      const page = promos.length === 0 && currentPromosPage > 1
        ? currentPromosPage - 1
        : currentPromosPage;
      loadPromos(page);
    }
    showToast(response.message || "Promo deleted.");
  }).catch((error) => {
    showToast(error.message, true);
  });
}

function togglePromoPublication(promoId, action) {
  if (!isAdmin()) {
    showToast("Only administrators can manage promos.", true);
    return;
  }
  const endpoint = action === "publish" ? "publish" : "unpublish";
  apiRequest(`/api/promos/${escapePathSegment(promoId)}/${endpoint}`, { method: "PATCH" })
    .then((response) => {
      if (!response.data) throw new Error("The API returned an unexpected promo response.");
      if (promosLoaded) {
        promos = promos.map((promo) => promo.id === promoId ? response.data : promo);
      }
      if (currentRoute === "promo-detail" && currentPromoId === promoId) {
        renderPromoDetail(response.data);
      } else {
        renderPromos();
      }
      showToast(response.message || `Promo ${action === "publish" ? "published" : "unpublished"}.`);
    }).catch((error) => {
      showToast(error.message, true);
    });
}

function loadRegistrations() {
  $("#registrations-loading").prop("hidden", false);
  $("#registrations-error, #registrations-empty").prop("hidden", true);
  $("#registrations-grid").empty();

  return apiRequest("/api/event-registrations/my-registrations").then((response) => {
    if (!Array.isArray(response.data)) {
      throw new Error("The API returned an unexpected registrations response.");
    }
    registrations = response.data;
    registrationsLoaded = true;
    const activeRegistrations = registrations.filter((item) => item.status === "registered");
    const $grid = $("#registrations-grid").empty();
    activeRegistrations.forEach((registration) => {
      $grid.append(makeEventCard({
        id: registration.event_id,
        title: registration.title,
        description: "",
        location: registration.location,
        starts_at: registration.starts_at,
        ends_at: registration.ends_at,
      }, registration));
    });
    $("#registrations-loading").prop("hidden", true);
    $("#registrations-empty").prop("hidden", activeRegistrations.length > 0);
    updateDashboardSummary();
  }).catch((error) => {
    $("#registrations-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#registrations-error-message").text(error.message);
    $("#registrations-error").prop("hidden", false);
  });
}

function loadEventDetail(eventId) {
  currentRoute = "event-detail";
  currentEventId = eventId;
  $("#event-detail-content, #event-detail-error").prop("hidden", true);
  $("#event-detail-loading").prop("hidden", false);
  const registrationRequest = registrationsLoaded
    ? Promise.resolve()
    : apiRequest("/api/event-registrations/my-registrations").then((response) => {
      if (!Array.isArray(response.data)) {
        throw new Error("The API returned an unexpected registrations response.");
      }
      registrations = response.data;
      registrationsLoaded = true;
    });

  Promise.all([
    apiRequest(`/api/events/${escapePathSegment(eventId)}`),
    registrationRequest,
  ]).then(([response]) => {
    if (currentEventId !== eventId) return;
    const event = response.data;
    if (!event || !event.id) {
      throw new Error("This event could not be found.");
    }
    if (!isAdmin() && event.published !== true) {
      throw new Error("This event is not available.");
    }
    $("#event-detail-loading").prop("hidden", true);
    renderEventDetail(event);
  }).catch((error) => {
    if (currentEventId !== eventId) return;
    $("#event-detail-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#event-detail-error-message").text(error.message);
    $("#event-detail-error").prop("hidden", false);
  });
}

function renderEventDetail(event) {
  const $content = $("#event-detail-content").empty();
  const imageUrl = safeMediaUrl(event.metadata && event.metadata.image_url);
  if (imageUrl) {
    $("<img>").addClass("event-detail-image").attr({
      src: imageUrl,
      alt: `Image for ${event.title || "this event"}`,
    }).appendTo($content);
  }

  const $body = $("<div>").addClass("event-detail-body").appendTo($content);
  $("<p>").addClass("form-eyebrow").text("COMMUNITY EVENT").appendTo($body);
  $("<h1>").attr("id", "event-detail-title").addClass("font-display event-detail-title")
    .text(event.title || "Community event").appendTo($body);
  const $facts = $("<div>").addClass("event-detail-facts").appendTo($body);
  $("<p>").text(`Date and time: ${eventDateRange(event)}`).appendTo($facts);
  $("<p>").text(`Location: ${event.location || "To be announced"}`).appendTo($facts);
  if (event.location) {
    $("<a>").attr({
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`,
      target: "_blank",
      rel: "noopener noreferrer",
    }).addClass("map-link").text("Open map in a new tab ↗").appendTo($facts);
  }
  $("<div>").addClass("event-detail-description").text(event.description || "More event details will be shared soon.").appendTo($body);
  const $actions = $("<div>").addClass("event-detail-actions").appendTo($body);
  eventActionButton(event.id).appendTo($actions);
  if (isAdmin()) {
    $("<a>").addClass("event-edit-button")
      .attr("href", `#edit-event/${escapePathSegment(event.id)}`)
      .text("Edit event").appendTo($actions);
    $("<button>").attr({
      type: "button",
      "data-delete-event": event.id,
    }).addClass("event-delete-button").text("Delete event").appendTo($actions);
  }
  const $feedback = $("<section>").addClass("feedback-section")
    .attr("aria-labelledby", "event-feedback-title")
    .appendTo($body);
  $("<h2>").attr("id", "event-feedback-title").addClass("font-display feedback-heading")
    .text("Event feedback").appendTo($feedback);
  $("<div>").attr({
    id: "event-feedback-content",
    "aria-live": "polite",
  }).addClass("feedback-content").appendTo($feedback);
  $("#event-detail-content").prop("hidden", false);
  loadEventFeedback(event.id);
}

function renderFeedbackLoading() {
  const $loading = $("<div>").addClass("feedback-loading").attr("role", "status");
  $("<span>").addClass("loading-spinner").attr("aria-hidden", "true").appendTo($loading);
  $loading.append(document.createTextNode("Loading feedback…"));
  $("#event-feedback-content").empty().append($loading);
}

function loadEventFeedback(eventId) {
  renderFeedbackLoading();
  const ownFeedbackRequest = apiRequest("/api/event-feedback/my-feedback");
  const allFeedbackRequest = isAdmin()
    ? apiRequest(`/api/event-feedback/event/${escapePathSegment(eventId)}`)
    : Promise.resolve(null);

  Promise.all([ownFeedbackRequest, allFeedbackRequest]).then(([ownResponse, allResponse]) => {
    if (currentEventId !== eventId) return;
    if (!Array.isArray(ownResponse.data) || (allResponse && !Array.isArray(allResponse.data))) {
      throw new Error("The API returned an unexpected feedback response.");
    }

    const ownFeedback = ownResponse.data.find((item) => item.event_id === eventId) || null;
    const allFeedback = allResponse ? allResponse.data : null;
    renderEventFeedback(eventId, ownFeedback, allFeedback);
  }).catch((error) => {
    if (currentEventId !== eventId) return;
    const $content = $("#event-feedback-content").empty();
    $("<p>").addClass("feedback-error").attr("role", "alert").text(error.message).appendTo($content);
    $("<button>").addClass("secondary-button retry-button")
      .attr("data-retry-feedback", eventId)
      .text("Retry feedback").appendTo($content);
  });
}

function renderEventFeedback(eventId, ownFeedback, allFeedback) {
  const $content = $("#event-feedback-content").empty();
  if (Array.isArray(allFeedback)) {
    const average = allFeedback.length
      ? (allFeedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / allFeedback.length).toFixed(1)
      : null;
    const $summary = $("<div>").addClass("feedback-summary");
    $("<p>").addClass("feedback-average").text(average ? `${average} / 5` : "Not rated yet").appendTo($summary);
    $("<p>").addClass("feedback-total").text(`${allFeedback.length} ${allFeedback.length === 1 ? "response" : "responses"}`).appendTo($summary);
    $content.append($summary);

    if (allFeedback.length) {
      const $list = $("<div>").addClass("feedback-list").attr("aria-label", "Feedback from attendees").appendTo($content);
      allFeedback.forEach((item) => {
        const $entry = $("<article>").addClass("feedback-entry").appendTo($list);
        const $topline = $("<div>").addClass("feedback-entry-topline").appendTo($entry);
        $("<p>").addClass("feedback-author").text(item.full_name || "Community member").appendTo($topline);
        $("<p>").addClass("feedback-rating").attr("aria-label", `${item.rating} out of 5 stars`)
          .text(`${item.rating} / 5`).appendTo($topline);
        $("<p>").addClass("feedback-comment").text(item.comment || "No written comment.").appendTo($entry);
      });
    } else {
      $("<p>").addClass("feedback-empty-note").text("Feedback from attendees will appear here.").appendTo($content);
    }
  }

  $("<h3>").addClass("font-display feedback-form-heading")
    .text(ownFeedback ? "Update your feedback" : "Share your feedback")
    .appendTo($content);
  if (ownFeedback) {
    $("<p>").addClass("feedback-helper").text("You’ve already shared feedback for this event. You can update it below.")
      .appendTo($content);
  } else {
    $("<p>").addClass("feedback-helper").text("Your rating helps the community know what to expect.")
      .appendTo($content);
  }

  const $form = $("<form>").attr({
    id: "event-feedback-form",
    "data-event-id": eventId,
    "data-feedback-id": ownFeedback ? ownFeedback.id : "",
  }).addClass("feedback-form").appendTo($content);

  $("<label>").attr("for", "feedback-rating").addClass("field-label")
    .text("Your rating").appendTo($form);
  const $rating = $("<select>").attr({
    id: "feedback-rating",
    name: "rating",
    required: true,
  }).addClass("form-input feedback-rating-select").appendTo($form);
  $("<option>").val("").text("Choose a rating").appendTo($rating);
  for (let rating = 5; rating >= 1; rating -= 1) {
    $("<option>").val(rating).text(`${rating} ${rating === 1 ? "star" : "stars"}`).appendTo($rating);
  }
  if (ownFeedback) $rating.val(String(ownFeedback.rating));

  $("<label>").attr("for", "feedback-comment").addClass("field-label feedback-comment-label")
    .text("Comment (optional)").appendTo($form);
  $("<textarea>").attr({
    id: "feedback-comment",
    name: "comment",
    rows: 4,
    maxlength: 2000,
    placeholder: "What did you think of the event?",
  }).addClass("form-input feedback-comment-input")
    .val(ownFeedback ? ownFeedback.comment || "" : "")
    .appendTo($form);

  $("<button>").attr("type", "submit").addClass("primary-button feedback-submit")
    .text(ownFeedback ? "Update feedback" : "Submit feedback").appendTo($form);
}

function renderRegistrationsFromCurrentData() {
  if (currentRoute === "events" || currentRoute === "admin-events") renderEvents();
  if (currentRoute === "event-detail") {
    const eventId = window.location.hash.slice("#event/".length);
    loadEventDetail(decodePathSegment(eventId));
  }
  if (currentRoute === "my-registrations") loadRegistrations();
  updateDashboardSummary();
}

function changeRegistration(eventId, action, $button) {
  const isCancel = action === "cancel";
  $button.prop("disabled", true).text(isCancel ? "Canceling…" : "Registering…");
  apiRequest(`/api/event-registrations/${isCancel ? "cancel" : "register"}`, {
    method: "POST",
    body: { event_id: eventId },
  }).then((response) => {
    if (isCancel) {
      registrations = registrations.map((registration) =>
        registration.event_id === eventId
          ? { ...registration, status: "cancelled" }
          : registration
      );
    } else {
      registrations = registrations.filter((registration) => registration.event_id !== eventId);
      registrations.push({
        ...(response.data || {}),
        event_id: eventId,
        status: "registered",
      });
    }
    registrationsLoaded = true;
    showToast(response.message || (isCancel ? "Registration canceled." : "You’re registered for this event."));
    renderRegistrationsFromCurrentData();
  }).catch((error) => {
    $button.prop("disabled", false).text(isCancel ? "Cancel registration" : "Register");
    showToast(error.message, true);
  });
}

function updateDashboardSummary() {
  const publishedEvents = events.filter((event) => isAdmin() || event.published === true);
  const activeRegistrations = registrations.filter((registration) => registration.status === "registered");
  $("#dashboard-event-count").text(eventsLoaded ? publishedEvents.length : "—");
  $("#dashboard-registration-count").text(registrationsLoaded ? activeRegistrations.length : "—");
}

function showAppView(route) {
  if (currentRoute === "promo-detail" && route !== "promo-detail") releasePromoCaptionUrl();
  $("#auth-main").prop("hidden", true);
  $("#app-main, #app-nav").prop("hidden", false);
  $("#header-note").prop("hidden", true);
  $(".app-view").prop("hidden", true);
  currentRoute = route;

  const routeView = route === "admin-events"
    ? "events"
    : route === "announcement-detail"
      ? "announcement-detail"
      : route === "announcement-form"
        ? "announcement-form"
        : route === "promo-detail"
          ? "promo-detail"
          : route === "promo-form"
            ? "promo-form"
        : route;
  $(`#${routeView}-view`).prop("hidden", false);
  $("#admin-nav-link").prop("hidden", !isAdmin());
  $("#create-event-link").prop("hidden", !isAdmin() || !["events", "admin-events"].includes(route));
  $("#create-announcement-link").prop("hidden", !isAdmin() || route !== "announcements");
  $("#create-promo-link").prop("hidden", !isAdmin() || route !== "promos");
  $("#app-nav a").removeClass("active");
  const activeRoute = route === "event-detail"
    ? "events"
    : ["event-form", "admin-events"].includes(route)
      ? "admin-events"
      : ["announcement-detail", "announcement-form"].includes(route)
        ? "announcements"
        : ["promo-detail", "promo-form"].includes(route)
          ? "promos"
      : route;
  $(`#app-nav a[data-route="${activeRoute}"]`).addClass("active");

  if (route === "dashboard") {
    updateDashboardSummary();
    if (!eventsLoaded || !registrationsLoaded) {
      Promise.all([
        apiRequest("/api/events"),
        apiRequest("/api/event-registrations/my-registrations"),
      ]).then(([eventResponse, registrationResponse]) => {
        events = Array.isArray(eventResponse.data) ? eventResponse.data : [];
        registrations = Array.isArray(registrationResponse.data) ? registrationResponse.data : [];
        eventsLoaded = true;
        registrationsLoaded = true;
        updateDashboardSummary();
      }).catch(() => {
        $("#dashboard-event-count, #dashboard-registration-count").text("—");
      });
    }
  } else if (route === "events" || route === "admin-events") {
    loadEvents();
  } else if (route === "announcements") {
    if (announcementsLoaded) renderAnnouncements();
    else loadAnnouncements();
  } else if (route === "promos") {
    if (promosLoaded) renderPromos();
    else loadPromos(currentPromosPage);
  } else if (route === "my-registrations") {
    loadRegistrations();
  }
}

function navigateAuthenticatedRoute(route) {
  const adminOnlyRoute = route === "admin-events"
    || route === "create-event"
    || route.startsWith("edit-event/")
    || route === "create-announcement"
    || route.startsWith("edit-announcement/")
    || route === "create-promo"
    || route.startsWith("edit-promo/");
  if (adminOnlyRoute && !isAdmin()) {
    showToast("That page is available to administrators only.", true);
    route = "events";
    window.history.replaceState(null, "", "#events");
  }

  if (route.startsWith("event/")) {
    showAppView("event-detail");
    loadEventDetail(decodePathSegment(route.slice("event/".length)));
    return;
  }
  if (route.startsWith("announcement/")) {
    showAppView("announcement-detail");
    loadAnnouncementDetail(decodePathSegment(route.slice("announcement/".length)));
    return;
  }
  if (route.startsWith("promo/")) {
    showAppView("promo-detail");
    loadPromoDetail(decodePathSegment(route.slice("promo/".length)));
    return;
  }
  if (route === "create-event") {
    showAppView("event-form");
    loadEventForm();
    return;
  }
  if (route.startsWith("edit-event/")) {
    showAppView("event-form");
    loadEventForm(decodePathSegment(route.slice("edit-event/".length)));
    return;
  }
  if (route === "create-announcement") {
    showAppView("announcement-form");
    loadAnnouncementForm();
    return;
  }
  if (route.startsWith("edit-announcement/")) {
    showAppView("announcement-form");
    loadAnnouncementForm(decodePathSegment(route.slice("edit-announcement/".length)));
    return;
  }
  if (route === "create-promo") {
    showAppView("promo-form");
    loadPromoForm();
    return;
  }
  if (route.startsWith("edit-promo/")) {
    showAppView("promo-form");
    loadPromoForm(decodePathSegment(route.slice("edit-promo/".length)));
    return;
  }
  if (["events", "admin-events", "announcements", "promos", "my-registrations"].includes(route)) {
    showAppView(route);
    return;
  }
  showAppView("dashboard");
}

function renderDashboard() {
  const user = authState.user || {};
  $("#dashboard-name").text(user.full_name || "there");
  $("#dashboard-email").text(user.email || "");
  $("#dashboard-role").text(user.role || "user");
  const currentHash = window.location.hash;
  const route = currentHash.slice(1);
  if (!["events", "admin-events", "announcements", "promos", "my-registrations", "dashboard", "create-event", "create-announcement", "create-promo"].includes(route)
      && !route.startsWith("event/")
      && !route.startsWith("edit-event/")
      && !route.startsWith("announcement/")
      && !route.startsWith("edit-announcement/")
      && !route.startsWith("promo/")
      && !route.startsWith("edit-promo/")) {
    window.history.replaceState(null, "", "#dashboard");
  }
  navigateAuthenticatedRoute(window.location.hash.slice(1));
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
    $("#auth-main").prop("hidden", false);
    $("#app-main, #app-nav").prop("hidden", true);
    $("#header-note").prop("hidden", false);
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
      $("#auth-main").prop("hidden", false);
      $("#app-main, #app-nav").prop("hidden", true);
      $("#header-note").prop("hidden", false);
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

  $("#events-grid").on("click", "[data-event-action]", function () {
    changeRegistration($(this).attr("data-event-id"), $(this).attr("data-event-action"), $(this));
  });
  $("#events-grid").on("click", "[data-delete-event]", function () {
    deleteEvent($(this).attr("data-delete-event"));
  });
  $("#event-detail-content").on("click", "[data-event-action]", function () {
    changeRegistration($(this).attr("data-event-id"), $(this).attr("data-event-action"), $(this));
  });
  $("#event-detail-content").on("click", "[data-delete-event]", function () {
    deleteEvent($(this).attr("data-delete-event"));
  });
  $("#event-detail-content").on("click", "[data-retry-feedback]", function () {
    loadEventFeedback($(this).attr("data-retry-feedback"));
  });
  $("#event-detail-content").on("submit", "#event-feedback-form", function (event) {
    event.preventDefault();
    const $form = $(this);
    const eventId = $form.attr("data-event-id");
    const feedbackId = $form.attr("data-feedback-id");
    const rating = Number($form.find('[name="rating"]').val());
    const comment = $form.find('[name="comment"]').val().trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      showToast("Choose a rating from 1 to 5 stars.", true);
      return;
    }

    const $button = $form.find('button[type="submit"]');
    const buttonLabel = $button.text();
    $button.prop("disabled", true).text(feedbackId ? "Updating…" : "Submitting…");
    apiRequest(feedbackId ? `/api/event-feedback/${escapePathSegment(feedbackId)}` : "/api/event-feedback", {
      method: feedbackId ? "PUT" : "POST",
      body: feedbackId ? { rating, comment } : { event_id: eventId, rating, comment },
    }).then((response) => {
      showToast(response.message || "Your feedback has been saved.");
      loadEventFeedback(eventId);
    }).catch((error) => {
      $button.prop("disabled", false).text(buttonLabel);
      showToast(error.message, true);
    });
  });
  $("#announcements-grid").on("click", "[data-announcement-toggle]", function () {
    toggleAnnouncementPublication(
      $(this).attr("data-announcement-toggle"),
      $(this).attr("data-publish-action")
    );
  });
  $("#announcements-grid").on("click", "[data-delete-announcement]", function () {
    deleteAnnouncement($(this).attr("data-delete-announcement"));
  });
  $("#announcement-detail-content").on("click", "[data-announcement-toggle]", function () {
    toggleAnnouncementPublication(
      $(this).attr("data-announcement-toggle"),
      $(this).attr("data-publish-action")
    );
  });
  $("#announcement-detail-content").on("click", "[data-delete-announcement]", function () {
    deleteAnnouncement($(this).attr("data-delete-announcement"));
  });
  $("#promos-grid, #promo-detail-content").on("click", "[data-promo-toggle]", function () {
    togglePromoPublication(
      $(this).attr("data-promo-toggle"),
      $(this).attr("data-publish-action")
    );
  });
  $("#promos-grid, #promo-detail-content").on("click", "[data-delete-promo]", function () {
    deletePromo($(this).attr("data-delete-promo"));
  });
  $("#promo-form-video").on("change", function () {
    const file = this.files[0];
    const videoError = validatePromoVideo(file);
    if (videoError) {
      this.value = "";
      setPromoVideoPreview("");
      $("#promo-form-error").text(videoError).prop("hidden", false);
      return;
    }

    $("#promo-form-error").prop("hidden", true).text("");
    setPromoVideoPreview(file ? URL.createObjectURL(file) : "");
  });
  $("#promo-form").on("submit", savePromoForm);

  $("#announcement-form-audio").on("change", function () {
    const file = this.files[0];
    const audioError = validateAnnouncementAudio(file);
    if (audioError) {
      this.value = "";
      setAnnouncementAudioPreview("");
      $("#announcement-form-error").text(audioError).prop("hidden", false);
      return;
    }

    $("#announcement-form-error").prop("hidden", true).text("");
    setAnnouncementAudioPreview(file ? URL.createObjectURL(file) : "");
  });
  $("#announcement-form").on("submit", saveAnnouncementForm);

  $("#event-search, #event-location-filter, #event-date-filter").on("input change", () => {
    currentEventsPage = 1;
    renderEvents();
  });
  $("#retry-events").on("click", loadEvents);
  $("#retry-registrations").on("click", loadRegistrations);
  $("#retry-announcements").on("click", loadAnnouncements);
  $("#retry-promos").on("click", () => loadPromos(currentPromosPage));
  $("#event-form-image").on("change", function () {
    const file = this.files[0];
    const imageError = validateEventImage(file);
    if (imageError) {
      this.value = "";
      $("#event-form-error").text(imageError).prop("hidden", false);
      setEventImagePreview(existingEventImageUrl, existingEventImageUrl ? "Current event image" : "");
      return;
    }

    $("#event-form-error").prop("hidden", true).text("");
    setEventImagePreview(file ? URL.createObjectURL(file) : existingEventImageUrl, file ? file.name : "Current event image");
  });
  $("#event-form").on("submit", saveEventForm);
  $("#nav-logout-button").on("click", () => {
    clearSession();
    events = [];
    registrations = [];
    announcements = [];
    promos = [];
    eventsLoaded = false;
    registrationsLoaded = false;
    announcementsLoaded = false;
    promosLoaded = false;
    currentEventId = null;
    currentAnnouncementId = null;
    currentPromoId = null;
    editingEventId = null;
    if (imagePreviewObjectUrl) {
      URL.revokeObjectURL(imagePreviewObjectUrl);
      imagePreviewObjectUrl = null;
    }
    editingAnnouncementId = null;
    setAnnouncementAudioPreview("");
    editingPromoId = null;
    setPromoVideoPreview("");
    releasePromoCaptionUrl();
    $("#auth-main").prop("hidden", false);
    $("#app-main, #app-nav").prop("hidden", true);
    $("#header-note").prop("hidden", false);
    showView("login");
    $("#login-password").val("").trigger("focus");
    showToast("You have been signed out.");
  });

  $(window).on("hashchange", () => {
    if (!authState.token) {
      $("#auth-main").prop("hidden", false);
      $("#app-main, #app-nav").prop("hidden", true);
      $("#header-note").prop("hidden", false);
      showView(window.location.hash === "#signup" ? "signup" : "login");
      return;
    }

    navigateAuthenticatedRoute(window.location.hash.slice(1));
  });

  checkRestoredSession();
});
