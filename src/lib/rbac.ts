/**
 * RBAC (Role-Based Access Control) Implementation
 * Production-grade RBAC with role hierarchy and permission management
 * Compliant with ALPHA-CODENAME v1.8 security requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Role definitions
export enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin', 
  USER = 'user',
  VIEWER = 'viewer',
  GUEST = 'guest',
}

// Permission definitions
export enum Permission {
  // File operations
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  FILE_SHARE = 'file:share',
  
  // Folder operations
  FOLDER_CREATE = 'folder:create',
  FOLDER_DELETE = 'folder:delete',
  FOLDER_MODIFY = 'folder:modify',
  
  // Scan operations
  SCAN_RUN = 'scan:run',
  SCAN_CANCEL = 'scan:cancel',
  SCAN_VIEW = 'scan:view',
  SCAN_SCHEDULE = 'scan:schedule',
  
  // Admin operations
  USER_MANAGE = 'user:manage',
  ROLE_ASSIGN = 'role:assign',
  SYSTEM_CONFIG = 'system:config',
  AUDIT_VIEW = 'audit:view',
  
  // Analytics operations
  ANALYTICS_VIEW = 'analytics:view',
  ANALYTICS_EXPORT = 'analytics:export',
}

// Role hierarchy and permissions mapping
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [Role.SUPER_ADMIN]: [Role.ADMIN, Role.USER, Role.VIEWER, Role.GUEST],
  [Role.ADMIN]: [Role.USER, Role.VIEWER, Role.GUEST],
  [Role.USER]: [Role.VIEWER, Role.GUEST],
  [Role.VIEWER]: [Role.GUEST],
  [Role.GUEST]: [],
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    // Has all permissions
    ...Object.values(Permission),
  ],
  [Role.ADMIN]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FOLDER_CREATE,
    Permission.FOLDER_DELETE,
    Permission.FOLDER_MODIFY,
    Permission.SCAN_RUN,
    Permission.SCAN_CANCEL,
    Permission.SCAN_VIEW,
    Permission.SCAN_SCHEDULE,
    Permission.USER_MANAGE,
    Permission.ANALYTICS_VIEW,
    Permission.ANALYTICS_EXPORT,
    Permission.AUDIT_VIEW,
  ],
  [Role.USER]: [
    Permission.FILE_READ,
    Permission.FILE_WRITE,
    Permission.FILE_DELETE,
    Permission.FILE_SHARE,
    Permission.FOLDER_CREATE,
    Permission.FOLDER_MODIFY,
    Permission.SCAN_RUN,
    Permission.SCAN_CANCEL,
    Permission.SCAN_VIEW,
    Permission.ANALYTICS_VIEW,
  ],
  [Role.VIEWER]: [
    Permission.FILE_READ,
    Permission.SCAN_VIEW,
    Permission.ANALYTICS_VIEW,
  ],
  [Role.GUEST]: [
    Permission.FILE_READ,
  ],
};

// Resource-based permissions
interface ResourcePermission {
  resourceType: 'file' | 'folder' | 'scan' | 'user';
  resourceId: string;
  ownerId: string;
  sharedWith?: Array<{
    userId: string;
    permissions: Permission[];
  }>;
}

// User context interface
export interface UserContext {
  uid: string;
  email: string;
  roles: Role[];
  customPermissions?: Permission[];
  metadata?: Record<string, any>;
}

// RBAC Service class
export class RBACService {
  private static instance: RBACService;
  private userCache: Map<string, UserContext> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  private constructor() {}
  
  static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }
  
  /**
   * Get user context from token
   */
  async getUserContext(token: string): Promise<UserContext | null> {
    try {
      // Check cache first
      const cached = this.userCache.get(token);
      if (cached) {
        return cached;
      }
      
      // Verify token
      const decodedToken = await getAuth().verifyIdToken(token);
      const { uid, email } = decodedToken;
      
      // Get user document from Firestore
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        // Create default user context for new users
        const defaultContext: UserContext = {
          uid,
          email: email || '',
          roles: [Role.USER],
        };
        
        // Save to Firestore
        await db.collection('users').doc(uid).set({
          ...defaultContext,
          createdAt: new Date(),
          lastLogin: new Date(),
        });
        
        this.cacheUser(token, defaultContext);
        return defaultContext;
      }
      
      const userData = userDoc.data();
      const context: UserContext = {
        uid,
        email: email || userData?.email || '',
        roles: userData?.roles || [Role.USER],
        customPermissions: userData?.customPermissions,
        metadata: userData?.metadata,
      };
      
      // Update last login
      await db.collection('users').doc(uid).update({
        lastLogin: new Date(),
      });
      
      this.cacheUser(token, context);
      return context;
    } catch (error) {
      console.error('Failed to get user context:', error);
      return null;
    }
  }
  
  /**
   * Cache user context
   */
  private cacheUser(token: string, context: UserContext) {
    this.userCache.set(token, context);
    setTimeout(() => this.userCache.delete(token), this.CACHE_TTL);
  }
  
  /**
   * Check if user has a specific role
   */
  hasRole(user: UserContext, role: Role): boolean {
    return user.roles.some(userRole => 
      userRole === role || this.isRoleInHierarchy(userRole, role)
    );
  }
  
  /**
   * Check role hierarchy
   */
  private isRoleInHierarchy(userRole: Role, targetRole: Role): boolean {
    return ROLE_HIERARCHY[userRole]?.includes(targetRole) || false;
  }
  
  /**
   * Check if user has a specific permission
   */
  hasPermission(user: UserContext, permission: Permission): boolean {
    // Check custom permissions first
    if (user.customPermissions?.includes(permission)) {
      return true;
    }
    
    // Check role-based permissions
    for (const role of user.roles) {
      const rolePermissions = this.getRolePermissions(role);
      if (rolePermissions.includes(permission)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get all permissions for a role (including inherited)
   */
  getRolePermissions(role: Role): Permission[] {
    const permissions = new Set<Permission>();
    
    // Add direct permissions
    ROLE_PERMISSIONS[role]?.forEach(p => permissions.add(p));
    
    // Add inherited permissions from hierarchy
    ROLE_HIERARCHY[role]?.forEach(inheritedRole => {
      ROLE_PERMISSIONS[inheritedRole]?.forEach(p => permissions.add(p));
    });
    
    return Array.from(permissions);
  }
  
  /**
   * Check resource-based permissions
   */
  async hasResourcePermission(
    user: UserContext,
    resourceType: string,
    resourceId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      const db = getFirestore();
      const resourceDoc = await db
        .collection(`${resourceType}s`)
        .doc(resourceId)
        .get();
      
      if (!resourceDoc.exists) {
        return false;
      }
      
      const resource = resourceDoc.data() as ResourcePermission;
      
      // Check if user is owner
      if (resource.ownerId === user.uid) {
        return true;
      }
      
      // Check if resource is shared with user
      const sharedPermissions = resource.sharedWith?.find(
        share => share.userId === user.uid
      );
      
      if (sharedPermissions?.permissions.includes(permission)) {
        return true;
      }
      
      // Fall back to role-based permissions
      return this.hasPermission(user, permission);
    } catch (error) {
      console.error('Failed to check resource permission:', error);
      return false;
    }
  }
  
  /**
   * Assign role to user
   */
  async assignRole(adminUser: UserContext, targetUserId: string, role: Role): Promise<boolean> {
    // Check if admin has permission to assign roles
    if (!this.hasPermission(adminUser, Permission.ROLE_ASSIGN)) {
      throw new Error('Insufficient permissions to assign roles');
    }
    
    try {
      const db = getFirestore();
      await db.collection('users').doc(targetUserId).update({
        roles: FieldValue.arrayUnion(role),
        modifiedBy: adminUser.uid,
        modifiedAt: new Date(),
      });
      
      // Log the action
      await this.logAction(adminUser, 'ROLE_ASSIGNED', {
        targetUserId,
        role,
      });
      
      return true;
    } catch (error) {
      console.error('Failed to assign role:', error);
      return false;
    }
  }
  
  /**
   * Remove role from user
   */
  async removeRole(adminUser: UserContext, targetUserId: string, role: Role): Promise<boolean> {
    // Check if admin has permission to manage roles
    if (!this.hasPermission(adminUser, Permission.ROLE_ASSIGN)) {
      throw new Error('Insufficient permissions to remove roles');
    }
    
    // Prevent removing the last role
    try {
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(targetUserId).get();
      const userData = userDoc.data();
      
      if (userData?.roles?.length <= 1) {
        throw new Error('Cannot remove last role from user');
      }
      
      await db.collection('users').doc(targetUserId).update({
        roles: FieldValue.arrayRemove(role),
        modifiedBy: adminUser.uid,
        modifiedAt: new Date(),
      });
      
      // Log the action
      await this.logAction(adminUser, 'ROLE_REMOVED', {
        targetUserId,
        role,
      });
      
      return true;
    } catch (error) {
      console.error('Failed to remove role:', error);
      return false;
    }
  }
  
  /**
   * Log security action for audit trail
   */
  private async logAction(user: UserContext, action: string, details: any): Promise<void> {
    try {
      const db = getFirestore();
      await db.collection('audit_logs').add({
        userId: user.uid,
        email: user.email,
        action,
        details,
        timestamp: new Date(),
        ip: details.ip || 'unknown',
        userAgent: details.userAgent || 'unknown',
      });
    } catch (error) {
      console.error('Failed to log action:', error);
    }
  }
}

/**
 * RBAC middleware factory
 */
export function requirePermission(permission: Permission | Permission[]) {
  return async function rbacMiddleware(
    req: NextRequest
  ): Promise<NextResponse | null> {
    const rbac = RBACService.getInstance();
    
    // Extract token from header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    const user = await rbac.getUserContext(token);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Check permissions
    const permissions = Array.isArray(permission) ? permission : [permission];
    const hasRequiredPermission = permissions.some(p => rbac.hasPermission(user, p));
    
    if (!hasRequiredPermission) {
      // Log unauthorized access attempt
      await rbac['logAction'](user, 'UNAUTHORIZED_ACCESS_ATTEMPT', {
        path: req.nextUrl.pathname,
        requiredPermissions: permissions,
        userPermissions: user.roles.flatMap(r => rbac.getRolePermissions(r)),
      });
      
      return NextResponse.json(
        { 
          error: 'Forbidden', 
          message: 'Insufficient permissions',
          required: permissions,
        },
        { status: 403 }
      );
    }
    
    // Add user context to request for downstream use
    (req as any).user = user;
    
    return null; // Allow request to proceed
  };
}

/**
 * RBAC middleware for role checking
 */
export function requireRole(role: Role | Role[]) {
  return async function roleMiddleware(
    req: NextRequest
  ): Promise<NextResponse | null> {
    const rbac = RBACService.getInstance();
    
    // Extract token from header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.substring(7);
    const user = await rbac.getUserContext(token);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Check roles
    const roles = Array.isArray(role) ? role : [role];
    const hasRequiredRole = roles.some(r => rbac.hasRole(user, r));
    
    if (!hasRequiredRole) {
      return NextResponse.json(
        { 
          error: 'Forbidden', 
          message: 'Insufficient role privileges',
          required: roles,
          current: user.roles,
        },
        { status: 403 }
      );
    }
    
    // Add user context to request
    (req as any).user = user;
    
    return null; // Allow request to proceed
  };
}