# Soapbox Customization Layer - Den Web

This den-web app supports dual deployment:
- **OpenWork Cloud** (app.openworklabs.com) - Full branded experience  
- **Soapbox** (admin.soapbox.build) - Simplified Soapbox branding

## How it works

### Thin Edit Layer Pattern

Instead of modifying the core OpenWork auth screen, we use conditional routing:

1. **`app/(den)/_components/soapbox-auth-screen.tsx`** - Isolated Soapbox auth screen
2. **`app/(den)/page.tsx`** - Routes to appropriate component based on environment

### Configuration

Set environment variable to enable Soapbox mode:

```bash
NEXT_PUBLIC_SOAPBOX_MODE=true
```

### Key Differences

| Feature | OpenWork | Soapbox |
|---------|----------|---------|
| Branding | "OpenWork Cloud" | "Soapbox" |
| Hero section | Full branded panel | Simple header |
| Feature cards | Shown | Hidden |
| Default mode | Sign-up | **Sign-in** |
| Marketing content | Yes | No |

### Maintaining the layer

When pulling OpenWork upstream changes:

✅ **Safe**: Changes to `auth-screen.tsx` won't affect Soapbox  
✅ **Safe**: Changes to `auth-panel.tsx` are shared (reused)  
⚠️  **Review**: Changes to `app/(den)/page.tsx` need careful merge  

### Customizing Soapbox

Edit only these files:
- `soapbox-auth-screen.tsx` - Soapbox-specific UI
- Environment variables for deployment config

Do NOT edit:
- `auth-screen.tsx` - Keep in sync with upstream
- `auth-panel.tsx` - Shared component, changes affect both

## Deployment

### Soapbox (admin.soapbox.build)

Railway environment variables:
```bash
NEXT_PUBLIC_SOAPBOX_MODE=true
```

### OpenWork (app.openworklabs.com)

No special env vars needed - defaults to OpenWork mode.

## Files Modified

| File | Change | Why |
|------|--------|-----|
| `soapbox-auth-screen.tsx` | Created | Isolated Soapbox UI |
| `page.tsx` | Modified | Conditional rendering |
| `SOAPBOX_CUSTOMIZATION.md` | Created | Documentation |
