# Task #4 — User Management Web Application

---

## Local Development

### 1. Create PostgreSQL database
```sql
CREATE DATABASE task4;
```
The server auto-creates the `users` table and unique index on startup.

### 2. Configure server environment
Create `server/.env`:
```
DATABASE_URL=postgresql://localhost/task4
SESSION_SECRET=any-long-random-string
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password
CLIENT_URL=http://localhost:3000
BASE_URL=http://localhost:5000
PORT=5000
```

> For Gmail: enable 2FA → generate App Password at https://myaccount.google.com/apppasswords

### 3. Start server
```bash
cd server
npm install
node index.js
```

### 4. Start client
```bash
cd client
npm install
npm start
```

---

## Deploy to Render

### Option A: render.yaml (recommended)
1. Push repo to GitHub
2. In Render dashboard: New → Blueprint → connect repo
3. Render reads `render.yaml` automatically
4. Set env vars in Render dashboard (DATABASE_URL is auto-set from the managed DB)

### Option B: Manual
1. **Create PostgreSQL**: Render → New → PostgreSQL (free tier)
   - Copy the "Internal Database URL"
2. **Deploy server**: New → Web Service → connect repo → Root Dir: `server`
   - Build: `npm install`  |  Start: `node index.js`
   - Set env vars:
     - `DATABASE_URL` = Internal DB URL from step 1
     - `SESSION_SECRET` = any random string (32+ chars)
     - `EMAIL_USER` = Gmail address
     - `EMAIL_PASS` = Gmail App Password
     - `CLIENT_URL` = your React static site URL (set after step 3)
     - `BASE_URL` = this server's URL
     - `NODE_ENV` = `production`
3. **Deploy client**: New → Static Site → connect repo → Root Dir: `client`
   - Build: `npm install && npm run build`  |  Publish: `build`
   - Set env var: `REACT_APP_API_URL` = server URL from step 2
4. Go back to server env vars → update `CLIENT_URL` to the static site URL from step 3

---

## Database Unique Index

The server creates this on startup:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email);
```

To verify in psql:
```sql
\d users
-- or
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users';
```

The server catches the `23505` PostgreSQL error code (unique constraint violation) and returns a user-friendly message — no email-existence check in application code.

---

## Key Implementation Notes

- **Auth**: express-session with httpOnly cookies
- **Password**: bcryptjs (cost factor 10)
- **Email**: nodemailer, sent async (registration never blocks on email)
- **Unique index**: `CREATE UNIQUE INDEX` — separate from PRIMARY KEY
- **getUniqIdValue**: function in DashboardPage.js returning `user.id`
- **Block/delete self**: allowed — redirects to login automatically
- **Deleted users**: hard delete (no soft-delete / marking)
- **Unverified users**: can login and manage others; clicking email link → active
