import { describe, it, expect } from 'vitest';
import {
  EvaluatedRole,
  evaluatePermission,
  evaluateRoleVote,
  getNodeAncestors,
  computeEffectiveNodeCodes,
} from './permission-evaluator';

describe('Stage 3.3: Permission Evaluator Engine', () => {
  describe('1. Node Ancestry Resolution', () => {
    it('should correctly derive dot-delimited ancestors from leaf to root', () => {
      const ancestors = getNodeAncestors('students.admissions.inquiries.view');
      expect(ancestors).toEqual([
        'students.admissions.inquiries.view',
        'students.admissions.inquiries',
        'students.admissions',
        'students',
      ]);
    });

    it('should handle level 1 root module ancestors', () => {
      const ancestors = getNodeAncestors('academics');
      expect(ancestors).toEqual(['academics']);
    });

    it('should respect custom parentMap if provided', () => {
      const parentMap = new Map<string, string | null>([
        ['custom.leaf', 'custom.parent'],
        ['custom.parent', 'custom.root'],
        ['custom.root', null],
      ]);

      const ancestors = getNodeAncestors('custom.leaf', parentMap);
      expect(ancestors).toEqual(['custom.leaf', 'custom.parent', 'custom.root']);
    });
  });

  describe('2. Single-Role Hierarchical Inheritance & Votes', () => {
    it('should vote GRANT on direct leaf match with isGranted: true', () => {
      const role: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'TEACHER',
        isActive: true,
        grants: {
          'academics.curriculum.courses.view': true,
        },
      };

      const ancestors = getNodeAncestors('academics.curriculum.courses.view');
      const vote = evaluateRoleVote(role, 'academics.curriculum.courses.view', ancestors);

      expect(vote.vote).toBe('GRANT');
      expect(vote.inherited).toBe(false);
      expect(vote.matchedNodeCode).toBe('academics.curriculum.courses.view');
    });

    it('should vote DENY on direct leaf match with isGranted: false', () => {
      const role: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'RESTRICTED_STAFF',
        isActive: true,
        grants: {
          'fees.invoices.billing.void': false,
        },
      };

      const ancestors = getNodeAncestors('fees.invoices.billing.void');
      const vote = evaluateRoleVote(role, 'fees.invoices.billing.void', ancestors);

      expect(vote.vote).toBe('DENY');
      expect(vote.inherited).toBe(false);
      expect(vote.matchedNodeCode).toBe('fees.invoices.billing.void');
    });

    it('should inherit GRANT from closest ancestor (FEATURE level)', () => {
      const role: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'COORDINATOR',
        isActive: true,
        grants: {
          'academics.curriculum.courses': true, // Feature level
        },
      };

      const ancestors = getNodeAncestors('academics.curriculum.courses.view');
      const vote = evaluateRoleVote(role, 'academics.curriculum.courses.view', ancestors);

      expect(vote.vote).toBe('GRANT');
      expect(vote.inherited).toBe(true);
      expect(vote.matchedNodeCode).toBe('academics.curriculum.courses');
    });

    it('should inherit GRANT from root MODULE level', () => {
      const role: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'SCHOOL_ADMIN',
        isActive: true,
        grants: {
          academics: true, // Module level
        },
      };

      const ancestors = getNodeAncestors('academics.lesson_plans.planner.edit');
      const vote = evaluateRoleVote(role, 'academics.lesson_plans.planner.edit', ancestors);

      expect(vote.vote).toBe('GRANT');
      expect(vote.inherited).toBe(true);
      expect(vote.matchedNodeCode).toBe('academics');
    });

    it('should allow explicit leaf DENY to override parent MODULE grant', () => {
      const role: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'JUNIOR_ACCOUNTANT',
        isActive: true,
        grants: {
          fees: true, // Grants entire fees module
          'fees.invoices.billing.void': false, // Explicitly denies invoice voiding
        },
      };

      // 1. General fee action inherits GRANT
      const viewAncestors = getNodeAncestors('fees.invoices.billing.view');
      const viewVote = evaluateRoleVote(role, 'fees.invoices.billing.view', viewAncestors);
      expect(viewVote.vote).toBe('GRANT');
      expect(viewVote.inherited).toBe(true);

      // 2. Void action matches explicit DENY
      const voidAncestors = getNodeAncestors('fees.invoices.billing.void');
      const voidVote = evaluateRoleVote(role, 'fees.invoices.billing.void', voidAncestors);
      expect(voidVote.vote).toBe('DENY');
      expect(voidVote.inherited).toBe(false);
      expect(voidVote.matchedNodeCode).toBe('fees.invoices.billing.void');
    });

    it('should vote ABSTAIN when unconfigured in role', () => {
      const role: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'LIBRARIAN',
        isActive: true,
        grants: {
          library: true,
        },
      };

      const ancestors = getNodeAncestors('transport.routes.stops.create');
      const vote = evaluateRoleVote(role, 'transport.routes.stops.create', ancestors);

      expect(vote.vote).toBe('ABSTAIN');
      expect(vote.inherited).toBe(false);
    });
  });

  describe('3. Multi-Role Combination & Precedence', () => {
    it('Rule 1: Deny-Overrides — explicit DENY in any role overrides GRANT in another', () => {
      const rolePrincipal: EvaluatedRole = {
        roleId: 'r-1',
        roleCode: 'PRINCIPAL',
        isActive: true,
        locationId: null,
        grants: {
          students: true, // Grants all student operations
        },
      };

      const roleAuditRestriction: EvaluatedRole = {
        roleId: 'r-2',
        roleCode: 'COMPLIANCE_HOLD',
        isActive: true,
        locationId: null,
        grants: {
          'students.admissions.enrollment.delete': false, // Hard restriction
        },
      };

      const result = evaluatePermission(
        [rolePrincipal, roleAuditRestriction],
        'students.admissions.enrollment.delete'
      );

      expect(result.isGranted).toBe(false);
      expect(result.denyingRole).toBe('COMPLIANCE_HOLD');
      expect(result.reason).toContain('Explicitly denied by role: COMPLIANCE_HOLD');
    });

    it('Rule 2: Grant-Union — additive permissions across roles authorize access if not denied', () => {
      const roleTeacher: EvaluatedRole = {
        roleId: 'r-1',
        roleCode: 'TEACHER',
        isActive: true,
        locationId: null,
        grants: {
          academics: true,
        },
      };

      const roleHostelWarden: EvaluatedRole = {
        roleId: 'r-2',
        roleCode: 'WARDEN',
        isActive: true,
        locationId: null,
        grants: {
          hostel: true,
        },
      };

      // Can access academics via TEACHER
      const resAcademics = evaluatePermission(
        [roleTeacher, roleHostelWarden],
        'academics.curriculum.courses.view'
      );
      expect(resAcademics.isGranted).toBe(true);
      expect(resAcademics.grantingRoles).toContain('TEACHER');

      // Can access hostel via WARDEN
      const resHostel = evaluatePermission(
        [roleTeacher, roleHostelWarden],
        'hostel.rooms.inventory.view'
      );
      expect(resHostel.isGranted).toBe(true);
      expect(resHostel.grantingRoles).toContain('WARDEN');
    });

    it('Rule 3: Default Deny — unconfigured capability yields false', () => {
      const roleStudent: EvaluatedRole = {
        roleId: 'r-1',
        roleCode: 'STUDENT',
        isActive: true,
        locationId: null,
        grants: {
          'timetable.class_schedules.grids.view': true,
        },
      };

      const result = evaluatePermission([roleStudent], 'settings.campuses.locations.create');
      expect(result.isGranted).toBe(false);
      expect(result.reason).toContain('default deny');
    });

    it('should ignore inactive roles', () => {
      const inactiveAdmin: EvaluatedRole = {
        roleId: 'r-1',
        roleCode: 'INACTIVE_ADMIN',
        isActive: false, // Inactive!
        locationId: null,
        grants: {
          settings: true,
        },
      };

      const result = evaluatePermission([inactiveAdmin], 'settings.campuses.locations.view');
      expect(result.isGranted).toBe(false);
    });
  });

  describe('4. Campus Scoping & Location Filtering', () => {
    const orgWideRole: EvaluatedRole = {
      roleId: 'r-org',
      roleCode: 'INSTITUTION_HEAD',
      isActive: true,
      locationId: null, // Org-wide
      grants: {
        settings: true,
      },
    };

    const campusRoleMain: EvaluatedRole = {
      roleId: 'r-main',
      roleCode: 'CAMPUS_TEACHER',
      isActive: true,
      locationId: 'campus-main-uuid',
      grants: {
        attendance: true,
      },
    };

    it('org-wide role applies across all campus contexts', () => {
      // Checked in campus-main context
      const resMain = evaluatePermission([orgWideRole], 'settings.campuses.locations.view', {
        locationId: 'campus-main-uuid',
      });
      expect(resMain.isGranted).toBe(true);

      // Checked in org-wide context (no location specified)
      const resOrg = evaluatePermission([orgWideRole], 'settings.campuses.locations.view');
      expect(resOrg.isGranted).toBe(true);
    });

    it('campus-scoped role applies only to its assigned campus', () => {
      // 1. Matches campus-main
      const resMain = evaluatePermission([campusRoleMain], 'attendance.student_daily.roster.view', {
        locationId: 'campus-main-uuid',
      });
      expect(resMain.isGranted).toBe(true);

      // 2. Does NOT match branch campus
      const resBranch = evaluatePermission([campusRoleMain], 'attendance.student_daily.roster.view', {
        locationId: 'campus-branch-uuid',
      });
      expect(resBranch.isGranted).toBe(false);

      // 3. Does NOT apply in org-wide context (campus roles cannot act org-wide)
      const resOrg = evaluatePermission([campusRoleMain], 'attendance.student_daily.roster.view');
      expect(resOrg.isGranted).toBe(false);
    });

    it('campus-scoped explicit DENY is isolated to that campus only', () => {
      const orgAdmin: EvaluatedRole = {
        roleId: 'r-1',
        roleCode: 'SCHOOL_ADMIN',
        isActive: true,
        locationId: null,
        grants: {
          fees: true,
        },
      };

      const campusRestrict: EvaluatedRole = {
        roleId: 'r-2',
        roleCode: 'CAMPUS_DISCOUNT_RESTRICTED',
        isActive: true,
        locationId: 'campus-restricted-uuid',
        grants: {
          'fees.discounts.waivers.apply': false,
        },
      };

      // At restricted campus: Deny-Overrides triggers
      const atRestricted = evaluatePermission(
        [orgAdmin, campusRestrict],
        'fees.discounts.waivers.apply',
        { locationId: 'campus-restricted-uuid' }
      );
      expect(atRestricted.isGranted).toBe(false);
      expect(atRestricted.denyingRole).toBe('CAMPUS_DISCOUNT_RESTRICTED');

      // At another campus: restriction is not applicable; org grant stands
      const atOtherCampus = evaluatePermission(
        [orgAdmin, campusRestrict],
        'fees.discounts.waivers.apply',
        { locationId: 'campus-other-uuid' }
      );
      expect(atOtherCampus.isGranted).toBe(true);
    });
  });

  describe('5. Batch Effective Permission Set Computation', () => {
    it('should compute effective granted set for all nodes', () => {
      const role: EvaluatedRole = {
        roleId: 'r-1',
        roleCode: 'LIBRARIAN',
        isActive: true,
        locationId: null,
        grants: {
          library: true,
        },
      };

      const nodes = [
        'library',
        'library.books',
        'library.books.catalog',
        'library.books.catalog.view',
        'library.books.catalog.create',
        'transport.routes.stops.view',
      ];

      const granted = computeEffectiveNodeCodes([role], nodes);
      expect(granted.has('library')).toBe(true);
      expect(granted.has('library.books')).toBe(true);
      expect(granted.has('library.books.catalog')).toBe(true);
      expect(granted.has('library.books.catalog.view')).toBe(true);
      expect(granted.has('library.books.catalog.create')).toBe(true);
      expect(granted.has('transport.routes.stops.view')).toBe(false);
    });
  });
});

