import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/core/security/password';
import { seedRbacCatalog } from '../src/database/seeds/rbac.seed';

const prisma = new PrismaClient();

const ALL_MODULES = [
  'ACADEMICS',
  'STUDENTS',
  'ATTENDANCE',
  'FEES',
  'STAFF',
  'EXAMS',
  'FRONT_OFFICE',
  'TIMETABLE',
  'TRANSPORT',
  'LIBRARY',
  'HOSTEL',
  'SETTINGS',
] as const;

async function main() {
  console.log('🚀 Starting Enterprise Database Seeding (Phase 1 & Phase 2)...');

  // =========================================================================
  // 1. SEED PLATFORM SUPER ADMIN (Phase 1)
  // =========================================================================
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@erp.com').trim().toLowerCase();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD?.trim() || 'Admin@123';
  const hashedPassword = await hashPassword(superAdminPassword);

  let superAdmin = await prisma.user.findFirst({
    where: {
      OR: [{ email: superAdminEmail }, { userType: 'PLATFORM' }],
    },
  });

  if (superAdmin) {
    superAdmin = await prisma.user.update({
      where: { id: superAdmin.id },
      data: {
        email: superAdminEmail,
        passwordHash: hashedPassword,
        isActive: true,
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    console.log(`✅ [Seed] Synchronized Platform Super Admin credentials: ${superAdmin.email}`);
  } else {
    superAdmin = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: hashedPassword,
        firstName: 'Platform',
        lastName: 'SuperAdmin',
        userType: 'PLATFORM',
        isActive: true,
        mustChangePassword: false,
        tokenVersion: 1,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: superAdmin.id,
        action: 'PLATFORM_SUPERADMIN_BOOTSTRAPPED',
        entity: 'User',
        entityId: superAdmin.id,
        newState: {
          email: superAdminEmail,
          userType: 'PLATFORM',
          mustChangePassword: false,
          bootstrappedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`✅ [Seed] Platform Super Admin created: ${superAdmin.email}`);
  }

  // =========================================================================
  // 2. SEED REFERENCE TENANT: GREENWOOD TRUST (Phase 2)
  // =========================================================================
  const orgDelegate = (prisma as any).organization;
  const locDelegate = (prisma as any).location;
  const modDelegate = (prisma as any).organizationModule;
  const memDelegate = (prisma as any).organizationMembership;

  if (orgDelegate) {
    const orgCode = 'GREENWOOD-TRUST';
    let greenwoodOrg = await orgDelegate.findUnique({
      where: { code: orgCode },
    });

    if (!greenwoodOrg) {
      greenwoodOrg = await orgDelegate.create({
        data: {
          code: orgCode,
          legalName: 'Greenwood Educational Trust',
          displayName: 'Greenwood International Academy',
          organizationType: 'K12_SCHOOL_CHAIN',
          status: 'ACTIVE',
          email: 'contact@greenwood.edu',
          phone: '+91 80 2345 6789',
          website: 'https://greenwood.edu',
          addressLine1: 'Survey 45/1, Varthur Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'IN',
          postalCode: '560087',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          subscriptionPlan: 'ENTERPRISE',
          maxLocations: 10,
          maxUsers: 1000,
          maxStudents: 5000,
        },
      });
      console.log(
        `✅ [Seed] Created reference organization: ${greenwoodOrg.displayName} (${greenwoodOrg.code})`
      );
    } else {
      console.log(`ℹ️ [Seed] Reference organization ${greenwoodOrg.code} already exists.`);
    }

    // 2.1 Seed Campuses
    const campuses = [
      {
        code: 'GREENWOOD-MAIN',
        name: 'Main Campus - Whitefield',
        locationType: 'MAIN_CAMPUS',
        isMainCampus: true,
        addressLine1: 'Survey 45/1, Varthur Road, Whitefield',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560087',
      },
      {
        code: 'GREENWOOD-NORTH',
        name: 'North Campus - Yelahanka',
        locationType: 'BRANCH_CAMPUS',
        isMainCampus: false,
        addressLine1: 'Plot 12, Kogilu Main Road, Yelahanka',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560064',
      },
    ];

    for (const campus of campuses) {
      const existing = await locDelegate.findUnique({
        where: {
          organizationId_code: {
            organizationId: greenwoodOrg.id,
            code: campus.code,
          },
        },
      });

      if (!existing) {
        await locDelegate.create({
          data: {
            organizationId: greenwoodOrg.id,
            code: campus.code,
            name: campus.name,
            locationType: campus.locationType,
            isMainCampus: campus.isMainCampus,
            isActive: true,
            addressLine1: campus.addressLine1,
            city: campus.city,
            state: campus.state,
            country: 'IN',
            postalCode: campus.postalCode,
          },
        });
        console.log(`✅ [Seed] Created campus: ${campus.name} (${campus.code})`);
      }
    }

    // 2.2 Seed Module Subscriptions (All 12 Modules)
    for (const moduleId of ALL_MODULES) {
      const existing = await modDelegate.findUnique({
        where: {
          organizationId_moduleId: {
            organizationId: greenwoodOrg.id,
            moduleId,
          },
        },
      });

      if (!existing) {
        await modDelegate.create({
          data: {
            organizationId: greenwoodOrg.id,
            moduleId,
            isEnabled: true,
          },
        });
      }
    }
    console.log(`✅ [Seed] Subscribed Greenwood Trust to all 12 educational modules.`);

    // 2.3 Seed Demo Tenant Admin (OWNER)
    const orgAdminEmail = (process.env.SEED_ORG_ADMIN_EMAIL || 'orgadmin@greenwood.edu').trim().toLowerCase();
    const orgAdminPassword =
      process.env.SEED_ORG_ADMIN_PASSWORD?.trim() ||
      process.env.SUPER_ADMIN_PASSWORD?.trim() ||
      'Admin@123';
    const hashedAdminPass = await hashPassword(orgAdminPassword);

    let orgAdminUser = await prisma.user.findUnique({
      where: { email: orgAdminEmail },
    });

    if (orgAdminUser) {
      orgAdminUser = await prisma.user.update({
        where: { id: orgAdminUser.id },
        data: {
          passwordHash: hashedAdminPass,
          isActive: true,
          mustChangePassword: false,
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      console.log(`✅ [Seed] Synchronized Demo Tenant Admin credentials: ${orgAdminUser.email}`);
    } else {
      orgAdminUser = await prisma.user.create({
        data: {
          email: orgAdminEmail,
          passwordHash: hashedAdminPass,
          firstName: 'Eleanor',
          lastName: 'Vance',
          userType: 'TENANT',
          isActive: true,
          mustChangePassword: false,
          tokenVersion: 1,
        },
      });
      console.log(`✅ [Seed] Created Demo Tenant Admin: ${orgAdminUser.email}`);
    }

    // Link Tenant Admin to Greenwood Trust as OWNER
    const existingMembership = await memDelegate.findUnique({
      where: {
        userId_organizationId: {
          userId: orgAdminUser.id,
          organizationId: greenwoodOrg.id,
        },
      },
    });

    if (!existingMembership) {
      await memDelegate.create({
        data: {
          userId: orgAdminUser.id,
          organizationId: greenwoodOrg.id,
          accessLevel: 'OWNER',
          membershipType: 'STAFF',
          status: 'ACTIVE',
          jobTitle: 'Superintendent / Trust Director',
          department: 'Executive Governance',
          isPrimary: true,
        },
      });
      console.log(`✅ [Seed] Linked ${orgAdminUser.email} as OWNER of ${greenwoodOrg.displayName}`);
    }

    // =========================================================================
    // 3. SEED CANONICAL PERMISSION TREE & SYSTEM ROLE TEMPLATES (Phase 3)
    // =========================================================================
    await seedRbacCatalog(prisma);

    console.log('\n================================================================');
    console.log('🔑 SEEDED CREDENTIALS SUMMARY');
    console.log('================================================================');
    console.log('1. Platform Super Admin:');
    console.log(`   Email:        ${superAdminEmail}`);
    console.log(`   Password:     ${superAdminPassword}`);
    console.log('');
    console.log('2. Demo Tenant Owner (Greenwood Trust):');
    console.log(`   Email:        ${orgAdminEmail}`);
    console.log(`   Password:     ${orgAdminPassword}`);
    console.log(`   Organization: ${greenwoodOrg.displayName} (${greenwoodOrg.code})`);
    console.log(`   Access Level: OWNER`);
    console.log('================================================================\n');
  }

  console.log('✨ Enterprise Seeding Complete!\n');
}

main()
  .catch((e) => {
    console.error('❌ [Seed] Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
