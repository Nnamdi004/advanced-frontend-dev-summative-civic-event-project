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
