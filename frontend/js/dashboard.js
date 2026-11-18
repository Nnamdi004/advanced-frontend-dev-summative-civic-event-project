function formatDashboardCount(value) {
  if (value === null || value === undefined || value === "") return "—";
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString() : "—";
}

function updateAdminDashboardUnreadCount(count) {
  $("#admin-stat-unread-notifications").text(
    typeof count === "string" ? count : formatDashboardCount(count)
  );
}

function formatGrowthMonth(month) {
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return month || "Unknown";
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(date);
}

function renderAdminUserGrowth(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("The API returned an unexpected user growth response.");
  }
  const chart = $("#admin-growth-chart").empty();
  const values = rows.map((row) => {
    const count = Number(row.new_users);
    if (!Number.isFinite(count) || count < 0) {
      throw new Error("The API returned invalid user growth data.");
    }
    return { month: row.month, count };
  }).slice(-6);
  const maxCount = Math.max(1, ...values.map((row) => row.count));
  $("#admin-growth-empty").prop("hidden", values.length > 0);

  values.forEach((row) => {
    const height = row.count === 0 ? 4 : Math.max(10, (row.count / maxCount) * 100);
    const monthLabel = formatGrowthMonth(row.month);
    const item = $("<div>").addClass("admin-growth-item").attr({
      role: "listitem",
      "aria-label": `${monthLabel}: ${formatDashboardCount(row.count)} new users`,
    });
    $("<span>").addClass("admin-growth-value").text(formatDashboardCount(row.count)).appendTo(item);
    $("<div>").addClass("admin-growth-track")
      .append($("<span>").addClass("admin-growth-bar").css("height", `${height}%`))
      .appendTo(item);
    $("<span>").addClass("admin-growth-month").text(monthLabel).appendTo(item);
    chart.append(item);
  });
}

function renderAdminDashboard(data) {
  const requiredGroups = ["users", "events", "registrations", "feedbacks", "promos", "announcements", "notifications"];
  if (!data || requiredGroups.some((group) => !data[group])) {
    throw new Error("The API returned incomplete dashboard statistics.");
  }

  $("#admin-stat-users").text(formatDashboardCount(data.users.total_users));
  $("#admin-stat-user-status").text(
    `Active ${formatDashboardCount(data.users.active_users)} · Inactive ${formatDashboardCount(data.users.inactive_users)}`
  );
  $("#admin-stat-events").text(formatDashboardCount(data.events.total_events));
  $("#admin-stat-event-status").text(
    `Upcoming ${formatDashboardCount(data.events.upcoming_events)} · Past ${formatDashboardCount(data.events.past_events)}`
  );
  $("#admin-stat-registrations").text(formatDashboardCount(data.registrations.total_registrations));
  $("#admin-stat-feedback").text(formatDashboardCount(data.feedbacks.total_feedback));
  $("#admin-stat-promos").text(formatDashboardCount(data.promos.total_promos));
  $("#admin-stat-announcements").text(formatDashboardCount(data.announcements.total_announcements));
  $("#admin-stat-notifications").text(formatDashboardCount(data.notifications.total_notifications));
  renderAdminUserGrowth(data.user_growth);
}

function loadAdminDashboard() {
  $("#admin-dashboard-loading").prop("hidden", false);
  $("#admin-dashboard-error, .admin-dashboard-stats, .admin-growth-panel").prop("hidden", true);
  return apiRequest("/api/dashboard/admin").then((response) => {
    renderAdminDashboard(response.data);
    $("#admin-dashboard-loading").prop("hidden", true);
    $(".admin-dashboard-stats, .admin-growth-panel").prop("hidden", false);
  }).catch((error) => {
    $("#admin-dashboard-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#admin-dashboard-error-message").text(error.message);
    $("#admin-dashboard-error").prop("hidden", false);
  });
}
