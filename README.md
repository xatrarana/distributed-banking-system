# 🏦 Banking Microservices Backend

A backend architecture practice project for a modern banking system, designed using the **microservices architecture** pattern. This project separates core services like **authentication**, **accounts**, **transactions**, and **token handling** into independent services, coordinated by an **API Gateway**.

---

## 🧱 Architecture Overview

This system is designed using:

* **Microservices Pattern** – Each domain has its own service (Auth, Accounts, Transactions, Tokens).
* **API Gateway** – A centralized entry point that routes requests to appropriate services and handles token verification.
* **Dynamic Service Registry** – Services are registered locally for development and proxied dynamically.

---

## 🧭 Services

```
project-root/
├── Api-Gateway             # Centralized routing and token verification
├── Authentication-Service  # Handles user login/signup & auth
├── Token-Service           # Manages JWT/token generation & verification
├── Account-Service         # Manages bank accounts
├── Transaction-Service     # Handles deposits, transfers, transactions
├── init.sh                 # Optional init/setup script
```

---

## 🔄 API Gateway Functionality

The API Gateway uses dynamic proxying and token verification:

```ts
// Service registry
const serviceRegistry = {
    auth: 'http://localhost:3001',
    accounts: 'http://localhost:3002',
    transactions: 'http://localhost:3003'
}

// Proxy routing
Object.entries(serviceRegistry).forEach(([service, url]) => {
    app.use(`/api/${service}`, proxy(url))
});
```

This allows requests like:

```
POST /api/auth/login
GET  /api/accounts/user/123
POST /api/transactions/send
```

---

## 🛠️ Tech Stack

* **Node.js + Express.js** – For all services and gateway
* **JWT / Token Auth** – Secure authentication between services
* **RESTful APIs** – Standard communication pattern
* **Service Isolation** – Services communicate independently
* **Localhost Registry** – Easy local development setup

---

## 🚀 Getting Started

1. **Clone the repository**

```bash
git clone https://github.com/xatrarana/distributed-banking-system.git
cd distributed-banking-system
```

2. **Install dependencies**

Each service has its own `package.json`. Install for each:

```bash
cd Api-Gateway && npm install
cd Authentication-Service && npm install
cd Token-Service && npm install
cd Account-Service && npm install
cd Transaction-Service && npm install
```

3. **Start the services**

Each service runs on a different port (see registry). Use multiple terminals or tools like `pm2` or `concurrently`.

```bash
# Example for API Gateway
cd Api-Gateway
npm run dev
```

4. **Test API Routes**

* `POST /api/auth/login`
* `GET  /api/accounts/:userId`
* `POST /api/transactions/send`

---

## 🔐 Token Flow

1. User logs in via **Auth Service**
2. **Token Service** generates and returns a JWT
3. API Gateway verifies the JWT before forwarding requests
4. If valid, request is routed to respective service

---

## 📫 Author

**Chhatra Rana**
📧 [mail.chhatrarana@gmail.com](mailto:mail.chhatrarana@gmail.com)
🔗 [GitHub Profile](https://github.com/xatrarana)

---

## 📄 License

This project is licensed under the **MIT License**.

---

### 📝 Notes

> This project is for architecture practice and educational purposes.
> Can be extended with Docker, CI/CD, database integrations (e.g., PostgreSQL), and service discovery tools.
