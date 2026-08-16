# Auth-Gated App Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('omnilocal');   // use the DB_NAME from /app/backend/.env
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  role: 'owner',            // or 'member' (members need status active + code_version match)
  status: 'active',
  code_version: null,
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

Member access code lives in `db.state` doc `_id: "team_settings"` → `value.access_code` / `value.code_version`.

## Step 2: Test Backend API
```bash
curl -X GET "$API_URL/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
curl -X GET "$API_URL/api/overview" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

Public (no auth): `POST /api/maximizer/spin`, `GET /api/maximizer/games`, `GET /api/`, `POST /api/auth/session`.
Owner-only: `GET /api/team`, `POST /api/team/rotate-code`, `POST /api/team/member/{id}/revoke|restore`,
`POST /api/approvals/{id}/approve|reject`.
Approval-gated for members: `POST /api/content/publish-all`, `POST /api/email/send-welcome`
(member call returns `{"status": "pending_approval", ...}`).

## Step 3: Browser Testing
```python
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "your-app-domain",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://your-app-domain")
```

## Quick Debug
```bash
mongosh --eval "use('omnilocal'); db.users.find().limit(3); db.user_sessions.find().limit(3);"
# Clean test data
mongosh --eval "use('omnilocal'); db.users.deleteMany({email: /test\.user\./}); db.user_sessions.deleteMany({session_token: /test_session/});"
```

## Success Indicators
- `/api/auth/me` returns user data
- Dashboard loads without redirect to login
- Member without valid access code gets 403 `access_code_required` on app APIs
- Revoked member gets 403 `revoked` and sessions are deleted
