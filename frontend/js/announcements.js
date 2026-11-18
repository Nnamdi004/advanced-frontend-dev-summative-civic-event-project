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
    loadNotifications();
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
      loadNotifications();
    }).catch((error) => {
      showToast(error.message, true);
    });
}
