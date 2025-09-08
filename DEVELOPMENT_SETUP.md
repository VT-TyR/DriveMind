# Development Setup Guide

## 🚀 Quick Start

### Prerequisites
```bash
# Required software
Node.js 18+ 
npm 9+
Git
Firebase CLI
```

### 1-Minute Setup
```bash
# Clone repository
git clone https://github.com/VT-TyR/DriveMind.git
cd DriveMind

# Install dependencies  
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev

# Open in browser
open http://localhost:3000
```

---

## 🛠️ Detailed Development Setup

### Environment Configuration

#### Local Environment Variables (.env.local)
```bash
# Base URL for OAuth redirects
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Firebase Client Configuration (JSON string)
NEXT_PUBLIC_FIREBASE_CONFIG={"projectId":"drivemind-q69b7","apiKey":"...","authDomain":"..."}

# Google OAuth Credentials
GOOGLE_OAUTH_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-your-client-secret

# Firebase Admin (for API routes)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Development flags
NODE_ENV=development
NEXT_TELEMETRY_DISABLED=1
```

#### Getting Firebase Configuration

1. **Firebase Console**: https://console.firebase.google.com/project/drivemind-q69b7/settings/general
2. **Copy config object**: From "Your apps" → Web app → "Firebase SDK snippet" → Config
3. **Format as JSON string**: Single line, escaped quotes

```javascript
// Example format
NEXT_PUBLIC_FIREBASE_CONFIG={"projectId":"drivemind-q69b7","apiKey":"AIza...","authDomain":"drivemind-q69b7.firebaseapp.com","storageBucket":"drivemind-q69b7.appspot.com","messagingSenderId":"123456789","appId":"1:123456789:web:abcdef"}
```

#### Getting OAuth Credentials

1. **Google Cloud Console**: https://console.cloud.google.com/apis/credentials?project=drivemind-q69b7
2. **OAuth 2.0 Client IDs**: Select "DriveMind OAuth Client"
3. **Download JSON** or copy Client ID/Secret
4. **Add localhost redirect URI**:
   - `http://localhost:3000/api/auth/drive/callback`

#### Getting Firebase Admin Key

1. **Firebase Console**: https://console.firebase.google.com/project/drivemind-q69b7/settings/serviceaccounts/adminsdk
2. **Generate new private key**: Download JSON file
3. **Save locally**: `~/Downloads/drivemind-service-account.json`
4. **Set path in .env.local**: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`

### Development Commands

```bash
# Development server (with hot reload)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Production build (test locally)
npm run build
npm run start

# Clean build artifacts
rm -rf .next node_modules/.cache
```

### Firebase CLI Setup
```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
npx firebase login

# Set project
npx firebase use drivemind-q69b7

# Test connection
npx firebase projects:list
```

---

## 🏗️ Project Structure

```
drivemind/
├── src/                           # Source code
│   ├── app/                       # Next.js app router
│   │   ├── api/                   # API routes
│   │   │   ├── auth/drive/        # OAuth endpoints
│   │   │   └── workflows/         # Background scan APIs
│   │   ├── dashboard/             # Dashboard page
│   │   └── layout.tsx             # Root layout
│   ├── components/                # React components
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── shared/                # Shared components
│   │   └── dashboard/             # Dashboard-specific
│   ├── contexts/                  # React contexts
│   │   ├── auth-context.tsx       # Firebase Auth
│   │   └── operating-mode-context.tsx
│   ├── lib/                       # Core utilities
│   │   ├── firebase.ts            # Client Firebase config
│   │   ├── firebase-db.ts         # Database operations
│   │   ├── admin.ts               # Firebase Admin setup
│   │   ├── google-auth.ts         # OAuth client
│   │   ├── google-drive.ts        # Drive API integration
│   │   └── token-store.ts         # Token persistence
│   └── styles/                    # CSS/styling
├── public/                        # Static assets
├── docs/                          # Additional documentation
├── apphosting.yaml               # Firebase App Hosting config
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS config
├── next.config.mjs               # Next.js configuration
└── README files                  # Project documentation
```

---

## 🔧 Development Tools & Configuration

### TypeScript Configuration
```json
// tsconfig.json highlights
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### Next.js Configuration
```javascript
// next.config.mjs highlights
export default {
  typescript: {
    ignoreBuildErrors: false, // Strict type checking
  },
  eslint: {
    ignoreDuringBuilds: false, // Strict linting
  },
  env: {
    // Runtime environment variables
  }
};
```

### Tailwind Configuration
```javascript
// tailwind.config.js highlights
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'body': ['Inter', 'sans-serif'],
        'headline': ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### ESLint Configuration
```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

---

## 🧪 Testing & Quality Assurance

### Manual Testing Checklist
```bash
# 1. Authentication Flow
# - Visit http://localhost:3000
# - Click "Sign in with Google"
# - Complete Firebase Auth flow
# - Verify user state persists on refresh

# 2. OAuth Flow  
# - Click "Connect to Google Drive"
# - Complete Google OAuth consent
# - Verify connection status updates
# - Check token persistence

# 3. API Testing
# Get Firebase token from browser console:
# const token = await firebase.auth().currentUser.getIdToken();

# Test status endpoint
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/auth/drive/status

# Test background scan
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"full_analysis"}' \
  http://localhost:3000/api/workflows/background-scan
```

### Browser Console Testing
```javascript
// Authentication testing
const user = firebase.auth().currentUser;
console.log('User:', user?.email);

const token = await user?.getIdToken();
console.log('Token length:', token?.length);

// API testing
const testAPI = async (endpoint) => {
  const response = await fetch(`/api/${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`${endpoint}:`, response.status, await response.json());
};

await testAPI('auth/drive/status');
await testAPI('workflows/background-scan');
```

### Database Testing
```javascript
// Test Firestore connection (browser console)
const db = firebase.firestore();
const testDoc = await db.collection('test').add({
  message: 'Hello from development',
  timestamp: firebase.firestore.FieldValue.serverTimestamp()
});
console.log('Test document created:', testDoc.id);

// Clean up
await db.collection('test').doc(testDoc.id).delete();
```

---

## 🐛 Common Development Issues

### Issue 1: "Module not found" errors
**Cause**: Path aliases not working or dependency missing
```bash
# Check tsconfig.json paths configuration
# Ensure paths start with "@/*": ["./src/*"]

# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: Firebase Admin errors in development
**Cause**: Missing service account or wrong path
```bash
# Verify service account file exists
ls -la /path/to/service-account.json

# Test Firebase Admin initialization
node -e "
const admin = require('firebase-admin');
const serviceAccount = require('/path/to/service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
console.log('✅ Firebase Admin working');
"
```

### Issue 3: OAuth redirect issues in development
**Cause**: Localhost redirect URI not configured
```bash
# 1. Check Google Cloud Console OAuth settings
# 2. Ensure localhost redirect URI exists:
#    http://localhost:3000/api/auth/drive/callback
# 3. Verify NEXT_PUBLIC_BASE_URL in .env.local
echo $NEXT_PUBLIC_BASE_URL  # Should be http://localhost:3000
```

### Issue 4: Hot reload not working
**Cause**: File watcher limits or conflicts
```bash
# Increase file watchers (Linux/macOS)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Clear Next.js cache
rm -rf .next node_modules/.cache

# Restart development server
npm run dev
```

---

## 🔄 Git Workflow

### Branch Strategy
```bash
# Main branch (production)
main                 # Always deployable

# Development workflow
feature/oauth-fixes  # Feature branches
hotfix/scan-errors   # Critical fixes
```

### Commit Conventions
```bash
# Format: type: description
git commit -m "feat: implement background scan system"
git commit -m "fix: resolve Firebase Admin import issues"
git commit -m "docs: update API documentation"
git commit -m "refactor: simplify OAuth token storage"
```

### Pre-commit Checklist
```bash
# 1. Type check
npm run typecheck

# 2. Lint code
npm run lint

# 3. Test build
npm run build

# 4. Test key functionality
# - Authentication flow
# - OAuth connection
# - Basic API calls
```

---

## 📋 IDE Setup

### VS Code Extensions
```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "firebase.vscode-firebase-explorer",
    "esbenp.prettier-vscode"
  ]
}
```

### VS Code Settings
```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

### Debugging Configuration
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
```

---

## 🚀 Deployment from Development

### Pre-deployment Testing
```bash
# 1. Test production build locally
npm run build
npm run start
open http://localhost:3000

# 2. Test with production-like environment
cp .env.local .env.production.local
# Edit .env.production.local with production URLs
NODE_ENV=production npm run build
NODE_ENV=production npm run start

# 3. Verify all functionality works
# - Authentication
# - OAuth flow  
# - API endpoints
# - Database operations
```

### Deploy to Staging/Production
```bash
# 1. Ensure clean working directory
git status

# 2. Push to main branch (triggers auto-deploy)
git checkout main
git merge feature-branch
git push origin main

# 3. Monitor deployment
npx firebase apphosting:backends:get studio

# 4. Verify deployment
curl -I https://studio--drivemind-q69b7.us-central1.hosted.app/about
```

### Post-deployment Verification
```bash
# Test key endpoints
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/status

# Test OAuth flow manually
# 1. Visit site in browser
# 2. Sign in with Google
# 3. Connect Google Drive
# 4. Try background scan

# Monitor logs
# Firebase Console > Functions > Logs
```

---

**🔄 Last Updated**: September 6, 2025  
**💻 Local Development**: Fully functional with proper environment setup  
**🔧 Key Requirements**: Node.js 18+, Firebase CLI, valid service account  
**🎯 Quick Start**: Clone → `npm install` → configure `.env.local` → `npm run dev`