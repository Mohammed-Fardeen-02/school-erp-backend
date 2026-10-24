# File Storage Integration (`src/integrations/file-storage/`)

Contains adapters for object storage services (e.g., AWS S3, Cloudflare R2, MinIO, or Local Disk).

## Architecture Rule

- Expose a `FileStorageService` interface (e.g. `uploadFile`, `getSignedDownloadUrl`, `deleteFile`).
- Business modules (`documents`, `admissions`, `students`) store metadata and URLs in the database, delegating physical blob storage to this integration adapter.
