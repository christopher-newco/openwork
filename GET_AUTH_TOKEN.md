# How to Get Your Auth Token

## Visual Guide

1. **Open Den Web in your browser:**
   ```
   https://den-web-production.up.railway.app
   ```

2. **Log in** with your existing account

3. **Open Browser DevTools:**
   - **Chrome/Edge:** Press `F12` or `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
   - **Firefox:** Press `F12` or `Cmd+Option+K` (Mac)
   - **Safari:** Enable Developer Menu first (Preferences → Advanced → Show Develop menu), then `Cmd+Option+I`

4. **Navigate to the right tab:**
   - **Chrome/Edge:** Click the **"Application"** tab at the top
   - **Firefox:** Click the **"Storage"** tab
   - **Safari:** Click the **"Storage"** tab

5. **Find your session token:**
   - In the left sidebar, expand **"Cookies"**
   - Click on `https://den-web-production.up.railway.app`
   - Look for a cookie named: `better-auth.session_token`
   - Copy the **Value** (the long string next to it)

## What the Token Looks Like

The token is a long alphanumeric string, something like:
```
1OyrPpAxGUprVdYM5aeMFNWiK14gXEIp
```

Or it might start with:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Troubleshooting

**Can't find the cookie?**
- Make sure you're logged in
- Refresh the page and check again
- Try logging out and back in

**Cookie expired?**
- Log out and log back in to get a fresh token

**Still stuck?**
- Take a screenshot of your DevTools and I'll help you find it
