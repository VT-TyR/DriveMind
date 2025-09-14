# DriveMind Wireframes

**Version**: 1.0.0  
**Project**: drivemind  
**Standards**: ALPHA-CODENAME v1.4 compliant  
**Generated**: 2025-09-12

## Design Principles

- **Material Design 3**: Modern, accessible, and consistent with Google Drive UX
- **Dark-first**: Dark mode as default with light mode toggle
- **Mobile-first**: Responsive design with touch-friendly interactions
- **Density-optimized**: Maximum information density with minimal wasted space
- **WCAG AA+**: Screen reader support, keyboard navigation, high contrast
- **Performance-optimized**: Core Web Vitals compliance, progressive loading

## Component Library Foundation

### Layout System
```
Grid: 12-column with 16px gutters
Breakpoints: mobile 0px | tablet 768px | desktop 1024px | xl 1440px
Container: max-width 1200px with responsive padding
Sidebar: 280px desktop | overlay mobile | 240px tablet
Header: 64px height with responsive title/actions
```

### Spacing Scale
```
xs: 4px | sm: 8px | md: 12px | lg: 16px | xl: 24px | 2xl: 32px | 3xl: 48px
```

### Typography Scale
```
h1: 32px/40px font-bold | h2: 28px/36px font-semibold | h3: 24px/32px font-semibold
h4: 20px/28px font-medium | h5: 18px/24px font-medium | h6: 16px/20px font-medium
body-lg: 18px/28px | body: 16px/24px | body-sm: 14px/20px | caption: 12px/16px
```

---

## 1. Landing Page Wireframe (`/`)

### Desktop Layout (1200px)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header [64px]                                                   │
│ ┌─ Logo ─┐  Navigation               [Connect Drive] [About]    │
│ │DriveMind│  Features | Pricing | Support    [Dark/Light]      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Hero Section [480px]                                            │
│                                                                 │
│         Organize Your Google Drive with AI                     │
│              Automatically detect duplicates,                  │
│              classify files, and optimize storage              │
│                                                                 │
│           [🔗 Connect Google Drive - Primary CTA]              │
│                  [📊 View Demo - Secondary]                    │
│                                                                 │
│ [Hero Image/Animation: Drive organization visualization]        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Features Grid [600px]                                           │
│                                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│ │🤖 AI      │ │🔍 Scan   │ │📁 Organize│ │🔄 Duplicates│        │
│ │Analysis   │ │Drive     │ │Files     │ │Detection   │        │
│ │          │ │          │ │          │ │            │        │
│ │Smart file │ │Complete  │ │AI-powered│ │Find & merge│        │
│ │classification│inventory│organization│duplicate files│        │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Footer [120px]                                                  │
│ Links: Privacy | Terms | Contact | Status                      │
│ © 2024 DriveMind v1.0.0 | Made with ❤️                        │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (375px)

```
┌───────────────────────────────────────┐
│ Header [56px]                         │
│ [☰] DriveMind        [🌙] [Connect]   │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Hero [360px]                          │
│                                       │
│    Organize Your Google Drive        │
│            with AI                    │
│                                       │
│   Automatically detect duplicates,   │
│   classify files, optimize storage   │
│                                       │
│    [🔗 Connect Google Drive]          │
│         [📊 Demo]                     │
│                                       │
│ [Hero visual - simplified]           │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Features Stack [480px]                │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ 🤖 AI Analysis                      │ │
│ │ Smart file classification           │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Drive Scanning                   │ │
│ │ Complete inventory analysis         │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ [Additional features...]              │
└───────────────────────────────────────┘
```

### States

**Loading State**:
```
┌─────────────────────────────────────────┐
│ [■■■ Skeleton header loading ■■■■]      │
│                                         │
│ [■■■■■ Hero content skeleton ■■■■■■]     │
│                                         │
│ [■■■ ■■■ ■■■ Feature cards skeleton]     │
└─────────────────────────────────────────┘
```

---

## 2. Dashboard Wireframe (`/dashboard`)

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header [64px]                                                   │
│ [☰] DriveMind      Dashboard              [🔔] [👤] [⚙️]      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Main Content                                                    │
│ ┌─────────────────┬─────────────────────────────────────────────┐ │
│ │ Sidebar [280px] │ Dashboard Content                           │ │
│ │                 │                                             │ │
│ │ 📊 Dashboard    │ ┌─────────────────────────────────────────┐ │ │
│ │ 📁 Inventory    │ │ Stats Cards [120px]                     │ │ │
│ │ 🔄 Duplicates   │ │                                         │ │ │
│ │ 🤖 AI Analysis  │ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │ │ │
│ │ 📋 Organize     │ │ │15.2GB│ │2,847 │ │342   │ │98%   │   │ │ │
│ │ ⚙️ Rules        │ │ │Storage│ │Files │ │Dupes │ │Health│   │ │ │
│ │                 │ │ │Used  │ │      │ │Found │ │Score │   │ │ │
│ │ [AI Toggle]     │ │ └──────┘ └──────┘ └──────┘ └──────┘   │ │ │
│ │ ● AI Enabled    │ │                                         │ │ │
│ │                 │ └─────────────────────────────────────────┘ │ │
│ │ ─────────────   │                                             │ │
│ │ 🏥 Health       │ ┌─────────────────────────────────────────┐ │ │
│ │ ℹ️ About        │ │ Recent Activity [240px]                 │ │ │
│ │                 │ │                                         │ │ │
│ │                 │ │ • Drive scan completed (2 min ago)      │ │ │
│ │                 │ │ • 15 duplicates found in /Photos       │ │ │
│ │                 │ │ • AI classified 234 documents          │ │ │
│ │                 │ │ • Organization rule applied             │ │ │
│ │                 │ │                                         │ │ │
│ │                 │ │ [View All Activity →]                   │ │ │
│ │                 │ └─────────────────────────────────────────┘ │ │
│ │                 │                                             │ │
│ │                 │ ┌─────────────────────────────────────────┐ │ │
│ │                 │ │ Quick Actions [160px]                   │ │ │
│ │                 │ │                                         │ │ │
│ │                 │ │ [🔍 Start Full Scan] [🔄 Find Duplicates]│ │ │
│ │                 │ │                                         │ │ │
│ │                 │ │ [🤖 AI Analysis]    [📋 Auto-Organize] │ │ │
│ │                 │ │                                         │ │ │
│ │                 │ └─────────────────────────────────────────┘ │ │
│ └─────────────────┴─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌───────────────────────────────────────┐
│ Header [56px]                         │
│ [☰] Dashboard        [🔔] [👤]       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Stats Grid [200px]                    │
│                                       │
│ ┌─────────────┐ ┌─────────────────────┐ │
│ │ 15.2GB      │ │ 2,847 Files        │ │
│ │ Storage     │ │                    │ │
│ └─────────────┘ └───────────────────────┘ │
│                                       │
│ ┌─────────────┐ ┌─────────────────────┐ │
│ │ 342 Dupes   │ │ 98% Health         │ │
│ │             │ │                    │ │
│ └─────────────┘ └───────────────────────┘ │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Quick Actions [120px]                 │
│                                       │
│ [🔍 Full Scan]  [🔄 Duplicates]      │
│                                       │
│ [🤖 AI Analysis] [📋 Organize]        │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Activity Feed [280px]                 │
│                                       │
│ Recent Activity                       │
│ • Drive scan completed                │
│ • 15 duplicates found                 │
│ • AI classified documents             │
│                                       │
│ [View All →]                          │
└───────────────────────────────────────┘
```

### States

**Loading State**:
```
┌─────────────────────────────────────┐
│ [■■■■ Stats loading ■■■■]            │
│ [■■ ■■ ■■ ■■] Skeleton cards        │
│                                     │
│ [■■■■■ Activity feed ■■■■■]          │
│ [■ Loading recent activity...]      │
└─────────────────────────────────────┘
```

**Empty State**:
```
┌─────────────────────────────────────┐
│         Welcome to DriveMind        │
│                                     │
│    🔍 Your drive hasn't been        │
│       scanned yet.                  │
│                                     │
│    [🚀 Start Your First Scan]       │
│                                     │
│  This will analyze your files and   │
│  provide insights and organization  │
│           opportunities             │
└─────────────────────────────────────┘
```

---

## 3. Authentication Screens

### OAuth Connection Screen

```
┌─────────────────────────────────────────────────────────────────┐
│ Header [64px]                                                   │
│ DriveMind                                          [About]      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Connection Flow [400px]                                         │
│                                                                 │
│                   🔗 Connect Google Drive                      │
│                                                                 │
│               Grant DriveMind access to your                   │
│              Google Drive to get started                       │
│                                                                 │
│   [🔒 Secure OAuth 2.0] [🔐 Read-only access] [🛡️ Encrypted]   │
│                                                                 │
│               [🔗 Connect Google Drive]                         │
│                                                                 │
│              What permissions do we need?                      │
│              • View and manage your Drive files               │
│              • Organize and analyze your content              │
│              • No file content is stored on our servers       │
│                                                                 │
│                   [Privacy Policy] [Terms]                    │
└─────────────────────────────────────────────────────────────────┘
```

### OAuth Processing Screen

```
┌─────────────────────────────────────────────────────────────────┐
│                    🔄 Connecting to Google Drive                │
│                                                                 │
│                      [■■■■■■■■■■] 100%                         │
│                                                                 │
│                   ✓ Authentication successful                  │
│                   🔄 Setting up your account...                │
│                                                                 │
│                   This may take a few moments                  │
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Error Screen

```
┌─────────────────────────────────────────────────────────────────┐
│                    ❌ Connection Failed                         │
│                                                                 │
│              We couldn't connect to your Google Drive          │
│                                                                 │
│  Common issues:                                                │
│  • Permission was denied during OAuth                         │
│  • Browser blocked the connection                             │
│  • Temporary Google service issue                             │
│                                                                 │
│                     [🔄 Try Again]                             │
│                   [🛟 Contact Support]                         │
│                                                                 │
│                 Error: oauth_callback_failed                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. File Inventory Screen (`/inventory`)

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header + Sidebar (same as dashboard)                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Inventory Content                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Toolbar [60px]                                              │ │
│ │                                                             │ │
│ │ [🔍 Start Scan] [🔄 Refresh]    [🔍 Search...] [⚙️ Filters]  │ │
│ │                                                             │ │
│ │ 2,847 files • Last scan: 2 hours ago • 15.2 GB             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Filters Row [40px] - Collapsible                            │ │
│ │                                                             │ │
│ │ Type: [All ▼] Size: [Any ▼] Modified: [Anytime ▼]          │ │
│ │ [📁 Folders] [📄 Documents] [🖼️ Images] [🎵 Audio] [Clear] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ File Table [Auto height with virtual scrolling]            │ │
│ │                                                             │ │
│ │ [☑️] Name ▲               Type    Size     Modified   Path    │ │
│ │ ├─────────────────────────────────────────────────────────┤ │ │
│ │ [☐] 📄 Budget_2024.xlsx   Excel   2.1MB   2h ago    /Finance │ │
│ │ [☐] 🖼️ IMG_001.jpg        JPEG   5.2MB   1d ago    /Photos  │ │
│ │ [☐] 📁 Documents/         Folder  -       3d ago    /        │ │
│ │ [☐] 🎵 Song.mp3           MP3    3.8MB   1w ago    /Music   │ │
│ │ [☐] 📄 Resume.pdf [🤖]    PDF    245KB   2w ago    /Docs    │ │
│ │     └─ AI: Document, Professional, High Priority           │ │
│ │                                                             │ │
│ │ [Load more...] 50 of 2,847 shown                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Selection Actions [48px] - Shown when files selected       │ │
│ │                                                             │ │
│ │ 5 files selected  [🗑️ Delete] [📁 Move] [🏷️ Tag] [🤖 Analyze] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌───────────────────────────────────────┐
│ Header [56px]                         │
│ [☰] Inventory        [🔍] [⚙️]       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Status Bar [40px]                     │
│ 2,847 files • 15.2 GB • 2h ago       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Actions [48px]                        │
│ [🔍 Scan] [🔄 Refresh] [Filters ▼]   │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ File List [Auto height]               │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ 📄 Budget_2024.xlsx                 │ │
│ │ Excel • 2.1MB • 2h ago             │ │
│ │ /Finance/                          │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ 🖼️ IMG_001.jpg           [Preview] │ │
│ │ JPEG • 5.2MB • 1d ago              │ │
│ │ /Photos/                           │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ 📄 Resume.pdf             🤖        │ │
│ │ PDF • 245KB • 2w ago               │ │
│ │ AI: Document, Professional         │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ [Load more files...]                  │
└───────────────────────────────────────┘
```

### States

**Loading State (Initial Scan)**:
```
┌─────────────────────────────────────────┐
│         🔍 Scanning Your Drive          │
│                                         │
│     [■■■■■■■■□□] 80% complete            │
│                                         │
│  Scanning /Documents/Projects/...       │
│  Found: 2,156 files • 12.4 GB          │
│                                         │
│         [⏸️ Pause] [❌ Cancel]           │
│                                         │
│  Estimated time remaining: 2 minutes    │
└─────────────────────────────────────────┘
```

**Empty State**:
```
┌─────────────────────────────────────────┐
│            📂 No Files Found            │
│                                         │
│    Your Google Drive appears empty      │
│         or hasn't been scanned          │
│                                         │
│         [🔍 Start First Scan]           │
│                                         │
│    This will analyze your entire        │
│    Google Drive and build an inventory  │
└─────────────────────────────────────────┘
```

**Error State**:
```
┌─────────────────────────────────────────┐
│         ❌ Scan Failed                   │
│                                         │
│  We couldn't complete the drive scan    │
│                                         │
│  Error: Google Drive API rate limit     │
│  exceeded. Please try again in 1 hour.  │
│                                         │
│         [🔄 Retry Now]                  │
│       [📧 Contact Support]              │
└─────────────────────────────────────────┘
```

---

## 5. Duplicate Detection Screen (`/duplicates`)

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header + Sidebar (same as dashboard)                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Duplicates Content                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Header [80px]                                               │ │
│ │                                                             │ │
│ │ Duplicate Files                        [🔍 Find Duplicates] │ │
│ │                                                             │ │
│ │ Similarity: [●────────○] 85%          Algorithm: [Combined ▼] │ │
│ │ Found 342 duplicates in 156 groups • Could save 8.7 GB     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Duplicate Groups [Auto height]                              │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Group 1 • 100% Match • 3 files • 15.6 MB               │ │ │
│ │ │                                                         │ │ │
│ │ │ [☐] 🖼️ IMG_2024_001.jpg      /Photos/2024/            │ │ │
│ │ │     5.2MB • Feb 15, 2024                               │ │ │
│ │ │     [Preview thumbnail]                                 │ │ │
│ │ │                                                         │ │ │
│ │ │ [☐] 🖼️ Copy of IMG_2024_001.jpg /Photos/Backup/        │ │ │
│ │ │     5.2MB • Feb 15, 2024                               │ │ │
│ │ │     [Preview thumbnail]                                 │ │ │
│ │ │                                                         │ │ │
│ │ │ [☑️] 🖼️ IMG_2024_001 (1).jpg    /Downloads/            │ │ │
│ │ │     5.2MB • Feb 15, 2024 🤖 Keep this one             │ │ │
│ │ │     [Preview thumbnail]                                 │ │ │
│ │ │                                                         │ │ │
│ │ │ [🗑️ Delete Selected] [📁 Move] [🏷️ Mark Original]       │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Group 2 • 92% Match • 2 files • 4.8 MB                │ │ │
│ │ │                                                         │ │ │
│ │ │ [☐] 📄 Document.pdf           /Work/                   │ │ │
│ │ │     2.4MB • Modified: Jan 10                           │ │ │
│ │ │                                                         │ │ │
│ │ │ [☐] 📄 Document_v2.pdf        /Work/Archive/            │ │ │
│ │ │     2.4MB • Modified: Jan 12  🤖 Newer version         │ │ │
│ │ │                                                         │ │ │
│ │ │ [Actions...]                                            │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ [Show 10 more groups...]                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Bulk Actions [56px] - When groups selected                 │ │
│ │                                                             │ │
│ │ 5 groups selected • Could save 42.3 MB                     │ │
│ │ [🗑️ Delete All Duplicates] [📁 Move to Trash] [Review]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌───────────────────────────────────────┐
│ Header [56px]                         │
│ [☰] Duplicates       [🔍] [⚙️]       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Summary [60px]                        │
│ 342 duplicates • Save 8.7 GB         │
│ Similarity: [●──○] 85%                │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Groups List [Auto height]             │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ Group 1 • 100% • 3 files           │ │
│ │                                     │ │
│ │ 🖼️ IMG_2024_001.jpg                 │ │
│ │ 5.2MB • /Photos/2024/              │ │
│ │ [Thumb] [☐]                        │ │
│ │                                     │ │
│ │ 🖼️ Copy of IMG_2024_001.jpg         │ │
│ │ 5.2MB • /Photos/Backup/            │ │
│ │ [Thumb] [☐]                        │ │
│ │                                     │ │
│ │ 🖼️ IMG_2024_001 (1).jpg             │ │
│ │ 5.2MB • /Downloads/ 🤖             │ │
│ │ [Thumb] [☑️] Keep this             │ │
│ │                                     │ │
│ │ [🗑️ Delete] [📁 Move] [Review]      │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ [Show more groups...]                 │
└───────────────────────────────────────┘
```

### States

**Scanning State**:
```
┌─────────────────────────────────────────┐
│        🔍 Finding Duplicates            │
│                                         │
│    [■■■■■■□□□□] 60% complete             │
│                                         │
│   Analyzing content similarity...       │
│   Found: 127 potential duplicates       │
│                                         │
│         [⏸️ Pause] [❌ Cancel]           │
└─────────────────────────────────────────┘
```

**No Duplicates State**:
```
┌─────────────────────────────────────────┐
│         ✨ Your Drive is Clean          │
│                                         │
│     No duplicate files were found       │
│                                         │
│    🎉 Your Google Drive is already      │
│       well organized!                   │
│                                         │
│         [🔍 Scan Again]                 │
│      [⚙️ Adjust Sensitivity]            │
└─────────────────────────────────────────┘
```

---

## 6. AI Analysis Screen (`/ai`)

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header + Sidebar (with AI Toggle highlighted)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ AI Analysis Content                                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AI Status Bar [60px]                                        │ │
│ │                                                             │ │
│ │ 🤖 AI Mode: [●] Enabled                      Quota: 847/1000 │ │
│ │                                                             │ │
│ │ [🎯 Smart Classification] [📊 Content Analysis] [⚡ Quick Org] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Analysis Workspace [400px]                                  │ │
│ │                                                             │ │
│ │ ┌─────────────────────┬─────────────────────────────────────┐ │ │
│ │ │ File Selection      │ Analysis Results                    │ │ │
│ │ │ [300px width]       │                                     │ │ │
│ │ │                     │                                     │ │ │
│ │ │ [🔍 Search files...] │ 📄 Resume.pdf                       │ │ │
│ │ │                     │                                     │ │ │
│ │ │ [☑️] 📄 Resume.pdf   │ Category: 📋 Professional Document  │ │ │
│ │ │ [☑️] 📄 Invoice.pdf  │ Confidence: 95%                     │ │ │
│ │ │ [☐] 🖼️ Photo.jpg    │                                     │ │ │
│ │ │ [☐] 📁 Projects/    │ 🏷️ Tags: resume, professional,       │ │ │
│ │ │                     │          career, document           │ │ │
│ │ │ Selected: 2 files   │                                     │ │ │
│ │ │                     │ 📁 Suggested Location:              │ │ │
│ │ │ [🤖 Analyze]         │    /Career/Documents/               │ │ │
│ │ │                     │                                     │ │ │
│ │ │                     │ 🎯 Actions:                         │ │ │
│ │ │                     │ • Move to Career folder             │ │ │
│ │ │                     │ • Tag as 'Professional'            │ │ │
│ │ │                     │ • Add to Important collection      │ │ │
│ │ └─────────────────────┴─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AI Insights [200px]                                         │ │
│ │                                                             │ │
│ │ 🧠 Organization Recommendations                             │ │
│ │                                                             │ │
│ │ • Create "/Career/" folder for professional documents       │ │
│ │ • Move 47 financial files to "/Finance/2024/"             │ │
│ │ • Archive old photos (>2 years) to "/Archive/"            │ │
│ │ • Rename inconsistent file names in /Downloads/            │ │
│ │                                                             │ │
│ │ [✅ Apply All] [⚙️ Create Rules] [💾 Save Report]           │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌───────────────────────────────────────┐
│ Header [56px]                         │
│ [☰] AI Analysis      [🤖] [⚙️]       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ AI Toggle [48px]                      │
│ 🤖 AI Mode: [●] ON    Quota: 847/1000│
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Tabs [40px]                           │
│ [Classify] [Analyze] [Organize]       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ File Selection [200px]                │
│                                       │
│ [🔍 Search files...]                  │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ [☑️] 📄 Resume.pdf                  │ │
│ │ 245KB • /Documents/                 │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ ┌─────────────────────────────────────┐ │
│ │ [☑️] 📄 Invoice.pdf                 │ │
│ │ 180KB • /Downloads/                 │ │
│ └─────────────────────────────────────┘ │
│                                       │
│ 2 files selected                      │
│ [🤖 Analyze Selected]                 │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Results [Auto height]                 │
│                                       │
│ 📄 Resume.pdf                         │
│ Category: Professional Document       │
│ Confidence: 95%                       │
│                                       │
│ 🏷️ Tags: resume, professional         │
│ 📁 Suggested: /Career/Documents/      │
│                                       │
│ [📁 Move] [🏷️ Tag] [⭐ Important]      │
└───────────────────────────────────────┘
```

### States

**AI Disabled State**:
```
┌─────────────────────────────────────────┐
│         🤖 AI Features Disabled         │
│                                         │
│    Enable AI mode to access smart      │
│    classification and organization      │
│            features                     │
│                                         │
│          [🔘] Enable AI Mode           │
│                                         │
│    Note: AI features require Google     │
│    Gemini API access and may incur      │
│           usage charges                 │
└─────────────────────────────────────────┘
```

**Processing State**:
```
┌─────────────────────────────────────────┐
│      🤖 AI Analysis in Progress         │
│                                         │
│    [■■■■■■□□□□] 60% complete             │
│                                         │
│   Analyzing file content and metadata   │
│   Processed: 12 of 20 files             │
│                                         │
│         [⏸️ Pause] [❌ Cancel]           │
└─────────────────────────────────────────┘
```

**Quota Exceeded State**:
```
┌─────────────────────────────────────────┐
│       ⚠️ AI Quota Exceeded             │
│                                         │
│   You've reached your monthly AI        │
│   analysis limit (1000 requests)        │
│                                         │
│   Quota resets: March 1, 2024          │
│                                         │
│    [💰 Upgrade Plan] [📧 Contact Sales] │
└─────────────────────────────────────────┘
```

---

## 7. Organization Screen (`/organize`)

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header + Sidebar (same as dashboard)                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Organization Content                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Header [60px]                                               │ │
│ │                                                             │ │
│ │ File Organization                      [🤖 AI Suggestions]  │ │
│ │                                                             │ │
│ │ [📋 Apply Rules] [🔄 Preview Changes] [⚙️ Create Rule]       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Organization Workspace [500px]                              │ │
│ │                                                             │ │
│ │ ┌─────────────────────┬─────────────────────────────────────┐ │ │
│ │ │ Current Structure   │ Suggested Structure                 │ │ │
│ │ │ [320px]             │                                     │ │ │
│ │ │                     │                                     │ │ │
│ │ │ 📁 Root Drive       │ 📁 Organized Drive                  │ │ │
│ │ │ ├── 📁 Documents     │ ├── 📁 Work                        │ │ │
│ │ │ │   ├── file1.pdf    │ │   ├── 📁 Projects               │ │ │
│ │ │ │   ├── file2.docx   │ │   ├── 📁 Contracts              │ │ │
│ │ │ │   └── resume.pdf   │ │   └── 📁 Reports                │ │ │
│ │ │ ├── 📁 Downloads     │ ├── 📁 Personal                   │ │ │
│ │ │ │   ├── random.txt   │ │   ├── 📁 Finance                │ │ │
│ │ │ │   └── invoice.pdf  │ │   ├── 📁 Health                 │ │ │
│ │ │ ├── 📁 Photos        │ │   └── 📁 Travel                 │ │ │
│ │ │ │   ├── img1.jpg     │ ├── 📁 Media                      │ │ │
│ │ │ │   └── img2.png     │ │   ├── 📁 Photos                 │ │ │
│ │ │ └── misc files...    │ │   ├── 📁 Videos                 │ │ │
│ │ │                     │ │   └── 📁 Audio                  │ │ │
│ │ │ [🔍 Analyze]         │ └── 📁 Archive                    │ │ │
│ │ │                     │                                     │ │ │
│ │ │                     │ 🎯 Improvements:                   │ │ │
│ │ │                     │ • 78% better organization          │ │ │
│ │ │                     │ • Easier file discovery            │ │ │
│ │ │                     │ • Reduced search time              │ │ │
│ │ │                     │                                     │ │ │
│ │ │                     │ [✅ Apply Changes]                  │ │ │
│ │ └─────────────────────┴─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Organization Rules [240px]                                  │ │
│ │                                                             │ │
│ │ Active Rules (3)                           [+ New Rule]     │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Rule: Financial Documents                [●] Active     │ │ │
│ │ │ Pattern: *invoice*, *receipt*, *tax*                    │ │ │
│ │ │ Action: Move to /Personal/Finance/                      │ │ │
│ │ │ Applied: 23 files                                       │ │ │
│ │ │ [✏️ Edit] [⏸️ Pause] [🗑️ Delete]                         │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Rule: Work Projects                     [○] Paused      │ │ │
│ │ │ Pattern: *project*, *work*, *.ppt*                     │ │ │
│ │ │ Action: Move to /Work/Projects/                         │ │ │
│ │ │ Applied: 156 files                                      │ │ │
│ │ │ [Actions...]                                            │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ [▼ Show all rules...]                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌───────────────────────────────────────┐
│ Header [56px]                         │
│ [☰] Organize         [🤖] [⚙️]       │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Tabs [40px]                           │
│ [Structure] [Rules] [Suggestions]     │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Current Structure [300px]             │
│                                       │
│ 📁 Your Google Drive                  │
│ ├── 📁 Documents (47 files)           │
│ ├── 📁 Downloads (234 files)          │
│ ├── 📁 Photos (1,205 files)           │
│ └── 156 loose files                   │
│                                       │
│ [🔍 Analyze Structure]                │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ AI Suggestions [200px]                │
│                                       │
│ 🤖 Recommended Changes:               │
│                                       │
│ • Create /Work/ folder                │
│   Move 47 business documents         │
│                                       │
│ • Create /Personal/Finance/           │
│   Move 23 financial files            │
│                                       │
│ • Organize photos by year             │
│   Create /Photos/2024/, etc.         │
│                                       │
│ [✅ Apply All] [👀 Preview]           │
└───────────────────────────────────────┘
```

---

## 8. System Screens

### Health Check Screen (`/health`)

```
┌─────────────────────────────────────────────────────────────────┐
│ System Health Monitor                              Last: 2s ago │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Overall Status: ✅ Healthy                                      │
│ Uptime: 7d 14h 23m                          Response: 127ms     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Service Dependencies                                            │
│                                                                 │
│ ✅ Firebase Auth         │ Healthy      │ 98ms   │ Available    │
│ ✅ Cloud Firestore       │ Healthy      │ 145ms  │ Available    │
│ ✅ Google Drive API       │ Healthy      │ 234ms  │ Available    │
│ ⚠️ Gemini AI API         │ Degraded     │ 2.1s   │ High Latency │
│ ✅ Firebase Hosting       │ Healthy      │ 45ms   │ Available    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Performance Metrics                                             │
│                                                                 │
│ Memory Usage: [■■■■■□□□□□] 58% (297MB / 512MB)                  │
│ CPU Usage:    [■■□□□□□□□□] 23%                                  │
│                                                                 │
│ Request Rate: 127 req/min                                       │
│ Error Rate:   0.2% (3 errors in last hour)                     │
└─────────────────────────────────────────────────────────────────┘
```

### About Screen (`/about`)

```
┌─────────────────────────────────────────────────────────────────┐
│ About DriveMind                                        v1.0.0   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ System Information                                              │
│                                                                 │
│ Application: DriveMind                                          │
│ Version: 1.0.0 (build 2024.12.13.1)                          │
│ Runtime: Node.js 18.19.0                                       │
│ Platform: Firebase App Hosting                                 │
│ Region: us-central1                                             │
│                                                                 │
│ Build Info:                                                     │
│ • Commit: 4d94e34 (Dec 13, 2024)                              │
│ • Branch: main                                                  │
│ • Environment: production                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Feature Overview                                                │
│                                                                 │
│ [🔐 OAuth 2.0]  [🔍 Drive Scan]  [🤖 AI Analysis]              │
│                                                                 │
│ [🔄 Duplicates] [📁 Organization] [📋 Auto Rules]               │
│                                                                 │
│ [🏥 Health Check] [📊 Metrics] [🔒 Security]                   │
└─────────────────────────────────────────────────────────────────┘
```

## Responsive Design Tokens

### Breakpoint Strategy
```css
/* Mobile First Approach */
mobile: 0px       /* Default styles */
tablet: 768px     /* md: breakpoint */
desktop: 1024px   /* lg: breakpoint */
xl: 1440px        /* xl: breakpoint */

/* Component Adaptations */
sidebar:
  mobile: overlay drawer
  tablet: 240px fixed
  desktop: 280px fixed

header:
  mobile: 56px height, hamburger menu
  tablet: 64px height, partial navigation
  desktop: 64px height, full navigation

cards:
  mobile: full-width, stacked
  tablet: 2-column grid
  desktop: 3-4 column grid

tables:
  mobile: card layout with essential info
  tablet: horizontal scroll
  desktop: full table layout
```

### Touch Targets
- Minimum 44px touch target size
- 8px minimum spacing between targets
- Larger buttons (48px) for primary actions
- Swipe gestures for mobile file operations
- Long-press context menus

### Loading Performance
- Skeleton screens for all major components
- Progressive image loading with blur-up
- Virtual scrolling for large lists (>100 items)
- Lazy loading for non-critical components
- Service worker for offline capability

## Error State Patterns

### Network Errors
```
┌─────────────────────────────────────────┐
│         🌐 Connection Issues            │
│                                         │
│   Please check your internet connection │
│   and try again                         │
│                                         │
│         [🔄 Retry] [📱 Go Offline]      │
│                                         │
│   Some features may be limited while    │
│   offline                               │
└─────────────────────────────────────────┘
```

### Authentication Errors
```
┌─────────────────────────────────────────┐
│         🔐 Authentication Required       │
│                                         │
│   Your session has expired. Please      │
│   reconnect your Google Drive account   │
│                                         │
│         [🔗 Reconnect Drive]            │
│       [📧 Contact Support]              │
└─────────────────────────────────────────┘
```

### Service Unavailable
```
┌─────────────────────────────────────────┐
│         🚫 Service Temporarily          │
│            Unavailable                  │
│                                         │
│   We're experiencing high traffic.      │
│   Please try again in a few minutes     │
│                                         │
│         [🔄 Try Again]                  │
│       [📊 Status Page]                  │
│                                         │
│   Estimated wait time: 2-3 minutes      │
└─────────────────────────────────────────┘
```