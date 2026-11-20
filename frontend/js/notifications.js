function notificationIsUnread(notification) {
  return notification.read === false || notification.read === 0 || notification.read === "false";
}

function notificationDateTime(dateValue) {
  if (!dateValue) return "Date unavailable";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function notificationMetadata(notification) {
  if (notification.metadata && typeof notification.metadata === "object" && !Array.isArray(notification.metadata)) {
    return notification.metadata;
  }
  if (typeof notification.metadata === "string") {
    try {
      const metadata = JSON.parse(notification.metadata);
      return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

function notificationRelatedResource(notification) {
  const metadata = notificationMetadata(notification);
  if (metadata.event_id) {
    return { href: `#event/${escapePathSegment(metadata.event_id)}`, label: "View related event" };
  }
  if (metadata.announcement_id) {
    return {
      href: `#announcement/${escapePathSegment(metadata.announcement_id)}`,
      label: "View related announcement",
    };
  }
  if (metadata.promo_id) {
    return { href: `#promo/${escapePathSegment(metadata.promo_id)}`, label: "View related promo" };
  }
  return null;
}

let notificationFilter = "all";

function openNotificationDrawer() {
  if (!authState.token) return;
  $("#notification-drawer, #notification-drawer-backdrop").prop("hidden", false);
  $("#notifications-nav-link").attr("aria-expanded", "true");
  $("#notification-drawer-close").trigger("focus");
  renderNotificationDrawer();
  $("#notification-drawer-loading").prop("hidden", false);
  fetchNotifications().then(() => {
    $("#notification-drawer-loading").prop("hidden", true);
    renderNotificationDrawer();
  }).catch((error) => {
    $("#notification-drawer-loading").prop("hidden", true);
    $("#notification-drawer-empty").empty()
      .append($("<strong>").text(error.message))
      .prop("hidden", false);
  });
}

function closeNotificationDrawer() {
  $("#notification-drawer, #notification-drawer-backdrop").prop("hidden", true);
  $("#notifications-nav-link").attr("aria-expanded", "false").trigger("focus");
}

function renderNotificationDrawer() {
  const $list = $("#notification-drawer-list").empty();
  const recentNotifications = notifications.slice(0, 6);
  $("#notification-drawer-empty").prop("hidden", recentNotifications.length > 0);
  if (recentNotifications.length === 0) {
    $("#notification-drawer-empty")
      .empty()
      .append($("<span>").attr("aria-hidden", "true").text("✓"))
      .append($("<strong>").text("You’re all caught up"));
  }
  recentNotifications.forEach((notification) => {
    const unread = notificationIsUnread(notification);
    const $item = $("<a>")
      .addClass(`notification-drawer-item${unread ? " is-unread" : ""}`)
      .attr("href", `#notification/${escapePathSegment(notification.id)}`)
      .appendTo($list);
    $("<strong>").text(notification.title || "Notification").appendTo($item);
    $("<small>").text(notificationDateTime(notification.created_at)).appendTo($item);
    $("<p>").text(notification.message || "Open notification for details.").appendTo($item);
  });
}

function updateNotificationUnreadCount() {
  const unreadCount = notifications.filter(notificationIsUnread).length;
  const $count = $("#notifications-unread-count");
  $count.text(unreadCount > 99 ? "99+" : unreadCount).prop("hidden", unreadCount === 0);
  $("#notifications-nav-link").attr(
    "aria-label",
    unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"
  );
  updateAdminDashboardUnreadCount(unreadCount);
}

function fetchNotifications() {
  return apiRequest("/api/notifications").then((response) => {
    if (!Array.isArray(response.data)) {
      throw new Error("The API returned an unexpected notifications response.");
    }
    notifications = response.data;
    updateNotificationUnreadCount();
    return notifications;
  });
}

function makeNotificationAdminActions(notificationId, $container) {
  $("<button>").attr({
    type: "button",
    "data-delete-notification": notificationId,
  }).addClass("event-delete-button").text("Delete notification").appendTo($container);
}

function makeNotificationCard(notification) {
  const unread = notificationIsUnread(notification);
  const $card = $("<article>").addClass(`notification-card${unread ? " is-unread" : ""}`);
  const $header = $("<div>").addClass("notification-card-header").appendTo($card);
  const $text = $("<div>").appendTo($header);
  $("<p>").addClass("notification-type").text(notification.type || "Community update").appendTo($text);
  $("<h2>").addClass("font-display notification-card-title")
    .text(notification.title || "Notification").appendTo($text);
  if (unread) {
    $("<span>").addClass("notification-unread-label").text("Unread").appendTo($header);
  }
  $("<p>").addClass("notification-card-message")
    .text(notification.message || "Open this notification for details.").appendTo($card);
  $("<p>").addClass("notification-date").text(notificationDateTime(notification.created_at)).appendTo($card);
  const $actions = $("<div>").addClass("notification-card-actions").appendTo($card);
  $("<a>").addClass("secondary-button notification-open-button")
    .attr("href", `#notification/${escapePathSegment(notification.id)}`)
    .text("View details").appendTo($actions);
  if (unread) makeNotificationMarkReadAction(notification.id, $actions);
  if (isAdmin()) makeNotificationAdminActions(notification.id, $actions);
  return $card;
}

function makeNotificationMarkReadAction(notificationId, $container) {
  $("<button>").attr({
    type: "button",
    "data-mark-notification-read": notificationId,
  }).addClass("secondary-button notification-mark-read-button").text("Mark as read").appendTo($container);
}

function renderNotifications() {
  const $grid = $("#notifications-grid").empty();
  const search = $("#notification-search").val().trim().toLowerCase();
  const filteredNotifications = notifications.filter((notification) => {
    const unread = notificationIsUnread(notification);
    const matchesStatus = notificationFilter === "all"
      || (notificationFilter === "unread" ? unread : !unread);
    const searchableText = `${notification.title || ""} ${notification.message || ""} ${notification.type || ""}`
      .toLowerCase();
    return matchesStatus && searchableText.includes(search);
  });
  filteredNotifications.forEach((notification) => $grid.append(makeNotificationCard(notification)));
  $("#notifications-empty").prop("hidden", filteredNotifications.length > 0);
  $("#notifications-empty-title").text(notifications.length === 0 ? "You’re all caught up" : "No notifications found");
  $("#notifications-empty-message").text(
    notifications.length === 0
      ? "New community updates will appear here."
      : "Try another search or filter to find a notification."
  );
}

function loadNotifications() {
  $("#notifications-loading").prop("hidden", false);
  $("#notifications-error, #notifications-empty").prop("hidden", true);
  $("#notifications-grid").empty();
  return fetchNotifications().then(() => {
    $("#notifications-loading").prop("hidden", true);
    renderNotifications();
  }).catch((error) => {
    $("#notifications-loading").prop("hidden", true);
    if (!authState.token) return;
    if (isAdmin()) updateAdminDashboardUnreadCount("Unavailable");
    $("#notifications-error-message").text(error.message);
    $("#notifications-error").prop("hidden", false);
  });
}

function notificationBelongsToCurrentUser(notification) {
  return notification.recipient_id === null
    || (notification.recipient_id !== undefined
      && String(notification.recipient_id) === String(authState.user && authState.user.id));
}

function markNotificationAsRead(notificationId) {
  const notification = notifications.find((item) => String(item.id) === String(notificationId));
  if (!notification || !notificationIsUnread(notification)) return;

  const $button = $(`[data-mark-notification-read="${String(notificationId)}"]`);
  $button.prop("disabled", true).text("Marking…");
  apiRequest(`/api/notifications/${escapePathSegment(notificationId)}/read`, {
    method: "PATCH",
  }).then((response) => {
    if (!response.data || String(response.data.id) !== String(notificationId) || notificationIsUnread(response.data)) {
      throw new Error("The API did not confirm that the notification was marked as read.");
    }
    const index = notifications.findIndex((item) => String(item.id) === String(notificationId));
    if (index !== -1) notifications[index] = response.data;
    updateNotificationUnreadCount();
    renderNotificationDrawer();
    if (currentRoute === "notification-detail" && String(currentNotificationId) === String(notificationId)) {
      renderNotificationDetail(response.data);
    } else {
      renderNotifications();
    }
    showToast(response.message || "Notification marked as read.");
  }).catch((error) => {
    $button.prop("disabled", false).text("Mark as read");
    showToast(error.message, true);
  });
}

function renderNotificationDetail(notification) {
  const $content = $("#notification-detail-content").empty();
  const $body = $("<div>").addClass("notification-detail-body").appendTo($content);
  const $meta = $("<div>").addClass("notification-detail-meta").appendTo($body);
  $("<span>").addClass("notification-type").text(notification.type || "Community update").appendTo($meta);
  if (notificationIsUnread(notification)) {
    $("<span>").addClass("notification-unread-label").text("Unread").appendTo($meta);
  }
  $("<h1>").attr("id", "notification-detail-title").addClass("font-display notification-detail-title")
    .text(notification.title || "Notification").appendTo($body);
  $("<p>").addClass("notification-date").text(notificationDateTime(notification.created_at)).appendTo($body);
  $("<p>").addClass("notification-detail-message")
    .text(notification.message || "There are no additional details.").appendTo($body);

  const relatedResource = notificationRelatedResource(notification);
  if (relatedResource) {
    $("<a>").addClass("primary-button notification-related-link")
      .attr("href", relatedResource.href).text(relatedResource.label).appendTo($body);
  }
  if (notificationIsUnread(notification)) {
    makeNotificationMarkReadAction(notification.id, $("<div>").addClass("notification-detail-actions").appendTo($body));
  }
  if (isAdmin()) {
    makeNotificationAdminActions(notification.id, $("<div>").addClass("notification-detail-actions").appendTo($body));
  }
  $content.prop("hidden", false);
}

function loadNotificationDetail(notificationId) {
  currentNotificationId = notificationId;
  $("#notification-detail-content, #notification-detail-error").prop("hidden", true);
  $("#notification-detail-loading").prop("hidden", false);
  fetchNotifications().then((items) => {
    const listedNotification = items.find((item) => String(item.id) === String(notificationId));
    if (!listedNotification || !notificationBelongsToCurrentUser(listedNotification)) {
      throw new Error("This notification isn’t available for your account.");
    }
    return apiRequest(`/api/notifications/${escapePathSegment(notificationId)}`);
  }).then((response) => {
    if (currentNotificationId !== notificationId) return;
    const notification = response.data;
    if (!notification || String(notification.id) !== String(notificationId)
        || !notificationBelongsToCurrentUser(notification)) {
      throw new Error("This notification isn’t available for your account.");
    }
    $("#notification-detail-loading").prop("hidden", true);
    renderNotificationDetail(notification);
  }).catch((error) => {
    if (currentNotificationId !== notificationId) return;
    $("#notification-detail-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#notification-detail-error-message").text(error.message);
    $("#notification-detail-error").prop("hidden", false);
  });
}

function deleteNotification(notificationId) {
  if (!isAdmin()) {
    showToast("Only administrators can delete notifications.", true);
    return;
  }
  const notification = notifications.find((item) => String(item.id) === String(notificationId));
  const title = notification ? notification.title : "this notification";
  if (!window.confirm(`Delete "${title}"? This action cannot be undone.`)) return;

  apiRequest(`/api/notifications/${escapePathSegment(notificationId)}`, { method: "DELETE" })
    .then((response) => {
      notifications = notifications.filter((item) => String(item.id) !== String(notificationId));
      updateNotificationUnreadCount();
      if (currentRoute === "notification-detail") {
        window.history.replaceState(null, "", "#notifications");
        navigateAuthenticatedRoute("notifications");
      } else {
        renderNotifications();
      }
      showToast(response.message || "Notification deleted.");
    }).catch((error) => {
      showToast(error.message, true);
    });
}
