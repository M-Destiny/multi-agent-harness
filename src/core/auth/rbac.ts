export type UserRole = 'owner' | 'admin' | 'developer' | 'viewer';

export type Permission =
  | 'read:graph'
  | 'read:checkpoints'
  | 'write:state'
  | 'write:workflow'
  | 'admin:keys'
  | 'owner:delete';

const PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: ['read:graph', 'read:checkpoints', 'write:state', 'write:workflow', 'admin:keys', 'owner:delete'],
  admin: ['read:graph', 'read:checkpoints', 'write:state', 'write:workflow', 'admin:keys'],
  developer: ['read:graph', 'read:checkpoints', 'write:state', 'write:workflow'],
  viewer: ['read:graph', 'read:checkpoints'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}
