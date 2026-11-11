# BookNest

BookNest is a web app with a React frontend and an Express API.

## Run locally

Requirements: Node.js and MongoDB.

```bash
npm install
```

Copy `apps/api/.env.example` to `apps/api/.env`, then start the web app and API:

```bash
npm run dev
```

The API health check is available at `http://localhost:5000/api/v1/health`.
