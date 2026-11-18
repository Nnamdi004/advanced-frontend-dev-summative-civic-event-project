function showAppView(route) {
  if (currentRoute === "promo-detail" && route !== "promo-detail") releasePromoCaptionUrl();
  $("#auth-main").prop("hidden", true);
  $("#app-main, #app-nav").prop("hidden", false);
  $("#header-note").prop("hidden", true);
  $(".app-view").prop("hidden", true);
  currentRoute = route;

  const routeView = ({
    "admin-events": "events",
    "announcement-detail": "announcement-detail",
    "announcement-form": "announcement-form",
    "promo-detail": "promo-detail",
    "promo-form": "promo-form",
    "notification-detail": "notification-detail",
  })[route] || route;
  $(`#${routeView}-view`).prop("hidden", false);
  $("#admin-nav-link").prop("hidden", !isAdmin());
  $("#create-event-link").prop("hidden", !isAdmin() || !["events", "admin-events"].includes(route));
  $("#create-announcement-link").prop("hidden", !isAdmin() || route !== "announcements");
  $("#create-promo-link").prop("hidden", !isAdmin() || route !== "promos");
  $("#app-nav a").removeClass("active");
  const activeRoute = ({
    "event-detail": "events",
    "event-form": "admin-events",
    "admin-events": "admin-events",
    "announcement-detail": "announcements",
    "announcement-form": "announcements",
    "promo-detail": "promos",
    "promo-form": "promos",
    "notification-detail": "notifications",
  })[route] || route;
  $(`#app-nav a[data-route="${activeRoute}"]`).addClass("active");

  if (route === "dashboard") {
    updateDashboardSummary();
    loadNotifications();
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
  } else if (route === "notifications") {
    loadNotifications();
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
  if (route.startsWith("notification/")) {
    showAppView("notification-detail");
    loadNotificationDetail(decodePathSegment(route.slice("notification/".length)));
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
  if (["events", "admin-events", "announcements", "promos", "notifications", "my-registrations"].includes(route)) {
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
  if (!["events", "admin-events", "announcements", "promos", "notifications", "my-registrations", "dashboard", "create-event", "create-announcement", "create-promo"].includes(route)
      && !route.startsWith("event/")
      && !route.startsWith("edit-event/")
      && !route.startsWith("announcement/")
      && !route.startsWith("edit-announcement/")
      && !route.startsWith("promo/")
      && !route.startsWith("edit-promo/")
      && !route.startsWith("notification/")) {
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
  $("#notifications-grid, #notification-detail-content").on("click", "[data-delete-notification]", function () {
    deleteNotification($(this).attr("data-delete-notification"));
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
  $("#retry-notifications").on("click", loadNotifications);
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
    notifications = [];
    eventsLoaded = false;
    registrationsLoaded = false;
    announcementsLoaded = false;
    promosLoaded = false;
    currentEventId = null;
    currentAnnouncementId = null;
    currentPromoId = null;
    currentNotificationId = null;
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
    updateNotificationUnreadCount();
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
