# Architecture Notes

This document provides a detailed overview of the DriveMind project's architecture, outlining the different components, their responsibilities, and the rationale behind key design decisions. It also includes a discussion of the pros and cons of the chosen technologies and approaches.

## Overall Architecture

DriveMind follows a serverless-first approach, leveraging Google Cloud Platform (GCP) services, particularly Firebase, for its backend infrastructure. The frontend is a modern React application, designed for a responsive and intuitive user experience.

```mermaid
graph TD
    User[User Interface (React/Next.js)]
    User -->|Authentication| FirebaseAuth[Firebase Authentication]
    User -->|API Calls| FirebaseFunctions[Firebase Functions (Node.js)]

    FirebaseFunctions -->|Data Storage| Firestore[Firestore Database]
    FirebaseFunctions -->|External API| GoogleDriveAPI[Google Drive API]
    FirebaseFunctions -->|Data Ingestion/Query| DataConnect[DataConnect GraphQL API]

    GoogleDriveAPI -->|User Files| GoogleDrive[Google Drive (User's Files)]
    DataConnect -->|Metadata Storage| MetadataDB[Metadata Database (e.g., PostgreSQL, BigQuery)]

    subgraph Frontend
        User
    end

    subgraph Backend (Firebase/GCP)
        FirebaseAuth
        FirebaseFunctions
        Firestore
        DataConnect
        MetadataDB
    end

    subgraph External Services
        GoogleDriveAPI
        GoogleDrive
    end

    FirebaseFunctions -.->|Triggers/Events| FirebaseMessaging[Firebase Cloud Messaging (Optional)]
    FirebaseFunctions -.->|Logging/Monitoring| CloudLogging[Google Cloud Logging]
    FirebaseFunctions -.->|Metrics| CloudMonitoring[Google Cloud Monitoring]
```

## Component Breakdown and Responsibilities

### 1. Frontend (React/Next.js)

-   **Technology:** React with Next.js, TypeScript, Tailwind CSS.
-   **Responsibilities:**
    *   User Interface and Experience (UI/UX).
    *   User authentication flow (login, logout).
    *   Displaying scan progress and results.
    *   Initiating scan jobs and handling user interactions.
    *   Data visualization of Drive content analysis.
-   **Design Decisions:**
    *   **Next.js:** Chosen for its capabilities in server-side rendering (SSR) and static site generation (SSG), which can improve initial load performance and SEO (though SEO is less critical for this type of application, SSR can still enhance perceived performance). Its file-system based routing simplifies development.
    *   **React:** A popular and robust library for building interactive user interfaces, offering a large ecosystem and strong community support.
    *   **Tailwind CSS:** A utility-first CSS framework that allows for rapid UI development and highly customizable designs without writing custom CSS.
-   **Pros:** Fast development, good performance, strong community support, scalable UI.
-   **Cons:** Can lead to large bundle sizes if not optimized, requires careful state management for complex interactions.

### 2. Firebase Authentication

-   **Technology:** Firebase Authentication.
-   **Responsibilities:**
    *   User registration and login.
    *   Managing user sessions.
    *   Integrating with Google accounts for Drive access.
-   **Design Decisions:** Chosen for its ease of integration with other Firebase services, robust security features, and support for various authentication providers (Google, email/password, etc.).
-   **Pros:** Fully managed, secure, easy to implement, integrates seamlessly with Google Drive API via OAuth.
-   **Cons:** Vendor lock-in to Firebase ecosystem.

### 3. Firebase Functions (Backend)

-   **Technology:** Node.js with TypeScript.
-   **Responsibilities:**
    *   Orchestrating Google Drive scans.
    *   Interacting with the Google Drive API on behalf of users.
    *   Processing file metadata and sending it to DataConnect.
    *   Managing scan job status and progress in Firestore.
    *   Handling long-running operations (e.g., large Drive scans) with checkpointing and job chaining.
-   **Design Decisions:**
    *   **Serverless Functions:** Chosen for scalability, automatic scaling, and pay-per-execution cost model, which is ideal for event-driven tasks like initiating and processing Drive scans.
    *   **TypeScript:** Provides type safety, which reduces bugs and improves code maintainability, especially in a growing codebase.
-   **Pros:** Scalable, cost-effective, event-driven, integrates well with other Firebase/GCP services.
-   **Cons:** Cold start latencies for infrequent invocations, debugging can be more complex than traditional servers.

### 4. Firestore Database

-   **Technology:** Google Cloud Firestore (NoSQL document database).
-   **Responsibilities:**
    *   Storing user profiles.
    *   Persisting scan job configurations, status, and progress.
    *   Storing scan checkpoints for resuming interrupted jobs.
    *   Managing user-specific secrets (e.g., Google Drive refresh tokens).
-   **Design Decisions:** Chosen for its real-time synchronization capabilities (though not heavily used in the current iteration, it offers future potential), offline support, and seamless integration with Firebase Functions and client-side SDKs. Its flexible schema is suitable for evolving data structures.
-   **Pros:** Scalable, real-time updates, easy to use with Firebase SDKs, good for hierarchical data.
-   **Cons:** NoSQL nature requires careful data modeling to avoid complex queries or denormalization issues. Cost can increase with high read/write operations.

### 5. Google Drive API

-   **Technology:** Google Drive API (v3).
-   **Responsibilities:**
    *   Listing files and folders in a user's Google Drive.
    *   Retrieving file metadata (name, size, mime type, parents, etc.).
    *   Performing file operations (rename, move, delete - future).
-   **Design Decisions:** Direct interaction with the official Google API ensures full functionality and adherence to Google's security and rate-limiting policies.
-   **Pros:** Full control over Drive operations, direct access to user data (with consent).
-   **Cons:** Requires careful handling of OAuth 2.0 tokens, rate limiting, and error handling.

### 6. DataConnect GraphQL API

-   **Technology:** Custom GraphQL API (implementation details pending, but likely Node.js/TypeScript with a database like PostgreSQL or BigQuery).
-   **Responsibilities:**
    *   Ingesting processed file metadata from Firebase Functions.
    *   Providing a standardized GraphQL interface for querying file metadata.
    *   Potentially handling complex data analysis and aggregation.
-   **Design Decisions:** GraphQL provides a flexible and efficient way to query data, allowing clients to request exactly what they need. This can reduce over-fetching and under-fetching of data compared to traditional REST APIs. A separate service allows for specialized indexing and querying of large datasets.
-   **Pros:** Efficient data fetching, strong typing with GraphQL schema, flexible API for clients.
-   **Cons:** Adds complexity with an additional service to manage, requires careful schema design.

## Key Design Decisions and Rationale

-   **Serverless Backend (Firebase Functions):** Chosen for its operational simplicity, automatic scaling, and cost-effectiveness for event-driven workloads. It allows developers to focus on business logic rather than infrastructure management.
-   **Checkpointing for Long-Running Scans:** Implemented to ensure resilience against function timeouts or failures during large Google Drive scans. Checkpoints allow scans to resume from the last known state, preventing data loss and improving user experience.
-   **Job Chaining:** For extremely large Google Drives, job chaining allows breaking down a single scan into multiple smaller, sequential jobs. This helps bypass Firebase Function execution limits and ensures comprehensive scanning.
-   **Separation of Concerns:** The architecture separates frontend, backend logic, and data processing into distinct services (React app, Firebase Functions, DataConnect). This promotes modularity, scalability, and easier maintenance.
-   **TypeScript Everywhere:** Used across both frontend and backend for improved code quality, maintainability, and developer experience through static type checking.

## Future Architectural Enhancements

-   **Real-time Scan Progress:** Leverage Firestore's real-time capabilities to provide live updates of scan progress to the frontend without constant polling.
-   **Advanced Data Analysis:** Expand DataConnect to include more sophisticated data analysis capabilities, such as identifying large files, old files, or files with specific content types.
-   **Optimized Data Storage for Metadata:** Explore more specialized databases (e.g., columnar databases for analytical queries) for the `MetadataDB` if performance becomes a bottleneck with very large datasets.
-   **Containerization for DataConnect:** Consider containerizing the DataConnect service (e.g., with Docker and Kubernetes/Cloud Run) for more control over environment and resource allocation, especially if it grows in complexity.
