const ADMIN_USERS_PER_PAGE = 20;
let adminUsers = [];
let adminUsersPage = 1;
let adminUsersHasNextPage = false;
let currentAdminUserId = null;

function adminUserIsActive(user) {
  return user.is_active === true || user.is_active === 1 || user.is_active === "true";
}

function makeAdminUserActions(user, $container) {
  const isActive = adminUserIsActive(user);
  const $actions = $("<div>").addClass("admin-user-actions").appendTo($container);
  $("<a>").addClass("secondary-button admin-user-view-button")
    .attr("href", `#admin-user/${escapePathSegment(user.id)}`)
    .text("View profile").appendTo($actions);
  $("<button>").attr({
    type: "button",
    "data-user-id": user.id,
    "data-user-action": isActive ? "disable" : "enable",
    "aria-label": `${isActive ? "Disable" : "Enable"} ${user.full_name || "user"}`,
  }).addClass(isActive ? "admin-user-status-button disable-user-button" : "admin-user-status-button")
    .text(isActive ? "Disable access" : "Enable account")
    .appendTo($actions);
}

function makeAdminUserCard(user) {
  const isActive = adminUserIsActive(user);
  const $card = $("<article>").addClass("admin-user-card");
  const $header = $("<div>").addClass("admin-user-card-header").appendTo($card);
  const $identity = $("<div>").appendTo($header);
  $("<h2>").addClass("font-display admin-user-name")
    .text(user.full_name || "Unnamed account").appendTo($identity);
  $("<p>").addClass("admin-user-email").text(user.email || "No email address").appendTo($identity);
  $("<span>").addClass(`status-pill ${isActive ? "registered-pill" : "cancelled-pill"}`)
    .text(isActive ? "Active" : "Inactive").appendTo($header);
  $("<p>").addClass("admin-user-role").text(`Role: ${user.role || "user"}`).appendTo($card);
  makeAdminUserActions(user, $card);
  return $card;
}

function renderAdminUserPagination() {
  const $pagination = $("#admin-users-pagination").empty();
  if (adminUsersPage === 1 && !adminUsersHasNextPage) {
    $pagination.prop("hidden", true);
    return;
  }

  $pagination.prop("hidden", false);
  $("<button>").addClass("page-button").text("← Previous")
    .prop("disabled", adminUsersPage <= 1)
    .on("click", () => loadAdminUsers(adminUsersPage - 1))
    .appendTo($pagination);
  $("<span>").addClass("page-status").text(`Page ${adminUsersPage}`).appendTo($pagination);
  $("<button>").addClass("page-button").text("Next →")
    .prop("disabled", !adminUsersHasNextPage)
    .on("click", () => loadAdminUsers(adminUsersPage + 1))
    .appendTo($pagination);
}

function renderAdminUsers() {
  const $grid = $("#admin-users-grid").empty();
  adminUsers.forEach((user) => $grid.append(makeAdminUserCard(user)));
  $("#admin-users-empty").prop("hidden", adminUsers.length > 0);
  renderAdminUserPagination();
}

function loadAdminUsers(page = 1) {
  if (!isAdmin()) {
    showToast("User management is available to administrators only.", true);
    return;
  }
  $("#admin-users-loading").prop("hidden", false);
  $("#admin-users-error, #admin-users-empty, #admin-users-pagination").prop("hidden", true);
  $("#admin-users-grid").empty();
  adminUsersHasNextPage = false;

  return apiRequest(`/api/users?page=${page}&limit=${ADMIN_USERS_PER_PAGE}`).then((response) => {
    if (!Array.isArray(response.data)) {
      throw new Error("The API returned an unexpected users response.");
    }
    if (response.data.length === 0 && page > 1) {
      return loadAdminUsers(page - 1);
    }
    adminUsers = response.data;
    adminUsersPage = page;
    const nextPageRequest = adminUsers.length === ADMIN_USERS_PER_PAGE
      ? apiRequest(`/api/users?page=${page + 1}&limit=${ADMIN_USERS_PER_PAGE}`)
      : Promise.resolve({ data: [] });
    return nextPageRequest.then((nextResponse) => {
      if (!Array.isArray(nextResponse.data)) {
        throw new Error("The API returned an unexpected users response.");
      }
      adminUsersHasNextPage = nextResponse.data.length > 0;
      $("#admin-users-loading").prop("hidden", true);
      renderAdminUsers();
    });
  }).catch((error) => {
    $("#admin-users-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#admin-users-error-message").text(error.message);
    $("#admin-users-error").prop("hidden", false);
  });
}

function renderAdminUserDetail(user) {
  const isActive = adminUserIsActive(user);
  const $content = $("#admin-user-detail-content").empty();
  const $body = $("<div>").addClass("admin-user-detail-body").appendTo($content);
  $("<p>").addClass("form-eyebrow").text("USER ACCOUNT").appendTo($body);
  $("<div>").addClass(`status-pill ${isActive ? "registered-pill" : "cancelled-pill"}`)
    .text(isActive ? "Active account" : "Inactive account").appendTo($body);
  $("<h1>").attr("id", "admin-user-detail-title").addClass("font-display admin-user-detail-title")
    .text(user.full_name || "Unnamed account").appendTo($body);

  const $details = $("<dl>").addClass("admin-user-details").appendTo($body);
  [
    ["Email", user.email || "Not provided"],
    ["Role", user.role || "user"],
    ["Account status", isActive ? "Active" : "Inactive"],
    ["Joined", user.created_at ? eventDateTime(user.created_at) : "Date unavailable"],
  ].forEach(([label, value]) => {
    const $item = $("<div>").addClass("admin-user-detail-item").appendTo($details);
    $("<dt>").text(label).appendTo($item);
    $("<dd>").text(value).appendTo($item);
  });
  $("<p>").addClass("admin-user-role-note")
    .text("Roles are managed by the backend and can’t be changed from this page.")
    .appendTo($body);
  makeAdminUserActions(user, $("<div>").addClass("admin-user-detail-actions").appendTo($body));
  $content.prop("hidden", false);
}

function loadAdminUserDetail(userId) {
  if (!isAdmin()) {
    showToast("User profiles are available to administrators only.", true);
    return;
  }
  currentAdminUserId = userId;
  $("#admin-user-detail-content, #admin-user-detail-error").prop("hidden", true);
  $("#admin-user-detail-loading").prop("hidden", false);
  apiRequest(`/api/users/${escapePathSegment(userId)}`).then((response) => {
    if (currentAdminUserId !== userId) return;
    const user = response.data;
    if (!user || String(user.id) !== String(userId)) {
      throw new Error("This user profile could not be found.");
    }
    $("#admin-user-detail-loading").prop("hidden", true);
    renderAdminUserDetail(user);
  }).catch((error) => {
    if (currentAdminUserId !== userId) return;
    $("#admin-user-detail-loading").prop("hidden", true);
    if (!authState.token) return;
    $("#admin-user-detail-error-message").text(error.message);
    $("#admin-user-detail-error").prop("hidden", false);
  });
}

function changeAdminUserStatus(userId, action) {
  if (!isAdmin()) {
    showToast("Only administrators can change account status.", true);
    return;
  }
  const user = adminUsers.find((item) => String(item.id) === String(userId));
  if (action === "disable" && !window.confirm(`Disable access for ${user ? user.full_name : "this user"}?`)) {
    return;
  }

  apiRequest(`/api/users/${escapePathSegment(userId)}/${action}`, { method: "PATCH" })
    .then((response) => {
      const updatedUser = response.data;
      if (!updatedUser || String(updatedUser.id) !== String(userId)) {
        throw new Error("The API returned an unexpected user response.");
      }
      adminUsers = adminUsers.map((item) =>
        String(item.id) === String(userId) ? updatedUser : item
      );
      if (currentRoute === "admin-user-detail" && String(currentAdminUserId) === String(userId)) {
        renderAdminUserDetail(updatedUser);
      } else {
        renderAdminUsers();
      }
      showToast(response.message || `User account ${action === "disable" ? "disabled" : "enabled"}.`);
    }).catch((error) => {
      showToast(error.message, true);
    });
}

function loadMyProfile() {
  $("#profile-loading").prop("hidden", false);
  $("#profile-form-error").prop("hidden", true).text("");
  return apiRequest("/api/users/profile/me").then((response) => {
    const user = response.data;
    if (!user) throw new Error("The API returned an incomplete profile.");
    $("#profile-full-name").val(user.full_name || "");
    $("#profile-email").val(user.email || "");
    $("#profile-readonly-role").text(user.role || "Member");
    $("#profile-readonly-status").text(
      user.is_active === false || user.is_active === 0 ? "Inactive" : "Active"
    );
    $("#profile-loading").prop("hidden", true);
  }).catch((error) => {
    $("#profile-loading").prop("hidden", true);
    $("#profile-form-error").text(error.message).prop("hidden", false);
  });
}

function saveMyProfile(event) {
  event.preventDefault();
  const fullName = $("#profile-full-name").val().trim();
  const email = $("#profile-email").val().trim();
  $("#profile-form-error").prop("hidden", true).text("");
  if (!fullName || !email || !$("#profile-email")[0].checkValidity()) {
    $("#profile-form-error").text("Enter your full name and a valid email address.").prop("hidden", false);
    return;
  }

  const $button = $("#profile-form-submit");
  $button.prop("disabled", true);
  $button.find(".event-form-button-label").text("Saving…");
  $button.find(".button-spinner").prop("hidden", false);
  apiRequest("/api/users/profile/me", {
    method: "PATCH",
    body: { full_name: fullName, email },
  }).then((response) => {
    const user = response.data;
    if (!user) throw new Error("The API returned an incomplete profile.");
    authState.user = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: authState.token, user }));
    renderDashboard();
    showToast(response.message || "Profile updated.");
  }).catch((error) => {
    $("#profile-form-error").text(error.message).prop("hidden", false);
  }).finally(() => {
    $button.prop("disabled", false);
    $button.find(".event-form-button-label").text("Save profile");
    $button.find(".button-spinner").prop("hidden", true);
  });
}
