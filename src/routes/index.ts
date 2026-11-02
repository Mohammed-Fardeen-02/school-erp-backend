import { Router } from 'express';
import { healthRoutes } from './health.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { organizationsRoutes } from '../modules/organizations/organizations.routes';
import { locationsRoutes } from '../modules/locations/locations.routes';
import { workspaceRoutes } from '../modules/workspace/workspace.routes';
import { rolesRoutes } from '../modules/roles/roles.routes';
import { permissionsRoutes } from '../modules/permissions/permissions.routes';
import { userRolesRoutes } from '../modules/user-roles/user-roles.routes';

const apiRouter = Router();

// Platform System Routes
apiRouter.use('/health', healthRoutes);

// Core Authentication & Session Routes
apiRouter.use('/auth', authRoutes);

// Organization Master & Subscription Routes
apiRouter.use('/organizations', organizationsRoutes);

// Campus & Location Management Routes
apiRouter.use('/locations', locationsRoutes);

// Multi-Tenant Workspace Discovery & Selection Routes
apiRouter.use('/workspace', workspaceRoutes);

// Dynamic RBAC Roles Management
apiRouter.use('/roles', rolesRoutes);

// Modular Capability Permissions Catalog & Effective Caller State
apiRouter.use('/permissions', permissionsRoutes);

// User-Role Assignments & Historical Lifecycle Management
apiRouter.use('/user-roles', userRolesRoutes);

export default apiRouter;
