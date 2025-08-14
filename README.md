# DriveMind

DriveMind is an intelligent file management application designed to help you organize and clean up your Google Drive at scale using AI-powered insights and recommendations.

## ✨ Features

- **🗂️ Drive Inventory**: View a comprehensive list of all your files and folders with detailed metadata
- **🔍 Duplicate Detection**: Advanced duplicate file detection using name similarity and size matching
- **🤖 AI-Powered Cleanup**: Get intelligent suggestions for deleting, moving, or archiving files
- **📊 Smart Analytics**: Visual dashboards showing file distribution, storage usage, and trends  
- **🏛️ Vault Candidate Scoring**: AI scoring to identify your most valuable files for organization
- **📈 Real-time Insights**: Live statistics and recommendations based on your actual Drive data
- **🔐 Secure Authentication**: Firebase Auth integration with Google OAuth for Drive access
- **⚙️ Operating Modes**: Switch between privacy-focused Local-Only and feature-rich AI-Assisted modes

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Firebase project with App Hosting enabled
- Google Cloud project with Drive API enabled
- Google OAuth 2.0 credentials

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd drivemind
npm install
```

### 2. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env.local
```

Configure the required environment variables:

```env
# Google OAuth Configuration
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret

# Firebase Config (auto-provided by Firebase Hosting)
NEXT_PUBLIC_FIREBASE_CONFIG={"projectId":"..."}

# Optional: Custom base URL for production
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### 3. Google Cloud Setup

1. **Enable APIs**: In Google Cloud Console, enable:
   - Google Drive API
   - Google Sheets API (if needed)

2. **OAuth Consent Screen**: Configure OAuth consent screen with required scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`

3. **OAuth Credentials**: Create OAuth 2.0 Client ID and add authorized redirect URIs:
   - Development: `http://localhost:3000/ai`
   - Production: `https://your-domain.com/ai`

### 4. Firebase Setup

1. **Create Firebase Project** with these services:
   - Authentication (Google provider enabled)
   - Firestore Database
   - App Hosting

2. **Firestore Security Rules**: The project includes secure rules in `firestore.rules`

3. **Deploy**: Use Firebase CLI or connect to GitHub for continuous deployment

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📖 Usage

### Authentication
1. Click "Sign in with Google" in the sidebar
2. Grant permissions for Google Drive access
3. Your files will be automatically loaded

### Dashboard
- **Overview**: View total files, duplicates, and storage usage
- **File Distribution**: See breakdown by file type
- **AI Recommendations**: Get smart cleanup suggestions
- **Recent Activity**: Track file modifications

### File Management
- **Inventory**: Browse all files with sorting and filtering
- **Duplicate Detection**: Automatic detection of duplicate files
- **AI Scoring**: Score files for archival importance
- **Cleanup Actions**: Get AI suggestions for organizing files

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 15, React 18, TypeScript
- **UI Components**: Radix UI + Tailwind CSS
- **Authentication**: Firebase Auth
- **Database**: Firestore
- **AI/ML**: Google Genkit with Gemini
- **API Integration**: Google Drive API v3
- **Charts**: Recharts

### Project Structure
```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── dashboard/    # Dashboard-specific components  
│   ├── inventory/    # File management components
│   ├── shared/       # Reusable components
│   └── ui/          # Base UI components
├── contexts/         # React contexts (Auth, Operating Mode)
├── hooks/           # Custom React hooks
├── lib/             # Utility libraries
│   ├── firebase.ts   # Firebase configuration
│   ├── google-*.ts   # Google APIs integration
│   ├── duplicate-detection.ts # Duplicate detection logic
│   └── dashboard-service.ts   # Analytics calculations
└── ai/              # AI flows and Genkit integration
    └── flows/       # Individual AI workflow functions
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript compiler

### Key Components

- **Authentication**: `src/contexts/auth-context.tsx`
- **Drive Integration**: `src/lib/google-drive.ts`
- **Duplicate Detection**: `src/lib/duplicate-detection.ts`
- **Dashboard Analytics**: `src/lib/dashboard-service.ts`
- **AI Flows**: `src/ai/flows/` directory

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID | Yes |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret | Yes |
| `NEXT_PUBLIC_FIREBASE_CONFIG` | Firebase config JSON | Yes |
| `NEXT_PUBLIC_BASE_URL` | Production base URL | No |
| `NODE_ENV` | Environment (development/production) | No |

## 🚀 Deployment

### Firebase App Hosting

1. **Connect Repository**: Link GitHub repo to Firebase project
2. **Environment Variables**: Set secrets in Firebase Console
3. **Deploy**: Push to main branch for automatic deployment

### Manual Deployment

```bash
npm run build
firebase deploy --only hosting
```

## 🔒 Security

- **Authentication**: Firebase Auth with Google OAuth
- **API Access**: Scoped Google Drive permissions
- **Data Storage**: Firestore with security rules
- **Environment**: Secure environment variable management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable  
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
- Check the [Issues](../../issues) page
- Review the [Firebase Documentation](https://firebase.google.com/docs)
- Consult the [Google Drive API Documentation](https://developers.google.com/drive/api)

---

Built with ❤️ using Next.js, Firebase, and Google AI
