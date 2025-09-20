# DriveMind Project Overview

This document provides a high-level overview of the DriveMind project, its purpose, key technologies, and how to get started. For more detailed information on specific aspects of the project, please refer to the linked documentation.

## Project Description

DriveMind is a comprehensive solution designed to help users manage and analyze their Google Drive content. It provides features for scanning, organizing, and identifying duplicates within Google Drive, aiming to improve data hygiene and efficiency.

## Purpose and Goals

The primary goals of DriveMind are:
- To provide users with insights into their Google Drive usage.
- To help identify and manage duplicate files.
- To offer tools for organizing and cleaning up Drive content.
- To ensure data privacy and security during the scanning and analysis process.

## Key Technologies and Architecture

DriveMind is built using a modern web stack with a focus on scalability and performance. Key technologies include:

-   **Frontend:** React (JavaScript/TypeScript) with Next.js for server-side rendering and routing. Styling is handled with Tailwind CSS, adhering to Material Design principles for UI/UX.
-   **Backend (Firebase Functions):** Node.js with TypeScript for serverless functions that handle Google Drive API interactions, scan orchestration, and data processing.
-   **Database:** Google Cloud Firestore for storing user data, scan job details, and metadata about scanned files.
-   **Authentication:** Firebase Authentication for secure user management.
-   **Google Drive API:** Used for interacting with user's Google Drive accounts to list, read, and manage files.
-   **DataConnect:** A custom GraphQL API (likely running on Google Cloud) for efficient data ingestion and querying of scanned file metadata.

### High-Level Architecture

```mermaid
graph TD
    User[User] -->|Interacts with| Frontend[React/Next.js Frontend]
    Frontend -->|Authenticates via| FirebaseAuth[Firebase Authentication]
    Frontend -->|Triggers/Monitors| FirebaseFunctions[Firebase Functions (Node.js/TypeScript)]
    FirebaseFunctions -->|Accesses/Stores| Firestore[Firestore Database]
    FirebaseFunctions -->|Interacts with| GoogleDriveAPI[Google Drive API]
    FirebaseFunctions -->|Ingests Data via| DataConnect[DataConnect GraphQL API]
    GoogleDriveAPI -->|Provides Data| UserDrive[User's Google Drive]
    DataConnect -->|Stores/Queries| FileMetadata[File Metadata Storage]
```

## How to Get Started (Basic Setup)

To set up the DriveMind project locally, follow these general steps. More detailed instructions for specific components can be found in their respective documentation.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd drivemind
    ```

2.  **Install Dependencies:**
    Install Node.js dependencies for both the frontend and Firebase Functions.
    ```bash
    npm install
    cd functions
    npm install
    cd ..
    ```

3.  **Firebase Project Setup:**
    *   Create a new Firebase project in the Firebase Console.
    *   Enable Firestore and Firebase Authentication.
    *   Configure Google Sign-In as an authentication provider.
    *   Set up Google Drive API credentials and enable the Google Drive API for your project.

4.  **Environment Variables:**
    Create `.env` files based on `.env.example` and `.env.production.example` in the root and `functions/` directories. Populate them with your Firebase project configuration, Google OAuth client IDs/secrets, and any other necessary API keys.

5.  **Run Development Servers:**
    *   **Frontend:**
        ```bash
        npm run dev
        ```
    *   **Firebase Functions (Emulators):**
        ```bash
        firebase emulators:start
        ```

## Further Documentation

-   [Development Status and Known Issues](DEVELOPMENT_STATUS.md)
-   [Testing Guide](TESTING_GUIDE.md)
-   [Architecture Notes](ARCHITECTURE_NOTES.md)
-   [Future Enhancements and Ideas](FUTURE_ENHANCEMENTS.md)
-   [Deployment Guide](DEPLOYMENT_GUIDE.md)
-   Health: `GET /api/health` (readiness), Metrics: `GET /api/metrics` (JSON or `?format=prometheus`)
-   Background Scan API: `POST /api/workflows/background-scan` (requires Firebase ID token), `GET /api/workflows/background-scan` (status)
 -   DataConnect: `dataconnect/schema/schema.gql` and `artifacts/docs/DataConnect.md`

## Feature Flags

- `FEATURE_FILE_OPS_ENABLED` (server): enable write operations in API routes (`/api/files/*`, `/api/folders/create`). Default: `false`.
- `NEXT_PUBLIC_FEATURE_FILE_OPS` (client): show/hide file operation UI (rename/move/delete/restore). Default: `false`.
- `FEATURE_DATACONNECT_ENABLED` (server): publish scan summaries and file index to GraphQL endpoint. Default: `false`.

DataConnect configuration (server):
- `DATACONNECT_URL` (GraphQL endpoint), `DATACONNECT_API_KEY` (optional bearer). See `artifacts/docs/DataConnect.md`.

Keep both off in production until write scopes and flows are fully validated.
