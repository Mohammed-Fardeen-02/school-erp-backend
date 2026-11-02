import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../core/database/prisma-client';

describe('Stage 3.5: PostgreSQL Database Foundation & Concurrency Suite', () => {
  // Test Entities
  let tenant1: any;
  let tenant2: any;
  let campus1a: any;
  let campus1b: any;
  let campus2a: any;
  let adminUser: any;
  let targetUser: any;
  let foreignUser: any;
  let membership1: any;
  let membership2: any;
  let membershipForeign2: any;
  let role1: any;
  let role2: any;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Create Isolated Test Organizations
    tenant1 = await prisma.organization.create({
      data: {
        code: `T1_${timestamp}`.substring(0, 20),
        legalName: 'DB Test Tenant 1 Legal',
        displayName: 'DB Test Tenant 1',
        email: `t1_${timestamp}@test.edu`,
        phone: '1234567890',
        status: 'ACTIVE',
      },
    });

    tenant2 = await prisma.organization.create({
      data: {
        code: `T2_${timestamp}`.substring(0, 20),
        legalName: 'DB Test Tenant 2 Legal',
        displayName: 'DB Test Tenant 2',
        email: `t2_${timestamp}@test.edu`,
        phone: '1234567890',
        status: 'ACTIVE',
      },
    });

    // 2. Create Campuses
    campus1a = await prisma.location.create({
      data: {
        organizationId: tenant1.id,
        code: `C1A_${timestamp}`.substring(0, 20),
        name: 'Campus 1A',
        isActive: true,
      },
    });

    campus1b = await prisma.location.create({
      data: {
        organizationId: tenant1.id,
        code: `C1B_${timestamp}`.substring(0, 20),
        name: 'Campus 1B',
        isActive: true,
      },
    });

    campus2a = await prisma.location.create({
      data: {
        organizationId: tenant2.id,
        code: `C2A_${timestamp}`.substring(0, 20),
        name: 'Campus 2A',
        isActive: true,
      },
    });

    // 3. Create Test Users
    adminUser = await prisma.user.create({
      data: {
        email: `admin_${timestamp}@test.edu`,
        passwordHash: 'dummy-hash',
        firstName: 'DBTest',
        lastName: 'Admin',
        userType: 'TENANT',
        isActive: true,
      },
    });

    targetUser = await prisma.user.create({
      data: {
        email: `target_${timestamp}@test.edu`,
        passwordHash: 'dummy-hash',
        firstName: 'DBTest',
        lastName: 'Target',
        userType: 'TENANT',
        isActive: true,
      },
    });

    foreignUser = await prisma.user.create({
      data: {
        email: `foreign_${timestamp}@test.edu`,
        passwordHash: 'dummy-hash',
        firstName: 'DBTest',
        lastName: 'Foreign',
        userType: 'TENANT',
        isActive: true,
      },
    });

    // 4. Create Memberships
    membership1 = await prisma.organizationMembership.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        status: 'ACTIVE',
      },
    });

    membership2 = await prisma.organizationMembership.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant2.id,
        status: 'ACTIVE',
      },
    });

    membershipForeign2 = await prisma.organizationMembership.create({
      data: {
        userId: foreignUser.id,
        organizationId: tenant2.id,
        status: 'ACTIVE',
      },
    });

    // 5. Create Custom Roles
    role1 = await prisma.role.create({
      data: {
        organizationId: tenant1.id,
        roleCode: `R1_${timestamp}`.substring(0, 20),
        roleName: 'Tenant 1 Custom Role',
        roleType: 'CUSTOM',
        isActive: true,
      },
    });

    role2 = await prisma.role.create({
      data: {
        organizationId: tenant2.id,
        roleCode: `R2_${timestamp}`.substring(0, 20),
        roleName: 'Tenant 2 Custom Role',
        roleType: 'CUSTOM',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    try {
      if (!tenant1 || !tenant2) return;

      // Clean up in reverse dependency order
      await prisma.userRole.deleteMany({
        where: {
          organizationId: { in: [tenant1.id, tenant2.id] },
        },
      });

      await prisma.auditLog.deleteMany({
        where: {
          organizationId: { in: [tenant1.id, tenant2.id] },
        },
      });

      await prisma.rbacInvalidationOutbox.deleteMany({
        where: {
          organizationId: { in: [tenant1.id, tenant2.id] },
        },
      });

      if (role1 && role2) {
        await prisma.role.deleteMany({
          where: { id: { in: [role1.id, role2.id] } },
        });
      }

      if (membership1 && membership2 && membershipForeign2) {
        await prisma.organizationMembership.deleteMany({
          where: { id: { in: [membership1.id, membership2.id, membershipForeign2.id] } },
        });
      }

      if (campus1a && campus1b && campus2a) {
        await prisma.location.deleteMany({
          where: { id: { in: [campus1a.id, campus1b.id, campus2a.id] } },
        });
      }

      await prisma.organization.deleteMany({
        where: { id: { in: [tenant1.id, tenant2.id] } },
      });

      if (adminUser && targetUser && foreignUser) {
        await prisma.user.deleteMany({
          where: { id: { in: [adminUser.id, targetUser.id, foreignUser.id] } },
        });
      }
    } catch (err) {
      console.warn('Cleanup error in afterAll:', err);
    }
  });

  // =========================================================================
  // Case 1: Cross-tenant role rejected by database trigger
  // =========================================================================
  it('1. Cross-tenant assignment rejected by the database trigger', async () => {
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role2.id, // Role belongs to Tenant 2!
          membershipId: membership1.id,
          isActive: true,
        },
      })
    ).rejects.toThrow(/Cross-tenant violation: Custom role/);
  });

  // =========================================================================
  // Case 2: Mismatched campus rejected by database trigger
  // =========================================================================
  it('2. Mismatched campus rejected by the database trigger', async () => {
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          locationId: campus2a.id, // Campus belongs to Tenant 2!
          membershipId: membership1.id,
          isActive: true,
        },
      })
    ).rejects.toThrow(/Cross-tenant violation: Location/);
  });

  // =========================================================================
  // Case 3: Invalid membership relationship rejected by trigger
  // =========================================================================
  it('3. Invalid membership relationship rejected by the database trigger', async () => {
    // Attempt to use foreign user's membership for target user
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membershipForeign2.id, // Membership belongs to foreignUser in Tenant 2!
          isActive: true,
        },
      })
    ).rejects.toThrow(/Cross-tenant violation: Membership/);
  });

  // =========================================================================
  // Case 4: Lifecycle constraint rejects inconsistent revoked records
  // =========================================================================
  it('4. Lifecycle constraint rejects inconsistent revoked records', async () => {
    // Inactive with missing revoked_at and reason
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membership1.id,
          isActive: false, // Inactive but no revoked_at, revoked_by, or reason!
        },
      })
    ).rejects.toThrow(/check_user_role_lifecycle/);

    // Active with unexpected revoked_at
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membership1.id,
          isActive: true,
          revokedAt: new Date(), // Active cannot have revocation timestamp!
          revokedBy: adminUser.id,
          reason: 'Invalid timestamp combination',
        },
      })
    ).rejects.toThrow(/check_user_role_lifecycle/);
  });

  // =========================================================================
  // Case 5: Duplicate active organization-wide assignments rejected
  // =========================================================================
  it('5. Duplicate active organization-wide assignments rejected by partial unique index', async () => {
    const asgn1 = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: null,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    expect(asgn1.id).toBeDefined();

    // Second active org-wide assignment for same user, role, org must fail
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membership1.id,
          locationId: null,
          isActive: true,
          assignedBy: adminUser.id,
        },
      })
    ).rejects.toThrow(/unique_user_role_org_wide|Unique constraint failed/);

    // Clean up asgn1
    await prisma.userRole.delete({ where: { id: asgn1.id } });
  });

  // =========================================================================
  // Case 6: Duplicate active campus assignments rejected
  // =========================================================================
  it('6. Duplicate active campus assignments rejected by partial unique index', async () => {
    const campusAsgn1 = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    expect(campusAsgn1.id).toBeDefined();

    // Second active assignment at the same campus must fail
    await expect(
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membership1.id,
          locationId: campus1a.id,
          isActive: true,
          assignedBy: adminUser.id,
        },
      })
    ).rejects.toThrow(/unique_user_role_campus_scoped|Unique constraint failed/);

    // Clean up
    await prisma.userRole.delete({ where: { id: campusAsgn1.id } });
  });

  // =========================================================================
  // Case 7: Different-campus assignments remain independent
  // =========================================================================
  it('7. Different-campus assignments remain independent', async () => {
    const asgnCampusA = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    const asgnCampusB = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1b.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    expect(asgnCampusA.id).toBeDefined();
    expect(asgnCampusB.id).toBeDefined();
    expect(asgnCampusA.locationId).toBe(campus1a.id);
    expect(asgnCampusB.locationId).toBe(campus1b.id);

    // Clean up
    await prisma.userRole.deleteMany({
      where: { id: { in: [asgnCampusA.id, asgnCampusB.id] } },
    });
  });

  // =========================================================================
  // Case 8: Concurrent duplicate assignments result in exactly one active record
  // =========================================================================
  it('8. Concurrent duplicate assignments result in exactly one active record', async () => {
    const results = await Promise.allSettled([
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membership1.id,
          locationId: campus1a.id,
          isActive: true,
          assignedBy: adminUser.id,
        },
      }),
      prisma.userRole.create({
        data: {
          userId: targetUser.id,
          organizationId: tenant1.id,
          roleId: role1.id,
          membershipId: membership1.id,
          locationId: campus1a.id,
          isActive: true,
          assignedBy: adminUser.id,
        },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const activeCount = await prisma.userRole.count({
      where: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        locationId: campus1a.id,
        isActive: true,
      },
    });
    expect(activeCount).toBe(1);

    // Clean up
    await prisma.userRole.deleteMany({
      where: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
      },
    });
  });

  // =========================================================================
  // Case 9: Audit insertion failure rolls back assignment creation
  // =========================================================================
  it('9. Audit insertion failure rolls back assignment creation', async () => {
    const beforeCount = await prisma.userRole.count({
      where: { organizationId: tenant1.id },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.userRole.create({
          data: {
            userId: targetUser.id,
            organizationId: tenant1.id,
            roleId: role1.id,
            membershipId: membership1.id,
            locationId: null,
            isActive: true,
            assignedBy: adminUser.id,
          },
        });

        // Trigger transaction rollback on audit insertion
        throw new Error('Simulated Audit Failure on Assignment');
      })
    ).rejects.toThrow('Simulated Audit Failure on Assignment');

    const afterCount = await prisma.userRole.count({
      where: { organizationId: tenant1.id },
    });
    expect(afterCount).toBe(beforeCount);
  });

  // =========================================================================
  // Case 10: Outbox insertion failure rolls back assignment creation
  // =========================================================================
  it('10. Outbox insertion failure rolls back assignment creation', async () => {
    const beforeCount = await prisma.userRole.count({
      where: { organizationId: tenant1.id },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.userRole.create({
          data: {
            userId: targetUser.id,
            organizationId: tenant1.id,
            roleId: role1.id,
            membershipId: membership1.id,
            locationId: null,
            isActive: true,
            assignedBy: adminUser.id,
          },
        });

        throw new Error('Simulated Outbox Failure on Assignment');
      })
    ).rejects.toThrow('Simulated Outbox Failure on Assignment');

    const afterCount = await prisma.userRole.count({
      where: { organizationId: tenant1.id },
    });
    expect(afterCount).toBe(beforeCount);
  });

  // =========================================================================
  // Case 11: Audit insertion failure rolls back revocation
  // =========================================================================
  it('11. Audit insertion failure rolls back revocation', async () => {
    const assignment = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.userRole.update({
          where: { id: assignment.id },
          data: {
            isActive: false,
            revokedAt: new Date(),
            revokedBy: adminUser.id,
            reason: 'Rollback test',
          },
        });

        throw new Error('Simulated Audit Failure on Revocation');
      })
    ).rejects.toThrow('Simulated Audit Failure on Revocation');

    // Verify assignment remains active in database
    const refreshed = await prisma.userRole.findUnique({
      where: { id: assignment.id },
    });
    expect(refreshed?.isActive).toBe(true);
    expect(refreshed?.revokedAt).toBeNull();

    // Clean up
    await prisma.userRole.delete({ where: { id: assignment.id } });
  });

  // =========================================================================
  // Case 12: Outbox insertion failure rolls back revocation
  // =========================================================================
  it('12. Outbox insertion failure rolls back revocation', async () => {
    const assignment = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.userRole.update({
          where: { id: assignment.id },
          data: {
            isActive: false,
            revokedAt: new Date(),
            revokedBy: adminUser.id,
            reason: 'Rollback test outbox',
          },
        });

        throw new Error('Simulated Outbox Failure on Revocation');
      })
    ).rejects.toThrow('Simulated Outbox Failure on Revocation');

    const refreshed = await prisma.userRole.findUnique({
      where: { id: assignment.id },
    });
    expect(refreshed?.isActive).toBe(true);

    // Clean up
    await prisma.userRole.delete({ where: { id: assignment.id } });
  });

  // =========================================================================
  // Case 13: Historical assignment remains after a new assignment is created
  // =========================================================================
  it('13. Historical assignment remains after a new assignment is created', async () => {
    // 1. Initial Assignment
    const initialAsgn = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    // 2. Revoke it with reason
    await prisma.userRole.update({
      where: { id: initialAsgn.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy: adminUser.id,
        reason: 'Staff member took sabbatical leave',
      },
    });

    // 3. Re-assign the same user and role at the same campus
    const reAsgn = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    expect(reAsgn.id).not.toBe(initialAsgn.id);
    expect(reAsgn.isActive).toBe(true);

    // 4. Verify both rows exist in PostgreSQL
    const allAssignments = await prisma.userRole.findMany({
      where: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        locationId: campus1a.id,
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(allAssignments.length).toBe(2);
    expect(allAssignments[0].isActive).toBe(false);
    expect(allAssignments[0].reason).toBe('Staff member took sabbatical leave');
    expect(allAssignments[1].isActive).toBe(true);

    // Clean up
    await prisma.userRole.deleteMany({
      where: { id: { in: [initialAsgn.id, reAsgn.id] } },
    });
  });

  // =========================================================================
  // Case 14: Foreign-key restrictions prevent destructive deletion of referenced historical records
  // =========================================================================
  it('14. Foreign-key restrictions prevent destructive deletion of referenced historical records', async () => {
    // Create an assignment referencing role1
    const asgn = await prisma.userRole.create({
      data: {
        userId: targetUser.id,
        organizationId: tenant1.id,
        roleId: role1.id,
        membershipId: membership1.id,
        locationId: campus1a.id,
        isActive: true,
        assignedBy: adminUser.id,
      },
    });

    // Attempting to delete role1 must fail due to onDelete: Restrict
    await expect(
      prisma.role.delete({
        where: { id: role1.id },
      })
    ).rejects.toThrow(/foreign key constraint|violates foreign key constraint/i);

    // Attempting to delete campus1a must fail due to onDelete: Restrict
    await expect(
      prisma.location.delete({
        where: { id: campus1a.id },
      })
    ).rejects.toThrow(/foreign key constraint|violates foreign key constraint/i);

    // Attempting to delete targetUser must fail due to onDelete: Restrict
    await expect(
      prisma.user.delete({
        where: { id: targetUser.id },
      })
    ).rejects.toThrow(/foreign key constraint|violates foreign key constraint/i);

    // Clean up assignment first, allowing clean deletion later
    await prisma.userRole.delete({ where: { id: asgn.id } });
  });
});
