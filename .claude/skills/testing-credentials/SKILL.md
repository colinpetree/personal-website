---
name: testing-credentials
description: Credentials and login instructions for accessing the admin interface during frontend testing or verification. Invoke this whenever you need to log in to the admin panel — e.g. before running Playwright, testing a UI change, verifying a feature in the browser, or any task where the admin interface at /admin must be reached. Without these credentials, login will fail silently and all admin routes redirect back to /admin/login.
---

# Admin Interface Access

**Login page:** `http://localhost:5175/admin/login` (port may vary — Vite tries 5173, 5174, 5175 in order if others are in use)

**Credentials (Administrator role):**
- Email/username: `admin@example.com`
- Password: `admin`

## Login form notes

- The email field has `id="email"` and `type="text"` (not `type="email"`) — use `#email` as the selector
- The password field has `id="password"`
- Submit button is `button[type="submit"]` with text "Sign in"

## Playwright login snippet

```js
await page.goto('http://localhost:5175/admin/login')
await page.waitForLoadState('networkidle')
await page.fill('#email', 'admin@example.com')
await page.fill('#password', 'admin')
await page.click('button[type="submit"]')
await page.waitForURL('**/admin/**', { timeout: 5000 })
```

If the port is unknown, detect it first:
```js
const ports = [5173, 5174, 5175, 5176]
// try each until one responds
```

## Admin routes available

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard |
| `/admin/blog` | Blog post list |
| `/admin/blog/:id` | Blog post editor (Lexical) |
| `/admin/projects` | Projects list |
| `/admin/config` | Site configuration |
| `/admin/accounts` | Admin account management |