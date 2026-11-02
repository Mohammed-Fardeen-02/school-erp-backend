/**
 * Deterministic Multi-Role Permission Evaluation Engine
 * Phase 3 Specification v3.0.2
 *
 * Implements:
 * 1. Within-role hierarchical inheritance (Action -> Feature -> Section -> Module)
 * 2. Multi-role combination:
 *    - Explicit Deny Precedence (Deny-Overrides: any role with is_granted = false denies)
 *    - Grant-Union (any role with is_granted = true grants if not denied)
 *    - Default Deny (unconfigured nodes evaluate to denied)
 * 3. Campus scope filtering (org-wide vs campus-scoped)
 */

export interface EvaluatedRole {
  roleId: string;
  roleCode: string;
  roleName?: string;
  isActive: boolean;
  locationId?: string | null; // null = org-wide; UUID string = campus-scoped
  /**
   * Capability map: nodeCode -> isGranted
   * true = Explicit Grant
   * false = Explicit Deny
   */
  grants: Record<string, boolean> | Map<string, boolean>;
}

export type PermissionVote = 'GRANT' | 'DENY' | 'ABSTAIN';

export interface SingleRoleVote {
  roleId: string;
  roleCode: string;
  vote: PermissionVote;
  matchedNodeCode?: string;
  inherited: boolean;
}

export interface PermissionEvaluationResult {
  isGranted: boolean;
  targetNodeCode: string;
  reason: string;
  votes: SingleRoleVote[];
  denyingRole?: string;
  grantingRoles: string[];
}

/**
 * Resolves node ancestors from leaf to root.
 * E.g. 'students.admissions.inquiries.view' ->
 *   ['students.admissions.inquiries.view', 'students.admissions.inquiries', 'students.admissions', 'students']
 */
export function getNodeAncestors(
  nodeCode: string,
  parentMap?: Map<string, string | null>
): string[] {
  const ancestors: string[] = [nodeCode];

  // If a parentMap is provided (from database or canonical catalog), follow parent pointers
  if (parentMap && parentMap.has(nodeCode)) {
    let current: string | null | undefined = parentMap.get(nodeCode);
    while (current) {
      ancestors.push(current);
      current = parentMap.get(current);
    }
    return ancestors;
  }

  // Fallback: derive ancestry from dot-delimited hierarchy
  const parts = nodeCode.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    ancestors.push(parts.slice(0, i).join('.'));
  }

  return ancestors;
}

/**
 * Evaluates a single role's vote for a target node code.
 * Searches for explicit grant on leaf, then traverses upward to parent feature, section, and module.
 * Closest configured ancestor (or leaf) determines the vote.
 */
export function evaluateRoleVote(
  role: EvaluatedRole,
  _targetNodeCode: string,
  ancestors: string[]
): SingleRoleVote {
  const getGrant = (code: string): boolean | undefined => {
    if (role.grants instanceof Map) {
      return role.grants.get(code);
    }
    return role.grants[code];
  };

  for (let idx = 0; idx < ancestors.length; idx++) {
    const code = ancestors[idx];
    if (!code) continue;
    const grant = getGrant(code);
    if (grant !== undefined) {
      return {
        roleId: role.roleId,
        roleCode: role.roleCode,
        vote: grant ? 'GRANT' : 'DENY',
        matchedNodeCode: code,
        inherited: idx > 0,
      };
    }
  }

  return {
    roleId: role.roleId,
    roleCode: role.roleCode,
    vote: 'ABSTAIN',
    inherited: false,
  };
}

/**
 * Evaluates multiple active roles against a target node capability.
 *
 * Rules:
 * 1. Scope Filtering:
 *    - Role must be active (isActive = true).
 *    - If targetLocationId is provided: matches org-wide roles (locationId IS NULL) OR roles for that location.
 *    - If targetLocationId is not provided (org-wide context): only org-wide roles apply. Campus-scoped roles cannot act org-wide.
 * 2. Multi-Role Combination:
 *    - Rule 1 (Deny-Overrides): If ANY applicable role evaluates to DENY, outcome is DENIED.
 *    - Rule 2 (Grant-Union): If no role denies and AT LEAST ONE role evaluates to GRANT, outcome is GRANTED.
 *    - Rule 3 (Default Deny): If all roles ABSTAIN (or no applicable roles), outcome is DENIED.
 */
export function evaluatePermission(
  roles: EvaluatedRole[],
  targetNodeCode: string,
  options?: {
    locationId?: string | null;
    parentMap?: Map<string, string | null>;
  }
): PermissionEvaluationResult {
  const targetLocationId = options?.locationId;
  const ancestors = getNodeAncestors(targetNodeCode, options?.parentMap);

  // Scope filter
  const applicableRoles = roles.filter((role) => {
    if (!role.isActive) return false;
    if (targetLocationId) {
      return (
        role.locationId === null ||
        role.locationId === undefined ||
        role.locationId === targetLocationId
      );
    }
    // Org-wide context
    return role.locationId === null || role.locationId === undefined;
  });

  const votes: SingleRoleVote[] = [];
  const grantingRoles: string[] = [];
  let denyingRole: string | undefined;

  for (const role of applicableRoles) {
    const vote = evaluateRoleVote(role, targetNodeCode, ancestors);
    votes.push(vote);

    if (vote.vote === 'DENY') {
      denyingRole = role.roleCode;
    } else if (vote.vote === 'GRANT') {
      grantingRoles.push(role.roleCode);
    }
  }

  // Rule 1: Deny-Overrides
  if (denyingRole) {
    return {
      isGranted: false,
      targetNodeCode,
      reason: `Explicitly denied by role: ${denyingRole}`,
      votes,
      denyingRole,
      grantingRoles,
    };
  }

  // Rule 2: Grant-Union
  if (grantingRoles.length > 0) {
    return {
      isGranted: true,
      targetNodeCode,
      reason: `Granted by active role(s): ${grantingRoles.join(', ')}`,
      votes,
      grantingRoles,
    };
  }

  // Rule 3: Default Deny
  return {
    isGranted: false,
    targetNodeCode,
    reason: `Insufficient permission: no active role grants ${targetNodeCode} (default deny)`,
    votes,
    grantingRoles: [],
  };
}

/**
 * Computes all granted node codes across a set of known nodes.
 */
export function computeEffectiveNodeCodes(
  roles: EvaluatedRole[],
  allNodeCodes: string[],
  options?: {
    locationId?: string | null;
    parentMap?: Map<string, string | null>;
  }
): Set<string> {
  const granted = new Set<string>();

  for (const nodeCode of allNodeCodes) {
    const res = evaluatePermission(roles, nodeCode, options);
    if (res.isGranted) {
      granted.add(nodeCode);
    }
  }

  return granted;
}

