# Soapbox Customization Layer

This landing site supports dual deployment:
- **OpenWork** (openworklabs.com) - Full marketing site
- **Soapbox** (admin.soapbox.build) - Simplified sign-in only

## How it works

### Thin Edit Layer Pattern

Instead of modifying core OpenWork components directly, we use a conditional routing approach:

1. **`components/soapbox-signin.tsx`** - Isolated Soapbox-branded sign-in component
2. **`app/page.tsx`** - Routes to appropriate component based on environment

### Configuration

Set environment variable to enable Soapbox mode:

```bash
NEXT_PUBLIC_SOAPBOX_MODE=true
```

Or deploy to a URL containing "soapbox" (auto-detected).

### Maintaining the layer

When pulling OpenWork upstream changes:

✅ **Safe**: Changes to `components/landing-home.tsx` won't affect Soapbox
✅ **Safe**: Changes to core components are isolated  
⚠️  **Review**: Changes to `app/page.tsx` need careful merge
⚠️  **Review**: Changes to routing/middleware

### Customizing Soapbox

Edit only these files:
- `components/soapbox-signin.tsx` - Sign-in UI
- Environment variables for deployment config

Do NOT edit:
- `components/landing-home.tsx` - Keep in sync with upstream
- Other shared OpenWork components

## Deployment

### Soapbox (admin.soapbox.build)

```bash
NEXT_PUBLIC_SOAPBOX_MODE=true pnpm build
```

### OpenWork (openworklabs.com)

```bash
pnpm build  # No special env vars needed
```

## Key Changes Summary

| Requirement | Solution |
|-------------|----------|
| Remove OpenWork branding | `soapbox-signin.tsx` uses "Soapbox" branding |
| Login only (no marketing) | Simplified component with just auth form |
| Login mode (not sign-up) | Redirects to login URL without `?mode=sign-up` |
| Maintainable | Isolated in separate component |
