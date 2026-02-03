# Deploying Pontual

This project is built with Next.js and is optimized for deployment on [Vercel](https://vercel.com).

## 🚀 Deployment Strategy (Multiple Clients)

Since you have **3 clients**, the best secure practice is to deploy **3 separate instances** (one for each client). This ensures:
1.  **Data Isolation:** Client A cannot accidentally access Client B's data.
2.  **Custom Credentials:** Client A gets their own login; Client B gets theirs.
3.  **Separate API Keys:** Each deployment connects to that specific client's unique CrossChex account.

## 🔌 Client Onboarding Flow (How to add Equipment)

This application **reads** data from the CrossChex Cloud. You do not "add equipment" to this app directly. You add it to the CrossChex system, and this app automatically sees it.

### Step 1: Physical Setup (For each Client)
1.  Create a **new** CrossChex Cloud account for the client (e.g., `client.a@gmail.com`).
2.  Connect their W1Pro/Time Clock devices to **their** WiFi.
3.  Add the devices to **their** CrossChex Cloud account.
    *   *Result:* The devices are now sending data to *that specific cloud account*.

### Step 2: Get API Keys
1.  Log in to the Client's CrossChex Cloud.
2.  Go to Settings -> Open API.
3.  Generate a new **API Key** and **Secret**.
    *   *Note:* Keep these safe! These are the keys that link the App to the Equipment.

### Step 3: Deploy the App (Vercel)
1.  Go to your Vercel Dashboard.
2.  Create a new Project (or Deployment) for this client.
3.  Use the **API Key** and **Secret** from Step 2.

---

## 🚀 Deployment Strategy (Step-by-Step)

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
