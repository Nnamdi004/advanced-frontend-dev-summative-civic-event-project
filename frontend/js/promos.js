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
    loadNotifications();
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
      loadNotifications();
    }).catch((error) => {
      showToast(error.message, true);
    });
}
