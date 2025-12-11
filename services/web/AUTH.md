# Wonder Web Authentication

Simple cookie-based authentication for the Wonder web interface.

## Setup

### 1. Set Secrets

Use `wrangler secret put` to set the required secrets:

```bash
cd services/web

# Set your username
wrangler secret put AUTH_USERNAME
# Enter: admin (or your preferred username)

# Set your password
wrangler secret put AUTH_PASSWORD
# Enter: <your-secure-password>

# Generate and set a session secret
wrangler secret put SESSION_SECRET
# Enter: $(openssl rand -base64 32)
```

### 2. Local Development

For local development, create a `.dev.vars` file:

```bash
cd services/web
cat > .dev.vars << EOF
AUTH_USERNAME=admin
AUTH_PASSWORD=password
SESSION_SECRET=$(openssl rand -base64 32)
API_KEY=your-api-key-here
EOF
```

**Important:** Add `.dev.vars` to `.gitignore` (already configured in most projects)

## How It Works

### Authentication Flow

1. **Unauthenticated requests** → Redirect to `/auth/login`
2. **Login page** → User enters username/password
3. **Credential verification** → Checks against `AUTH_USERNAME` and `AUTH_PASSWORD`
4. **Session creation** → Sets HTTP-only cookie with HMAC-signed token
5. **Authenticated access** → Cookie validated on every request

### Security Features

- **HTTP-only cookies** - Not accessible via JavaScript
- **Secure flag** - Cookies only sent over HTTPS in production
- **SameSite=Lax** - CSRF protection
- **7-day expiration** - Automatic session timeout
- **HMAC-SHA256 signing** - Token integrity verification

### Routes

- **GET `/auth/login`** - Login page
- **POST `/auth/login`** - Login form submission
- **POST `/auth/logout`** - Logout and clear session

### Files

- [`lib/auth.ts`](src/lib/auth.ts) - Authentication utilities
- [`hooks.server.ts`](src/hooks.server.ts) - Server middleware (auth check + API proxy)
- [`routes/auth/login/`](src/routes/auth/login/) - Login page
- [`routes/auth/logout/`](src/routes/auth/logout/) - Logout endpoint

## API Proxy

The web service proxies all `/api/*` requests to the HTTP service:

- Automatically adds `X-API-Key` header from environment
- Forwards WebSocket upgrades for event streaming
- Works with both service bindings (production) and HTTP_URL (local dev)

## Deployment

```bash
# Deploy with secrets already set
wrangler deploy

# Check deployed secrets
wrangler secret list
```

## Testing Locally

```bash
# Generate SvelteKit types and start dev server
pnpm dev

# Visit http://localhost:5173
# Login with credentials from .dev.vars
```
