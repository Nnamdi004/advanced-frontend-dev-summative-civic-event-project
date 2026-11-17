# CivicEvents+ frontend

The frontend is a static HTML, Tailwind CSS, and jQuery application. It connects
to the Express API and currently implements signup, login, event discovery,
event details, registrations, event feedback, admin event management, audio
announcements, and a user dashboard summary.

## Run locally

1. Start the backend from `backend/` with `npm run dev`. By default it listens
   on `http://localhost:4000`.
2. Serve this directory with a static server, for example:

   ```sh
   python3 -m http.server 5500 --directory frontend
   ```

3. Open `http://localhost:5500`.

The API base URL is configured at the top of `app.js`. Change it if the backend
is running on a different host or port. The backend must allow the frontend's
origin through CORS.

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

Tailwind CSS and jQuery are loaded from their public CDNs.
