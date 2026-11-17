# CivicEvents+ frontend

The frontend is a static HTML, Tailwind CSS, and jQuery application. It connects
to the Express API and currently implements the signup and login milestone.

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

## Authentication notes

Successful login stores the JWT and the user's basic profile in
`sessionStorage`, so closing the browser session clears the session. The
frontend checks a restored token against `/api/users/profile/me` and signs out
when the API rejects it. Signup sends only `full_name`, `email`, and `password`;
roles are assigned by the backend and cannot be selected in the UI.

Tailwind CSS and jQuery are loaded from their public CDNs.
