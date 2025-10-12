# Gmail OAuth Redirect Issue - Fix Summary

## Problem
After successful Gmail authentication, the app was not redirecting to the home screen and showing "Not Found" error.

## Root Cause
There were **two issues**:

### Issue 1: Hash-based Routing Mismatch (FIXED ✅)
- **Backend** was redirecting to: `https://135-235-137-65.nip.io/#/auth/callback`
- **Frontend** uses BrowserRouter (not HashRouter), so it expects: `https://135-235-137-65.nip.io/auth/callback`

**Fix Applied:**
Changed OAuth redirects in `/home/tom/giahub/backend/src/routes/auth.py`:
- Google OAuth callback (line ~119)
- Google OAuth manual fallback (line ~165)
- Microsoft OAuth callback (line ~239)

Changed from:
```python
url=f"{client_url}/#/auth/callback?token={auth_token}&name={user_data['name']}"
```

To:
```python
url=f"{client_url}/auth/callback?token={auth_token}&name={user_data['name']}"
```

### Issue 2: Nginx Routing Problem (NEEDS FIX ⚠️)
- **Nginx** has a location block `/auth/` that proxies to backend (port 4000)
- When browser goes to `/auth/callback`, nginx sends it to backend
- **Backend doesn't have `/auth/callback` route** (it has `/auth/google/callback`)
- This causes "Not Found" error

## Solution

You need to update your nginx configuration. I've created a fixed version at:
`/home/tom/giahub/nginx.conf.fixed`

### Steps to Apply Fix:

1. **Backup current nginx config:**
   ```bash
   sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup
   ```

2. **Copy the fixed config:**
   ```bash
   sudo cp /home/tom/giahub/nginx.conf.fixed /etc/nginx/sites-enabled/default
   ```

3. **Test nginx configuration:**
   ```bash
   sudo nginx -t
   ```

4. **Reload nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

### What Changed in Nginx Config:

**OLD** (Problematic):
```nginx
location /auth/ {
    proxy_pass http://localhost:4000;
    # This catches /auth/callback and sends to backend
}
```

**NEW** (Fixed):
```nginx
# Only proxy specific backend auth endpoints
location ~ ^/auth/(google|microsoft|login|logout|me)(/.*)?$ {
    proxy_pass http://localhost:4000;
}

# Serve frontend files - /auth/callback will be handled by React Router
root /home/tom/giahub/frontend/dist;
location / {
    try_files $uri $uri/ /index.html;
}
```

## Alternative: Development Mode
If you want to keep using the Vite dev server (port 5173), uncomment the alternative config in the fixed nginx.conf file and comment out the production serving lines.

## Verify the Fix

After applying nginx changes:

1. Try logging in with Google OAuth
2. You should be redirected to: `https://135-235-137-65.nip.io/auth/callback?token=...`
3. The React app should process this and redirect to `/dashboard`

## Files Modified

- ✅ `/home/tom/giahub/backend/src/routes/auth.py` (Already updated)
- ⚠️ `/etc/nginx/sites-enabled/default` (You need to update this)
