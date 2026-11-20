function eventActionButton(eventId) {
  const $button = $("<button>").addClass("registration-button").attr("data-event-action", "");
  $button.attr("data-event-id", eventId);
  if (isRegistered(eventId)) {
    return $button.addClass("cancel-registration").attr("data-event-action", "cancel").text("Cancel registration");
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
  if (isAdmin() && event.published !== true) {
    $("<span>").addClass("status-pill cancelled-pill").text("Unpublished").appendTo($meta);
  }
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
      "data-event-toggle": eventId,
      "data-publish-action": event.published === true ? "unpublish" : "publish",
    }).addClass("announcement-publish-button")
      .text(event.published === true ? "Unpublish" : "Publish")
      .appendTo($actions);
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
  $("#event-form-published").prop("checked", true);
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
    $("#event-form-published").prop("checked", event.published === true);
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
  const published = $("#event-form-published").is(":checked");
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
  formData.append("published", String(published));
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
    loadNotifications();
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

function toggleEventPublication(eventId, action) {
  if (!isAdmin()) {
    showToast("Only administrators can manage events.", true);
    return;
  }
  const endpoint = action === "publish" ? "publish" : "unpublish";
  apiRequest(`/api/events/${escapePathSegment(eventId)}/${endpoint}`, { method: "PATCH" })
    .then((response) => {
      if (!response.data) throw new Error("The API returned an unexpected event response.");
      events = events.map((event) => event.id === eventId ? response.data : event);
      eventsLoaded = true;
      if (currentRoute === "event-detail" && currentEventId === eventId) {
        loadEventDetail(eventId);
      } else {
        renderEvents();
      }
      showToast(response.message || `Event ${action === "publish" ? "published" : "unpublished"}.`);
      loadNotifications();
    }).catch((error) => {
      showToast(error.message, true);
    });
}
