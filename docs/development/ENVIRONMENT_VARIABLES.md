# Environment Variables Specification

All application runtime configuration is validated at startup via Zod in `src/config/env.ts`.

If any mandatory variable is missing or fails validation, the application terminates immediately with a detailed schema error report.

---

## Configuration Reference

| Variable                  | Description                           | Type / Valid Values                                | Default              | Required |
| :------------------------ | :------------------------------------ | :------------------------------------------------- | :------------------- | :------- |
| `NODE_ENV`                | Application runtime environment       | `development`, `test`, `production`                | `development`        | No       |
| `PORT`                    | HTTP server port                      | Integer                                            | `5000`               | No       |
| `API_PREFIX`              | Base URI routing prefix               | String (e.g. `/api/v1`)                            | `/api/v1`            | No       |
| `APP_NAME`                | Identifier for logs                   | String                                             | `School ERP Backend` | No       |
| `DATABASE_URL`            | PostgreSQL connection URL             | Valid URL string                                   | `postgresql://...`   | **Yes**  |
| `JWT_ACCESS_SECRET`       | Secret key for signing access tokens  | String (minimum 32 characters)                     | —                    | **Yes**  |
| `JWT_REFRESH_SECRET`      | Secret key for signing refresh tokens | String (minimum 32 characters)                     | —                    | **Yes**  |
| `JWT_ACCESS_EXPIRATION`   | Access token lifespan                 | Duration string (e.g. `15m`, `1h`)                 | `15m`                | No       |
| `JWT_REFRESH_EXPIRATION`  | Refresh token lifespan                | Duration string (e.g. `7d`, `30d`)                 | `7d`                 | No       |
| `BCRYPT_SALT_ROUNDS`      | Password hash work factor             | Integer (e.g. `12`)                                | `12`                 | No       |
| `CORS_ORIGIN`             | Allowed cross-origin domains          | Comma-separated URLs or `*`                        | `*`                  | No       |
| `RATE_LIMIT_WINDOW_MS`    | Rate limiting window size in ms       | Integer                                            | `900000` (15 mins)   | No       |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per IP in window         | Integer                                            | `100`                | No       |
| `LOG_LEVEL`               | Pino logging threshold                | `fatal`, `error`, `warn`, `info`, `debug`, `trace` | `info`               | No       |
| `REDIS_HOST`              | Redis cache & queue host              | Hostname or IP                                     | `localhost`          | No       |
| `REDIS_PORT`              | Redis port                            | Integer                                            | `6379`               | No       |
| `REDIS_PASSWORD`          | Redis authentication password         | String                                             | `""`                 | No       |

---

## Production Security Notes

- In production environments, never commit a `.env` file to version control.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be distinct, high-entropy 256-bit keys generated via cryptographic utilities (e.g. `openssl rand -base64 32`).
