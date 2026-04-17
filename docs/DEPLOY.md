# Deploying to Azure

Target: **Azure App Service (Linux, Node 20)** with SQLite on the built-in
persistent `/home` volume, and optional Microsoft Entra ID sign-in for
internal staff.

> Trading-company (vendor) accounts stay on email/password forever — they
> don't have Microsoft accounts, and that's intentional.

---

## 1. Register an Entra ID application (for Microsoft sign-in)

In the Azure portal → **Microsoft Entra ID → App registrations → New
registration**:

| Field                | Value                                                                     |
| -------------------- | ------------------------------------------------------------------------- |
| Name                 | Vendor Cost Portal                                                        |
| Supported accounts   | **Accounts in any organizational directory (Multitenant)**                |
| Redirect URI (Web)   | `https://<your-app>.azurewebsites.net/api/auth/microsoft/callback`        |

After creation:

1. Copy **Application (client) ID** → this becomes `AZURE_CLIENT_ID`.
2. **Certificates & secrets → New client secret** → copy the *Value*
   (not the ID) → this becomes `AZURE_CLIENT_SECRET`.
3. **API permissions** → verify these are present (they're added by
   default for new web app registrations; add them if not):
   - `openid`, `profile`, `email` (Microsoft Graph, delegated)
   - `User.Read` (Microsoft Graph, delegated)
4. **Authentication → Implicit grant and hybrid flows**: leave *unchecked*
   (we use authorization-code flow, not implicit).
5. Add a **second Redirect URI** for local dev:
   `http://localhost:3000/api/auth/microsoft/callback`.

---

## 2. Provision Azure resources

```sh
# Log in
az login

# Variables (edit these)
RG=rg-vendor-cost-portal
APP=vendor-cost-portal           # becomes <APP>.azurewebsites.net — must be globally unique
LOCATION=eastus
PLAN=plan-vendor-cost-portal

# Resource group + Linux App Service plan (B1 is the smallest usable tier;
# upgrade to P0v3 or higher if you need more memory or always-on)
az group create -n $RG -l $LOCATION
az appservice plan create -g $RG -n $PLAN --is-linux --sku B1

# Web app running Node 20
az webapp create -g $RG -p $PLAN -n $APP --runtime "NODE:20-lts"

# Persistence: App Service Linux gives you /home (backed by Azure Storage).
# Make sure the setting is on (it is by default on newer plans).
az webapp config set -g $RG -n $APP --generic-configurations '{"linuxFxVersion":"NODE|20-lts"}'
```

---

## 3. Configure Application Settings (env vars)

```sh
az webapp config appsettings set -g $RG -n $APP --settings \
  PORT=8080 \
  DB_PATH=/home/data/portal.db \
  JWT_SECRET="$(openssl rand -hex 64)" \
  JWT_EXPIRY=8h \
  AZURE_CLIENT_ID=<from step 1> \
  AZURE_CLIENT_SECRET=<from step 1> \
  AZURE_AUTHORITY=https://login.microsoftonline.com/organizations \
  OAUTH_REDIRECT_URI=https://$APP.azurewebsites.net/api/auth/microsoft/callback \
  SMTP_HOST=smtp.gmail.com \
  SMTP_PORT=587 \
  SMTP_USER=<gmail user> \
  SMTP_PASS=<gmail app password> \
  FROM_EMAIL=<from address> \
  PD_EMAIL=<reply-to> \
  COMPANY_NAME="Costing Team" \
  EMAIL_TIMEZONE=Asia/Hong_Kong \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  WEBSITE_NODE_DEFAULT_VERSION=~20
```

Notes:
- **`PORT=8080`** — App Service Linux expects apps to listen on 8080.
  Our `server.js` already reads `process.env.PORT`.
- **`DB_PATH=/home/data/portal.db`** — `/home` is persistent across
  restarts and scale-ups. On first boot the server creates the file and
  seeds it. Back it up periodically (see §6).
- **`SCM_DO_BUILD_DURING_DEPLOYMENT=true`** — makes Oryx run
  `npm install` during deploy so `better-sqlite3`'s native binding gets
  rebuilt for the App Service Linux image.

---

## 4. Deploy the code

The simplest path is GitHub Actions. In the Azure portal: **Deployment
Center → GitHub → pick this repo + `main` branch**. Azure generates a
workflow YAML that runs on every push to `main`.

Alternative (one-off zip deploy):

```sh
zip -r deploy.zip . -x "node_modules/*" "data/*" ".git/*" ".env"
az webapp deploy -g $RG -n $APP --src-path deploy.zip --type zip
```

---

## 5. First-run admin bootstrap

On the very first boot, `database.js` seeds the default users
(`admin@company.com / admin123`, etc.). You should immediately:

1. Log in with the seed admin account.
2. Create a real admin row whose email matches **your Microsoft account's
   email address** (this is what Microsoft sign-in will match against).
3. **Before exposing the URL publicly**: change the seed admin password
   or delete the seed row. Same for the default trading-company logins.

> The `users` table is the Microsoft-sign-in allowlist. If an email
> logs in via Microsoft and there's no row for it, they get rejected
> with a "contact an admin" message.

---

## 6. Backup the SQLite file

`/home/data/portal.db` is the entire database. A daily copy to Azure
Blob Storage is enough:

```sh
# One-time: install the azcopy extension in Kudu, or run from a cron
# job in a separate container. A minimal approach is to schedule an
# App Service webjob or a GitHub Action that pulls the file via the
# Kudu API and uploads it to Blob Storage.
```

Rotate backups with a lifecycle policy (keep 30 daily, 12 monthly).

---

## 7. Custom domain + TLS

Azure App Service → **Custom domains → Add custom domain**. Use
App Service Managed Certificate (free) for the TLS cert. After
binding, update `OAUTH_REDIRECT_URI` to the new domain and add that
URL as an additional Redirect URI in the Entra app registration.

---

## Smoke test checklist

After deploy:

- [ ] `https://<app>.azurewebsites.net/` loads the login screen.
- [ ] Password login with a real user row works.
- [ ] "Sign in with Microsoft" button is visible.
- [ ] Microsoft login with a whitelisted email lands you in the app.
- [ ] Microsoft login with a non-whitelisted email shows the "no account
      provisioned" error, not a crash.
- [ ] `GET /api/auth/me` with the issued token returns the user.
- [ ] Navigating around the app does not throw 401s.
- [ ] SQLite file persists across an App Service restart.
