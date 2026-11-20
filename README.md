# CivicEvents+

CivicEvents+ is a full-stack community events platform for discovering local
events and keeping residents informed about civic activities. It provides a
browser-based frontend and a REST API for event discovery, registrations,
feedback, announcements, promotional videos, notifications, account management,
and role-based dashboards.

The project is organized into two parts:

- `frontend/` — a static HTML, CSS, Tailwind CSS, and jQuery client
- `backend/` — a Node.js, Express, PostgreSQL REST API

The demo walkthrough is available in [`video-demo/`](video-demo/).

## Main Features

### Account access

- Create an account with a full name, email address, and strong password.
- Sign in with an email address and password.
- JWT authentication protects API routes.
- The frontend stores the current JWT and basic profile in `sessionStorage`.
- Users can view and update their profile information.
- New public accounts are assigned the `user` role.

The frontend password guidance and the backend both require at least eight
characters containing uppercase and lowercase letters, a number, and a special
character.

### Event discovery

- Browse published community events.
- Search and filter events by title, location, date, and publication status.
- Open an event detail page to view its description, date, time, location, and
  registration information.
- Register for an event or cancel an existing registration.
- View personal registrations in **My registrations**.
- One account may submit only one feedback entry for each event.
- Submit a 1-to-5 rating and optional comment, or edit existing feedback.

### Administrator event management

- Create, edit, publish, unpublish, and delete events.
- Add an event image (JPEG, PNG, or GIF, up to 2 MB).
- Set an event title, description, location, start date/time, and end date/time.
- View registered attendees and feedback for an event.
- See average ratings and individual feedback comments.

### Announcements

- Browse published audio announcements.
- Play announcements with the browser's native audio controls.
- Administrators can create, edit, publish, unpublish, and delete
  announcements.
- Announcement audio supports MP3, WAV, M4A, and OGG files up to 5 MB.

### Promotional videos

- Browse published community promo videos.
- Open a promo detail page and play the associated video.
- Use WebVTT caption text beginning with `WEBVTT` as selectable captions.
- Plain caption text is displayed as a transcript.
- Administrators can create, edit, publish, unpublish, and delete promos.
- Promo uploads support MP4, MOV, AVI, and MKV files up to 8 MB.

### Notifications

- Browse broadcast notifications and notifications targeted to the signed-in
  user.
- View unread notification totals in the navigation bell.
- Filter the notification inbox and open the linked event, announcement, or
  promo when metadata is available.
- Mark individual notifications as read. Broadcast read state is stored
  separately for each user.
- Administrators can delete notifications.

### Dashboards and user administration

- Regular users see their registration count, feedback count, unread
  notifications, and upcoming published events.
- Administrators see live totals for users, events, registrations, feedback,
  promos, announcements, and notifications.
- Administrators can view monthly user growth.
- Administrators can browse all accounts, open a read-only account profile, and
  enable or disable account access.

## Technology Stack

| Area | Technology |
|------|------------|
| Frontend | HTML, CSS, vanilla JavaScript, jQuery, Tailwind CSS CDN |
| Backend | Node.js 18+, Express 5 |
| Database | PostgreSQL 15+ |
| Authentication | JSON Web Tokens (JWT) and bcrypt |
| File uploads | Multer with local storage in `backend/uploads/` |
| API testing | Postman collection included in `backend/` |

## Prerequisites

Install the following before setup:

- [Node.js 18 or newer](https://nodejs.org/)
- [PostgreSQL 15 or newer](https://www.postgresql.org/download/)
- `psql`, PostgreSQL's command-line client
- A modern browser
- An optional static server for the frontend, such as Python 3

## 1. Clone the Repository

```bash
git clone <repository-url>
cd advanced-frontend-dev-summative-civic-event-project
```

## 2. Create the PostgreSQL Database

Start PostgreSQL and create the database. The SQL and environment examples below
use `civic-events-db`.

Using `psql`:

```bash
psql -U postgres
```

Then run:

```sql
CREATE DATABASE "civic-events-db";
```

Exit `psql` with `\q`.

You may also create the database through pgAdmin. Choose `civic-events-db` as
the database name.

## 3. Apply the Database Migrations

The migration files must be applied in order. Replace the placeholders with
your PostgreSQL credentials.

```bash
cd backend

psql -U postgres -h localhost -p 5432 -d civic-events-db \
  -f migrations/001_create_tables.sql

psql -U postgres -h localhost -p 5432 -d civic-events-db \
  -f migrations/002_user_notification_reads.sql
```

On systems where PostgreSQL prompts for a password, enter the password for the
specified database user.

Migration `001_create_tables.sql` creates the users, events, registrations,
feedback, announcements, promos, and notifications tables. Migration
`002_user_notification_reads.sql` adds per-user read state for broadcast and
targeted notifications.

For an existing database that has already applied migration `001`, run only
migration `002`.

## 4. Configure the Backend Environment

Edit `backend/.env` or create it with these values:

```dotenv
DB_USER=postgres
DB_PASS=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=civic-events-db
JWT_SECRET=replace_with_a_long_random_secret
PORT=4000
```

Environment variable reference:

| Variable | Purpose |
|----------|---------|
| `DB_USER` | PostgreSQL username |
| `DB_PASS` | PostgreSQL password |
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port, normally `5432` |
| `DB_NAME` | Database name |
| `JWT_SECRET` | Secret used to sign and verify JWT access tokens |
| `PORT` | Optional API port; defaults to `4000` |

The backend also contains an optional Nodemailer service with `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`
variables. It is not required for the current setup and is not called by the
main application routes.

## 5. Install Backend Dependencies

From the repository root:

```bash
cd backend
npm install
```

Start the API in development mode:

```bash
npm run dev
```

Or start it once:

```bash
npm start
```

The API will normally be available at `http://localhost:4000`.

Verify it with:

```bash
curl http://localhost:4000/health
```

A working response is:

```json
{"ok":true,"env":"development"}
```

The server should also print `Connected to PostgreSQL`. Uploaded files are
served from `http://localhost:4000/uploads/...`.

## 6. Start the Frontend

The frontend has no package or build step. In a second terminal, serve the
`frontend/` directory from the repository root:

```bash
python3 -m http.server 5500 --directory frontend
```

Open `http://localhost:5500`.

The frontend API base URL is declared near the top of
[`frontend/js/core.js`](frontend/js/core.js):

```javascript
const API_BASE_URL = "http://localhost:4000";
```

Change this value if the backend uses another host or port. The backend enables
CORS globally, so the frontend and API may run on different local ports.
Internet access is needed for the Tailwind CSS, Google Fonts, and jQuery CDNs
used by the page.

## 7. Create Accounts

Open `http://localhost:5500/#signup` and create a normal account. Public signup
always creates a `user`; role and account-status fields cannot be selected in
the frontend.

To make an existing account an administrator, sign up for the account first,
then run:

```sql
UPDATE users
SET role = 'admin', is_active = true
WHERE email = 'admin@example.com';
```

Use the value of the account's actual email address. Afterward, sign in again
or sign out and sign in as that account to receive an administrator JWT.

## API Overview

All protected endpoints require:

```http
Authorization: Bearer <jwt>
```

| Resource | Main endpoints |
|----------|----------------|
| Authentication | `POST /api/auth/signup`, `POST /api/auth/login` |
| Users | `GET/PATCH /api/users/profile/me`, admin user management under `/api/users` |
| Events | `/api/events`, `/api/events/:id`, publish/unpublish routes |
| Registrations | `/api/event-registrations/register`, `/cancel`, `/my-registrations` |
| Feedback | `/api/event-feedback`, `/api/event-feedback/my-feedback` |
| Announcements | `/api/announcements` and admin publish/manage routes |
| Promos | `/api/promos` and admin publish/manage routes |
| Notifications | `/api/notifications` and `/api/notifications/:id/read` |
| Dashboards | `/api/dashboard/me`, `/api/dashboard/admin` |

Check the routes in `backend/src/routes/` and the included Postman collection
for request bodies and complete endpoint details.

## Testing the API with Postman

1. Open Postman.
2. Import [`backend/CivicEvents+ API.postman_collection.json`](backend/CivicEvents+%20API.postman_collection.json).
3. Set the API base URL to `http://localhost:4000`.
4. Call `POST /api/auth/signup` or `POST /api/auth/login`.
5. Copy the returned JWT.
6. Use it as a Bearer token for protected requests.

## Project Structure

```text
.
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── core.js
│       ├── app.js
│       ├── events.js
│       ├── event-details.js
│       ├── announcements.js
│       ├── promos.js
│       ├── notifications.js
│       ├── users.js
│       └── dashboard.js
├── backend/
│   ├── app.js
│   ├── server.js
│   ├── migrations/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── CivicEvents+ API.postman_collection.json
└── video-demo/
```

## Troubleshooting

### PostgreSQL connection error

- Confirm PostgreSQL is running.
- Confirm `DB_USER`, `DB_PASS`, `DB_HOST`, `DB_PORT`, and `DB_NAME` in
  `backend/.env` are correct.
- Confirm the database exists and both migration files have been applied.
- Ensure the PostgreSQL role is allowed to connect from `localhost`.

### Frontend cannot reach the API

- Confirm `npm run dev` is running in `backend/`.
- Confirm the API health route is reachable at
  `http://localhost:4000/health`.
- Confirm `API_BASE_URL` in `frontend/js/core.js` matches the running API.
- Open the browser developer console to inspect network and CORS errors.

### Upload rejected

Check both file type and size:

| Upload | Allowed formats | Maximum size |
|--------|-----------------|--------------|
| Event image | JPG/JPEG, PNG, GIF | 2 MB |
| Audio announcement | MP3, WAV, M4A, OGG | 5 MB |
| Promo video | MP4, MOV, AVI, MKV | 8 MB |

### Administrator controls are missing

The signed-in account must have `role = 'admin'` in PostgreSQL. Sign out and
sign in again after updating the role, as JWT tokens contain the role at login
time.