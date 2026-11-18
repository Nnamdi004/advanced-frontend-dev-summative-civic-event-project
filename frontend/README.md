# CivicEvents+ frontend

The frontend is a static HTML, Tailwind CSS, and jQuery application. It connects
to the Express API and currently implements signup, login, event discovery,
event details, registrations, event feedback, admin event management, audio
announcements, promo videos with captions or transcripts, notifications, and
user and admin dashboards.

## Run locally

1. Start the backend from `backend/` with `npm run dev`. By default it listens
   on `http://localhost:4000`.
2. Serve this directory with a static server, for example:

   ```sh
   python3 -m http.server 5500 --directory frontend
   ```

3. Open `http://localhost:5500`.

The API base URL is configured at the top of `js/core.js`. Change it if the
backend is running on a different host or port. The backend must allow the
frontend's origin through CORS.

Client code is split into classic scripts under `js/`: shared state and API
helpers are in `core.js`, feature logic is in separate files, and `app.js`
contains routing and startup. `index.html` loads them in dependency order; keep
these script tags sequential and do not add `async`.

## Authentication and event notes

Successful login stores the JWT and the user's basic profile in
`sessionStorage`, so closing the browser session clears the session. The
frontend checks a restored token against `/api/users/profile/me` and signs out
when the API rejects it. Signup sends only `full_name`, `email`, and `password`;
roles are assigned by the backend and cannot be selected in the UI.

After login, users can search and filter the published event list, view event
details, register or cancel a registration, and view their active registrations.
The list is paginated in the browser because the current events endpoint
returns the full list. Registration actions use the backend's
`/api/event-registrations/register`, `/cancel`, and `/my-registrations`
endpoints.

On event details, users can add one rating and comment or edit their existing
feedback. Admins can also see the event's feedback list and average rating.
This follows the current API permissions: `GET /api/event-feedback/event/:id`
is admin-only, while users can retrieve their own feedback from
`/api/event-feedback/my-feedback`.

Administrators can create, edit, and delete events. Event images are uploaded
as multipart form data and validated against the API's JPG/PNG/GIF and 2 MB
limits. The current backend creates events as published by default and does not
support changing publication state from its event routes.

Announcements are listed from the API, with unpublished items hidden from
regular users. Admins can upload audio when creating an announcement, update
its title/publication status, publish/unpublish it, and delete it. The current
update endpoint does not persist replacement audio, so the edit form doesn't
offer an upload control. Audio playback uses the browser's native controls.

Promos are paginated from the API, with unpublished items hidden from regular
users. Admins can create, edit, publish/unpublish, and delete promos. Video
uploads are sent as multipart form data and validated against the API's
MP4/MOV/AVI/MKV and 8 MB limits. New promos are published by default. The API
stores caption text rather than generating a caption file: valid WebVTT text
beginning with `WEBVTT` is made available as selectable captions, while plain
text is displayed as a transcript.

The notification inbox loads broadcast and user-targeted notifications, shows
the unread count in the navigation bell, and links notifications to related
events, announcements, or promos when metadata is available. Admins can delete
notifications. The current API has no mark-as-read endpoint, so opening a
notification does not change its unread state; the bell reflects the `read`
value supplied by the backend.

Administrators can view live totals for users, events, registrations, feedback,
promos, announcements, and notifications on the dashboard. The monthly user
growth chart uses the admin dashboard endpoint; its unread total reflects
notifications addressed to the signed-in administrator.

Tailwind CSS and jQuery are loaded from their public CDNs.
