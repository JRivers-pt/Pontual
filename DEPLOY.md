# Deploying Pontual

This project is built with Next.js and is optimized for deployment on [Vercel](https://vercel.com).

## 🚀 Deployment Strategy (Multiple Clients)

Since you have **3 clients**, the best secure practice is to deploy **3 separate instances** (one for each client). This ensures:
1.  **Data Isolation:** Client A cannot accidentally access Client B's data.
2.  **Custom Credentials:** Client A gets their own login; Client B gets theirs.
3.  **Separate API Keys:** Each deployment connects to that specific client's CrossChex account.

### Step-by-Step Guide

1.  **Create a Vercel Account** at [vercel.com](https://vercel.com).
2.  **Import your Repository**:
    - Click "Add New Project".
    - Select your GitHub repository (`Pontual`).

3.  **Configure Project for Client 1**:
    - Project Name: `pontual-client-a` (example)
    - **Environment Variables** (Critical!):
        - `NEXT_PUBLIC_CROSSCHEX_API_URL`: `https://api.eu.crosschexcloud.com/` (or applicable region)
        - `CROSSCHEX_API_KEY`: [Client 1 Key]
        - `CROSSCHEX_API_SECRET`: [Client 1 Secret]
        - `ADMIN_EMAIL`: `client1@email.com` (Login Username)
        - `ADMIN_PASSWORD`: [Strong Password] (Login Password)
        - `NEXTAUTH_SECRET`: [Random String] (Generate one: `openssl rand -base64 32`)
    - Click **Deploy**.

4.  **Repeat for Client 2**:
    - Go to Dashboard -> "Add New Project" -> Import the **Same Repository** again.
    - Project Name: `pontual-client-b`
    - Enter **Client 2's** Environment Variables (Different API keys, different Email/Pass).
    - Click **Deploy**.

## ✅ Verification
Once deployed, verify each URL:
- Visit `https://pontual-client-a.vercel.app` -> Log in with Client A's creds -> Check Data.
- Visit `https://pontual-client-b.vercel.app` -> Log in with Client B's creds -> Check Data.

## 🛠 Troubleshooting
- **Build Fails?** Check "Logs" in Vercel. Often it's a missing Environment Variable (validation will fail build).
- **Login Fails?** Check `NEXTAUTH_SECRET` is set and `ADMIN_PASSWORD` allows the login.
