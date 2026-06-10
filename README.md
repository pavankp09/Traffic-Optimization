# Traffic-Optimization
Traffic Simulation

## EC2 / Dev Branch Startup

Use these defaults on the EC2 host when running the `dev` branch:

- Backend: `http://0.0.0.0:8004`
- Frontend: `http://0.0.0.0:8005`

Environment variables:

- `BACKEND_HOST` defaults to `0.0.0.0`
- `BACKEND_PORT` defaults to `8004`
- `FRONTEND_HOST` defaults to `0.0.0.0`
- `FRONTEND_PORT` defaults to `8005`
- `CORS_ORIGINS` can be set to a comma-separated list of allowed frontend origins

Run both services together from the repo root:

```bash
python run.py
```

If you want the frontend only:

```bash
cd frontend && npm run dev -- --host 0.0.0.0 --port 8005 --strictPort
```
