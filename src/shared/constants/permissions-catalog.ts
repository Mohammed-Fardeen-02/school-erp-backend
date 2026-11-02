import { NodeType } from '@prisma/client';

export interface PermissionNodeDefinition {
  nodeCode: string;
  nodeName: string;
  nodeType: NodeType;
  nodeLevel: number;
  displayOrder: number;
  description: string;
  parentCode?: string;
  children?: PermissionNodeDefinition[];
}

export interface SystemRoleTemplateDefinition {
  roleCode: string;
  roleName: string;
  description: string;
  /**
   * Node codes or prefix patterns granted to this role.
   * If a parent node is listed (e.g. "academics"), all descendants inherit access.
   * Specific node codes can also be listed directly.
   */
  grantedNodeCodes: string[];
}

/**
 * Canonical Modular Permission Tree for all 12 School ERP Modules.
 * Hierarchy: MODULE (Level 1) -> SECTION (Level 2) -> FEATURE (Level 3) -> ACTION (Level 4).
 */
export const CANONICAL_PERMISSION_TREE: PermissionNodeDefinition[] = [
  // ==========================================
  // 1. ACADEMICS
  // ==========================================
  {
    nodeCode: 'academics',
    nodeName: 'Academics & Curriculum',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 1,
    description: 'Academic curriculum, course syllabi, class sections, subjects, and lesson planning',
    children: [
      {
        nodeCode: 'academics.curriculum',
        nodeName: 'Curriculum & Syllabi',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Manage academic courses, programs, and curriculum standards',
        children: [
          {
            nodeCode: 'academics.curriculum.courses',
            nodeName: 'Courses & Programs',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Course structures and syllabi',
            children: [
              {
                nodeCode: 'academics.curriculum.courses.view',
                nodeName: 'View Courses',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view academic courses and curricula',
              },
              {
                nodeCode: 'academics.curriculum.courses.manage',
                nodeName: 'Manage Courses',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create, edit, and archive academic courses and syllabus structures',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'academics.classes',
        nodeName: 'Classes & Grade Levels',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Institutional grade levels and graduation criteria',
        children: [
          {
            nodeCode: 'academics.classes.grades',
            nodeName: 'Grade Level Management',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Grade levels and standard progression',
            children: [
              {
                nodeCode: 'academics.classes.grades.view',
                nodeName: 'View Classes',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view academic classes and grade levels',
              },
              {
                nodeCode: 'academics.classes.grades.manage',
                nodeName: 'Manage Classes',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to configure grade levels and graduation criteria',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'academics.sections',
        nodeName: 'Class Sections',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Class sections and student allocations',
        children: [
          {
            nodeCode: 'academics.sections.allocations',
            nodeName: 'Section Allocations',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Class sections and homeroom teachers',
            children: [
              {
                nodeCode: 'academics.sections.allocations.view',
                nodeName: 'View Sections',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view class sections and student rosters',
              },
              {
                nodeCode: 'academics.sections.allocations.manage',
                nodeName: 'Manage Sections',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create sections and assign homeroom teachers',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'academics.subjects',
        nodeName: 'Subjects & Faculty',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Curriculum subjects and faculty assignments',
        children: [
          {
            nodeCode: 'academics.subjects.assignments',
            nodeName: 'Subject Assignments',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Curriculum subjects and teacher allocations',
            children: [
              {
                nodeCode: 'academics.subjects.assignments.view',
                nodeName: 'View Subjects',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view curriculum subjects and syllabus outlines',
              },
              {
                nodeCode: 'academics.subjects.assignments.manage',
                nodeName: 'Manage Subjects',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to assign subjects to classes and faculty members',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'academics.lesson_plans',
        nodeName: 'Lesson Planning',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 5,
        description: 'Weekly lesson plans and syllabus progress',
        children: [
          {
            nodeCode: 'academics.lesson_plans.planner',
            nodeName: 'Lesson Planner',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Faculty lesson planning and tracking',
            children: [
              {
                nodeCode: 'academics.lesson_plans.planner.view',
                nodeName: 'View Lesson Plans',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view teacher lesson plans and academic syllabus progress',
              },
              {
                nodeCode: 'academics.lesson_plans.planner.manage',
                nodeName: 'Manage Lesson Plans',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create, submit, and approve weekly lesson plans',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 2. STUDENTS
  // ==========================================
  {
    nodeCode: 'students',
    nodeName: 'Students & Admissions',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 2,
    description: 'Admissions inquiries, enrollments, student profiles, documents, and alumni records',
    children: [
      {
        nodeCode: 'students.admissions',
        nodeName: 'Admissions & Inquiries',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'New admission inquiries and enrollment processing',
        children: [
          {
            nodeCode: 'students.admissions.inquiries',
            nodeName: 'Inquiries & Applications',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Admission applications workflow',
            children: [
              {
                nodeCode: 'students.admissions.inquiries.view',
                nodeName: 'View Applications',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view student admission inquiries and application forms',
              },
              {
                nodeCode: 'students.admissions.inquiries.create',
                nodeName: 'Create Application',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to register a new admission inquiry or application',
              },
              {
                nodeCode: 'students.admissions.inquiries.enroll',
                nodeName: 'Enroll Applicant',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to approve application and formally enroll student into the institution',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'students.profiles',
        nodeName: 'Student Directory',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Student census, biodata, and guardian details',
        children: [
          {
            nodeCode: 'students.profiles.records',
            nodeName: 'Student Information Records',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student profile management',
            children: [
              {
                nodeCode: 'students.profiles.records.view',
                nodeName: 'View Student Directory',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view student directory and detailed student profiles',
              },
              {
                nodeCode: 'students.profiles.records.create',
                nodeName: 'Add Student Profile',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create a new student record directly',
              },
              {
                nodeCode: 'students.profiles.records.edit',
                nodeName: 'Edit Student Profile',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to update student biodata, address, and guardian information',
              },
              {
                nodeCode: 'students.profiles.records.export',
                nodeName: 'Export Student Records',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 4,
                description: 'Allow user to export student census rosters and statistical reports',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'students.documents',
        nodeName: 'Identity & Certificates',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Legal documents, birth certificates, and identity verification',
        children: [
          {
            nodeCode: 'students.documents.repository',
            nodeName: 'Student Documents',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Uploaded student documentation',
            children: [
              {
                nodeCode: 'students.documents.repository.view',
                nodeName: 'View Student Documents',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to inspect uploaded student documents and certificates',
              },
              {
                nodeCode: 'students.documents.repository.upload',
                nodeName: 'Upload Documents',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to upload student identity documents and academic transcripts',
              },
              {
                nodeCode: 'students.documents.repository.verify',
                nodeName: 'Verify Documents',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to mark submitted student documents as legally verified',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'students.transfers',
        nodeName: 'Transfers & Alumni',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Transfer certificates and student graduation',
        children: [
          {
            nodeCode: 'students.transfers.certificates',
            nodeName: 'Transfer Certificates (TC)',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student departures and TC generation',
            children: [
              {
                nodeCode: 'students.transfers.certificates.view',
                nodeName: 'View Transfer Requests',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view student withdrawal requests and transfer applications',
              },
              {
                nodeCode: 'students.transfers.certificates.issue',
                nodeName: 'Issue Transfer Certificate',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to issue an official Transfer Certificate and archive student record',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 3. ATTENDANCE
  // ==========================================
  {
    nodeCode: 'attendance',
    nodeName: 'Attendance & Registers',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 3,
    description: 'Daily student rosters, biometric staff logs, leave tracking, and absence analytics',
    children: [
      {
        nodeCode: 'attendance.student_daily',
        nodeName: 'Student Daily Roster',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Classroom daily attendance recording',
        children: [
          {
            nodeCode: 'attendance.student_daily.roster',
            nodeName: 'Classroom Register',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Daily period and day attendance',
            children: [
              {
                nodeCode: 'attendance.student_daily.roster.view',
                nodeName: 'View Student Attendance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view classroom attendance registers and statistics',
              },
              {
                nodeCode: 'attendance.student_daily.roster.mark',
                nodeName: 'Mark Attendance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to record daily or period student attendance',
              },
              {
                nodeCode: 'attendance.student_daily.roster.edit',
                nodeName: 'Correct Attendance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to edit or correct historical attendance entries',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'attendance.student_leave',
        nodeName: 'Student Leave',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Medical and personal leave requests for students',
        children: [
          {
            nodeCode: 'attendance.student_leave.requests',
            nodeName: 'Leave Requests',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student leave processing',
            children: [
              {
                nodeCode: 'attendance.student_leave.requests.view',
                nodeName: 'View Leave Requests',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view student leave applications',
              },
              {
                nodeCode: 'attendance.student_leave.requests.apply',
                nodeName: 'Apply for Leave',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to submit student leave request',
              },
              {
                nodeCode: 'attendance.student_leave.requests.approve',
                nodeName: 'Approve Leave',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to approve or reject student leave requests',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'attendance.staff_daily',
        nodeName: 'Staff Attendance',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Biometric and manual staff attendance logging',
        children: [
          {
            nodeCode: 'attendance.staff_daily.register',
            nodeName: 'Staff Attendance Register',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Faculty and staff logs',
            children: [
              {
                nodeCode: 'attendance.staff_daily.register.view',
                nodeName: 'View Staff Attendance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view staff attendance and biometric logs',
              },
              {
                nodeCode: 'attendance.staff_daily.register.mark',
                nodeName: 'Mark Staff Attendance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to record or reconcile staff attendance entries',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'attendance.reports',
        nodeName: 'Attendance Analytics',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Attendance analytics and export reports',
        children: [
          {
            nodeCode: 'attendance.reports.analytics',
            nodeName: 'Absence Analytics & Reports',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Attendance statistics and chronic absenteeism',
            children: [
              {
                nodeCode: 'attendance.reports.analytics.view',
                nodeName: 'View Attendance Analytics',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view institutional attendance analytics and summaries',
              },
              {
                nodeCode: 'attendance.reports.analytics.export',
                nodeName: 'Export Attendance Reports',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to export monthly attendance registers and chronic defaulter lists',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 4. FEES
  // ==========================================
  {
    nodeCode: 'fees',
    nodeName: 'Fees & Finance',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 4,
    description: 'Fee structures, student invoices, cashiering payments, discounts, and defaulter tracking',
    children: [
      {
        nodeCode: 'fees.structures',
        nodeName: 'Fee Structures',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Fee heads, installment slabs, and late fine policies',
        children: [
          {
            nodeCode: 'fees.structures.templates',
            nodeName: 'Fee Templates & Heads',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Institutional fee structure definition',
            children: [
              {
                nodeCode: 'fees.structures.templates.view',
                nodeName: 'View Fee Structures',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view fee heads, installment terms, and policies',
              },
              {
                nodeCode: 'fees.structures.templates.manage',
                nodeName: 'Manage Fee Structures',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create and configure fee structures and late fee rules',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'fees.invoices',
        nodeName: 'Billing & Invoices',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Student fee invoicing and voiding',
        children: [
          {
            nodeCode: 'fees.invoices.billing',
            nodeName: 'Invoice Generation',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student invoice batches and billing',
            children: [
              {
                nodeCode: 'fees.invoices.billing.view',
                nodeName: 'View Fee Invoices',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view student fee invoices and billing ledgers',
              },
              {
                nodeCode: 'fees.invoices.billing.generate',
                nodeName: 'Generate Invoices',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to generate term or monthly fee invoices for student cohorts',
              },
              {
                nodeCode: 'fees.invoices.billing.void',
                nodeName: 'Void Invoice',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to void, cancel, or dispute fee invoices with mandatory audit remark',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'fees.payments',
        nodeName: 'Payments & Cashiering',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Payment collection, receipt generation, and refunds',
        children: [
          {
            nodeCode: 'fees.payments.collections',
            nodeName: 'Payment Transactions',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Receipts and cash collections',
            children: [
              {
                nodeCode: 'fees.payments.collections.view',
                nodeName: 'View Payments',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view payment history, transaction records, and receipt logs',
              },
              {
                nodeCode: 'fees.payments.collections.collect',
                nodeName: 'Collect Fee Payment',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to record offline/online fee payments and issue official receipts',
              },
              {
                nodeCode: 'fees.payments.collections.refund',
                nodeName: 'Refund Payment',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to process fee refunds or adjustment credit notes',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'fees.discounts',
        nodeName: 'Scholarships & Concessions',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Fee waivers, sibling discounts, and scholarships',
        children: [
          {
            nodeCode: 'fees.discounts.waivers',
            nodeName: 'Fee Waivers & Scholarships',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Concession schemes',
            children: [
              {
                nodeCode: 'fees.discounts.waivers.view',
                nodeName: 'View Scholarships',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view scholarship schemes and approved fee concessions',
              },
              {
                nodeCode: 'fees.discounts.waivers.approve',
                nodeName: 'Approve Concessions',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to approve sibling discounts, merit scholarships, or hardship waivers',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'fees.defaulters',
        nodeName: 'Dues & Defaulters',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 5,
        description: 'Outstanding dues and payment reminder alerts',
        children: [
          {
            nodeCode: 'fees.defaulters.aging',
            nodeName: 'Defaulter Reports & Alerts',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Aging reports and automated notices',
            children: [
              {
                nodeCode: 'fees.defaulters.aging.view',
                nodeName: 'View Defaulters',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view fee defaulters roster and aging debt reports',
              },
              {
                nodeCode: 'fees.defaulters.aging.notify',
                nodeName: 'Send Dues Reminders',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to send automated payment reminder SMS and email alerts',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 5. STAFF
  // ==========================================
  {
    nodeCode: 'staff',
    nodeName: 'Staff & Human Resources',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 5,
    description: 'Faculty and staff directory, departments, designations, payroll, and leave management',
    children: [
      {
        nodeCode: 'staff.directory',
        nodeName: 'Staff Directory',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Employee profiles and onboarding',
        children: [
          {
            nodeCode: 'staff.directory.records',
            nodeName: 'Staff Records',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Faculty and staff member records',
            children: [
              {
                nodeCode: 'staff.directory.records.view',
                nodeName: 'View Staff Directory',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view faculty and administrative staff directory',
              },
              {
                nodeCode: 'staff.directory.records.create',
                nodeName: 'Onboard Staff',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to onboard and register a new employee record',
              },
              {
                nodeCode: 'staff.directory.records.edit',
                nodeName: 'Edit Staff Profile',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to update staff biodata, department, and contact details',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'staff.departments',
        nodeName: 'Departments & Hierarchy',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Organizational departments and designations',
        children: [
          {
            nodeCode: 'staff.departments.hierarchy',
            nodeName: 'Institutional Hierarchy',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Designations and hierarchy levels',
            children: [
              {
                nodeCode: 'staff.departments.hierarchy.view',
                nodeName: 'View Departments',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view departments and staff designation structures',
              },
              {
                nodeCode: 'staff.departments.hierarchy.manage',
                nodeName: 'Manage Departments',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create and configure departments and designation levels',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'staff.payroll',
        nodeName: 'Payroll & Compensation',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Salary structures and payslip generation',
        children: [
          {
            nodeCode: 'staff.payroll.processing',
            nodeName: 'Salary Processing',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Monthly payroll runs',
            children: [
              {
                nodeCode: 'staff.payroll.processing.view',
                nodeName: 'View Payroll',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view payroll summaries and salary structures',
              },
              {
                nodeCode: 'staff.payroll.processing.generate',
                nodeName: 'Process Payroll',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to run monthly payroll calculation and issue payslips',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'staff.leaves',
        nodeName: 'Staff Leaves',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Staff leave applications and approvals',
        children: [
          {
            nodeCode: 'staff.leaves.management',
            nodeName: 'Staff Leave Processing',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Leave balances and requests',
            children: [
              {
                nodeCode: 'staff.leaves.management.view',
                nodeName: 'View Staff Leaves',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view staff leave balances and applications',
              },
              {
                nodeCode: 'staff.leaves.management.apply',
                nodeName: 'Apply for Staff Leave',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to submit staff leave request',
              },
              {
                nodeCode: 'staff.leaves.management.approve',
                nodeName: 'Approve Staff Leave',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to approve or reject staff leave requests',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 6. EXAMS
  // ==========================================
  {
    nodeCode: 'exams',
    nodeName: 'Examinations & Grading',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 6,
    description: 'Exam scheduling, grading scales, marks entry, report card generation, and result publication',
    children: [
      {
        nodeCode: 'exams.schedules',
        nodeName: 'Exam Schedules',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Examination dates and room allocations',
        children: [
          {
            nodeCode: 'exams.schedules.planning',
            nodeName: 'Exam Planning',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Exam timetable and seating',
            children: [
              {
                nodeCode: 'exams.schedules.planning.view',
                nodeName: 'View Exam Schedules',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view examination timetables and seating plans',
              },
              {
                nodeCode: 'exams.schedules.planning.manage',
                nodeName: 'Manage Exam Schedules',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to schedule examination dates, rooms, and invigilation duties',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'exams.grade_scales',
        nodeName: 'Grading Systems',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'GPA rules and percentage-to-grade mappings',
        children: [
          {
            nodeCode: 'exams.grade_scales.rules',
            nodeName: 'Grade Scales & Slabs',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Grading scale configuration',
            children: [
              {
                nodeCode: 'exams.grade_scales.rules.view',
                nodeName: 'View Grade Scales',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view institutional grading scales and pass criteria',
              },
              {
                nodeCode: 'exams.grade_scales.rules.manage',
                nodeName: 'Manage Grade Scales',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to configure grading scales and assessment weightages',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'exams.marks_entry',
        nodeName: 'Marks Entry & Evaluation',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Faculty marks entry and grade locking',
        children: [
          {
            nodeCode: 'exams.marks_entry.assessments',
            nodeName: 'Subject Marks Entry',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Marks entry sheets',
            children: [
              {
                nodeCode: 'exams.marks_entry.assessments.view',
                nodeName: 'View Assessment Marks',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view score sheets and entered marks',
              },
              {
                nodeCode: 'exams.marks_entry.assessments.input',
                nodeName: 'Input Exam Marks',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to enter student assessment marks for assigned subjects',
              },
              {
                nodeCode: 'exams.marks_entry.assessments.lock',
                nodeName: 'Lock Assessment Marks',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to finalize and lock exam marks to prevent alterations',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'exams.report_cards',
        nodeName: 'Report Cards & Results',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Report card generation and public result publication',
        children: [
          {
            nodeCode: 'exams.report_cards.generation',
            nodeName: 'Report Card Generation',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student transcripts and report cards',
            children: [
              {
                nodeCode: 'exams.report_cards.generation.view',
                nodeName: 'View Report Cards',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view student report cards and term transcripts',
              },
              {
                nodeCode: 'exams.report_cards.generation.generate',
                nodeName: 'Generate Report Cards',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to generate official PDF report cards with institutional seal',
              },
              {
                nodeCode: 'exams.report_cards.generation.publish',
                nodeName: 'Publish Exam Results',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to publish final examination results to students and parents',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 7. FRONT_OFFICE
  // ==========================================
  {
    nodeCode: 'front_office',
    nodeName: 'Front Office & Reception',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 7,
    description: 'Visitor pass logs, telephone calls, postal dispatches, and parent grievances',
    children: [
      {
        nodeCode: 'front_office.visitor_book',
        nodeName: 'Visitor Management',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Visitor badges and check-ins',
        children: [
          {
            nodeCode: 'front_office.visitor_book.logs',
            nodeName: 'Visitor Logs',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Gate pass logs and visitors',
            children: [
              {
                nodeCode: 'front_office.visitor_book.logs.view',
                nodeName: 'View Visitor Logs',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view visitor records and check-in history',
              },
              {
                nodeCode: 'front_office.visitor_book.logs.create',
                nodeName: 'Issue Visitor Pass',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to issue visitor gate passes and log visits',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'front_office.phone_logs',
        nodeName: 'Call & Dispatch Logs',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Telephone records and postal mail dispatch',
        children: [
          {
            nodeCode: 'front_office.phone_logs.records',
            nodeName: 'Communications & Courier',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Incoming/outgoing records',
            children: [
              {
                nodeCode: 'front_office.phone_logs.records.view',
                nodeName: 'View Call & Mail Logs',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view telephone logs and postal dispatch records',
              },
              {
                nodeCode: 'front_office.phone_logs.records.manage',
                nodeName: 'Manage Call & Mail Logs',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to record incoming/outgoing telephone calls and courier dispatches',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'front_office.grievances',
        nodeName: 'Grievances & Inquiries',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Parent feedback and complaint tracking',
        children: [
          {
            nodeCode: 'front_office.grievances.tickets',
            nodeName: 'Complaints & Inquiries',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Grievance ticket management',
            children: [
              {
                nodeCode: 'front_office.grievances.tickets.view',
                nodeName: 'View Grievances',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view parent feedback and complaint tickets',
              },
              {
                nodeCode: 'front_office.grievances.tickets.manage',
                nodeName: 'Resolve Grievance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to register grievances, assign staff resolvers, and log resolutions',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 8. TIMETABLE
  // ==========================================
  {
    nodeCode: 'timetable',
    nodeName: 'Timetables & Scheduling',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 8,
    description: 'Class routines, teacher period allocations, and daily teacher proxy substitutions',
    children: [
      {
        nodeCode: 'timetable.class_schedules',
        nodeName: 'Class Schedules',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Class routines and period timetables',
        children: [
          {
            nodeCode: 'timetable.class_schedules.grids',
            nodeName: 'Class Routine Grids',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Weekly period grids',
            children: [
              {
                nodeCode: 'timetable.class_schedules.grids.view',
                nodeName: 'View Class Routines',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view class routines and period schedules',
              },
              {
                nodeCode: 'timetable.class_schedules.grids.manage',
                nodeName: 'Manage Class Routines',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to configure period slots, break times, and class timetables',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'timetable.teacher_allocations',
        nodeName: 'Teacher Allocations',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Teacher workload and period assignments',
        children: [
          {
            nodeCode: 'timetable.teacher_allocations.workload',
            nodeName: 'Teacher Workload',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Faculty scheduling',
            children: [
              {
                nodeCode: 'timetable.teacher_allocations.workload.view',
                nodeName: 'View Teacher Schedules',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view teacher period assignments and weekly workloads',
              },
              {
                nodeCode: 'timetable.teacher_allocations.workload.manage',
                nodeName: 'Manage Teacher Schedules',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to balance teacher workload and assign subject periods',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'timetable.substitutions',
        nodeName: 'Substitutions & Proxies',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Daily proxy allocations for absent teachers',
        children: [
          {
            nodeCode: 'timetable.substitutions.daily',
            nodeName: 'Daily Substitutions',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Proxy assignments',
            children: [
              {
                nodeCode: 'timetable.substitutions.daily.view',
                nodeName: 'View Daily Substitutions',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view daily proxy lists and teacher substitutions',
              },
              {
                nodeCode: 'timetable.substitutions.daily.assign',
                nodeName: 'Assign Proxy Teacher',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to assign substitute faculty to cover absent teachers periods',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 9. TRANSPORT
  // ==========================================
  {
    nodeCode: 'transport',
    nodeName: 'Transport & Fleet',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 9,
    description: 'Fleet maintenance, bus routes, pickup stops, and student transport passes',
    children: [
      {
        nodeCode: 'transport.vehicles',
        nodeName: 'Vehicles & Fleet',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'School bus fleet and maintenance',
        children: [
          {
            nodeCode: 'transport.vehicles.fleet',
            nodeName: 'Bus Fleet',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Vehicle maintenance and documents',
            children: [
              {
                nodeCode: 'transport.vehicles.fleet.view',
                nodeName: 'View Vehicles',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view school buses, registration, and fitness certificates',
              },
              {
                nodeCode: 'transport.vehicles.fleet.manage',
                nodeName: 'Manage Vehicles',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to register vehicles and record fuel and maintenance logs',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'transport.routes',
        nodeName: 'Routes & Stops',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Bus routes, pickup stops, and schedules',
        children: [
          {
            nodeCode: 'transport.routes.stops',
            nodeName: 'Bus Routes & Stops',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Routes and pickup points',
            children: [
              {
                nodeCode: 'transport.routes.stops.view',
                nodeName: 'View Routes & Stops',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view transport routes, pickup stops, and timings',
              },
              {
                nodeCode: 'transport.routes.stops.manage',
                nodeName: 'Manage Routes & Stops',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create bus routes, assign stops, and map GPS waypoints',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'transport.allocations',
        nodeName: 'Student Allocations',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Student route assignments and bus passes',
        children: [
          {
            nodeCode: 'transport.allocations.riders',
            nodeName: 'Student Transport Allocations',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student bus allocations',
            children: [
              {
                nodeCode: 'transport.allocations.riders.view',
                nodeName: 'View Transport Allocations',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view students allocated to bus routes and stops',
              },
              {
                nodeCode: 'transport.allocations.riders.assign',
                nodeName: 'Assign Bus Route',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to allocate students to bus routes and generate transport passes',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 10. LIBRARY
  // ==========================================
  {
    nodeCode: 'library',
    nodeName: 'Library & Catalog',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 10,
    description: 'Book cataloging, ISBN inventory, circulation checkouts/returns, and overdue fines',
    children: [
      {
        nodeCode: 'library.books',
        nodeName: 'Book Inventory',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'ISBN catalog and book accessioning',
        children: [
          {
            nodeCode: 'library.books.catalog',
            nodeName: 'Book Catalog',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Book titles and availability',
            children: [
              {
                nodeCode: 'library.books.catalog.view',
                nodeName: 'View Book Catalog',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to search library catalog, authors, and shelf availability',
              },
              {
                nodeCode: 'library.books.catalog.manage',
                nodeName: 'Manage Book Catalog',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to catalog new book titles, barcodes, and accession records',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'library.circulation',
        nodeName: 'Issue & Returns',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Circulation transactions and overdue tracking',
        children: [
          {
            nodeCode: 'library.circulation.transactions',
            nodeName: 'Book Circulation',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Issuing and returns',
            children: [
              {
                nodeCode: 'library.circulation.transactions.view',
                nodeName: 'View Circulation Logs',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view active book checkouts, overdue records, and return logs',
              },
              {
                nodeCode: 'library.circulation.transactions.issue',
                nodeName: 'Issue Book',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to checkout and issue a book to student or staff member',
              },
              {
                nodeCode: 'library.circulation.transactions.return',
                nodeName: 'Return Book',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to process returned books and assess condition penalties',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'library.fines',
        nodeName: 'Fines & Dues',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Overdue penalties and lost book charges',
        children: [
          {
            nodeCode: 'library.fines.penalties',
            nodeName: 'Library Overdue Fines',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Late dues collection',
            children: [
              {
                nodeCode: 'library.fines.penalties.view',
                nodeName: 'View Library Fines',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view overdue book penalties and lost book charges',
              },
              {
                nodeCode: 'library.fines.penalties.collect',
                nodeName: 'Collect Library Fine',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to collect or waive library overdue fines and replacement fees',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 11. HOSTEL
  // ==========================================
  {
    nodeCode: 'hostel',
    nodeName: 'Hostel & Housing',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 11,
    description: 'Hostel buildings, room allocations, student boarding, and mess dining attendance',
    children: [
      {
        nodeCode: 'hostel.buildings',
        nodeName: 'Buildings & Wings',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Hostel blocks and facility layout',
        children: [
          {
            nodeCode: 'hostel.buildings.infrastructure',
            nodeName: 'Hostel Infrastructure',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Building and wing layout',
            children: [
              {
                nodeCode: 'hostel.buildings.infrastructure.view',
                nodeName: 'View Buildings',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view hostel blocks, wings, and facility inventory',
              },
              {
                nodeCode: 'hostel.buildings.infrastructure.manage',
                nodeName: 'Manage Buildings',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to configure hostel blocks, floor layout, and room types',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'hostel.rooms',
        nodeName: 'Rooms & Beds',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Room inventory and student bed occupancy',
        children: [
          {
            nodeCode: 'hostel.rooms.occupancy',
            nodeName: 'Bed Allocations',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Student room allocations',
            children: [
              {
                nodeCode: 'hostel.rooms.occupancy.view',
                nodeName: 'View Room Occupancy',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view hostel vacancies and student bed allocations',
              },
              {
                nodeCode: 'hostel.rooms.occupancy.allocate',
                nodeName: 'Allocate Room Bed',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to assign student to hostel room bed and record check-in',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'hostel.mess',
        nodeName: 'Mess & Dining',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Hostel meal plans and dining attendance',
        children: [
          {
            nodeCode: 'hostel.mess.attendance',
            nodeName: 'Mess Attendance',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Dining meal logs',
            children: [
              {
                nodeCode: 'hostel.mess.attendance.view',
                nodeName: 'View Mess Attendance',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view meal plans and student dining attendance logs',
              },
              {
                nodeCode: 'hostel.mess.attendance.log',
                nodeName: 'Record Meal Log',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to check in student for breakfast, lunch, and dinner meals',
              },
            ],
          },
        ],
      },
    ],
  },

  // ==========================================
  // 12. SETTINGS
  // ==========================================
  {
    nodeCode: 'settings',
    nodeName: 'Institutional Settings & Governance',
    nodeType: 'MODULE',
    nodeLevel: 1,
    displayOrder: 12,
    description: 'Institution identity, branch campuses, dynamic roles, user permissions, and compliance audit trail',
    children: [
      {
        nodeCode: 'settings.organization_profile',
        nodeName: 'Organization Profile',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 1,
        description: 'Institution branding and academic year preferences',
        children: [
          {
            nodeCode: 'settings.organization_profile.identity',
            nodeName: 'Institution Branding',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Identity and branding details',
            children: [
              {
                nodeCode: 'settings.organization_profile.identity.view',
                nodeName: 'View Profile',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view institution legal profile, logo, and active academic year',
              },
              {
                nodeCode: 'settings.organization_profile.identity.edit',
                nodeName: 'Edit Profile',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to update institution contact details, logo, and brand theme',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'settings.campuses',
        nodeName: 'Campuses & Branches',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 2,
        description: 'Campus locations and principal assignments',
        children: [
          {
            nodeCode: 'settings.campuses.locations',
            nodeName: 'Branch Locations',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Campus branch management',
            children: [
              {
                nodeCode: 'settings.campuses.locations.view',
                nodeName: 'View Campuses',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view registered branch campuses and facility locations',
              },
              {
                nodeCode: 'settings.campuses.locations.manage',
                nodeName: 'Manage Campuses',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create and update campus branches, principal contact, and GPS coordinates',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'settings.roles_permissions',
        nodeName: 'Roles & Permissions',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 3,
        description: 'Dynamic roles and modular capability matrix configuration',
        children: [
          {
            nodeCode: 'settings.roles_permissions.rbac',
            nodeName: 'RBAC Matrix Management',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Role and capability matrix',
            children: [
              {
                nodeCode: 'settings.roles_permissions.rbac.view',
                nodeName: 'View Roles',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view system role templates and tenant custom roles',
              },
              {
                nodeCode: 'settings.roles_permissions.rbac.create',
                nodeName: 'Create Custom Role',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to create a new custom role or clone from a system template',
              },
              {
                nodeCode: 'settings.roles_permissions.rbac.edit',
                nodeName: 'Edit Role Permissions',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to configure role capability grants and edit role metadata',
              },
              {
                nodeCode: 'settings.roles_permissions.rbac.delete',
                nodeName: 'Delete Custom Role',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 4,
                description: 'Allow user to delete custom role when no active assignments exist',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'settings.user_assignments',
        nodeName: 'User Role Assignments',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 4,
        description: 'Assigning roles to staff and institution members',
        children: [
          {
            nodeCode: 'settings.user_assignments.allocations',
            nodeName: 'Staff Role Assignments',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'User role binding',
            children: [
              {
                nodeCode: 'settings.user_assignments.allocations.view',
                nodeName: 'View Role Assignments',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to view roles assigned to institution staff and members',
              },
              {
                nodeCode: 'settings.user_assignments.allocations.assign',
                nodeName: 'Assign Role to User',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to assign a role to user at organization-wide or campus scope',
              },
              {
                nodeCode: 'settings.user_assignments.allocations.revoke',
                nodeName: 'Revoke Role Assignment',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 3,
                description: 'Allow user to revoke a user role assignment with mandatory audit reason',
              },
            ],
          },
        ],
      },
      {
        nodeCode: 'settings.audit_logs',
        nodeName: 'Audit & Compliance',
        nodeType: 'SECTION',
        nodeLevel: 2,
        displayOrder: 5,
        description: 'Immutable security activity logs and compliance reports',
        children: [
          {
            nodeCode: 'settings.audit_logs.trail',
            nodeName: 'Security Audit Trail',
            nodeType: 'FEATURE',
            nodeLevel: 3,
            displayOrder: 1,
            description: 'Immutable activity records',
            children: [
              {
                nodeCode: 'settings.audit_logs.trail.view',
                nodeName: 'View Audit Trail',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 1,
                description: 'Allow user to inspect security activity and administrative audit logs',
              },
              {
                nodeCode: 'settings.audit_logs.trail.export',
                nodeName: 'Export Audit Logs',
                nodeType: 'ACTION',
                nodeLevel: 4,
                displayOrder: 2,
                description: 'Allow user to export compliance audit trail for regulatory inspection',
              },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Standard 8 Tenant System Role Templates.
 * Immutable platform templates (organization_id IS NULL, role_type = 'SYSTEM_TEMPLATE').
 */
export const SYSTEM_ROLE_TEMPLATES: SystemRoleTemplateDefinition[] = [
  // 1. SCHOOL_ADMIN
  {
    roleCode: 'SCHOOL_ADMIN',
    roleName: 'School Administrator',
    description: 'Full operational administrative management across all active and subscribed modules for the institution.',
    grantedNodeCodes: [
      'academics',
      'students',
      'attendance',
      'fees',
      'staff',
      'exams',
      'front_office',
      'timetable',
      'transport',
      'library',
      'hostel',
      'settings',
    ],
  },

  // 2. PRINCIPAL
  {
    roleCode: 'PRINCIPAL',
    roleName: 'Principal / Academic Head',
    description: 'Academic and institutional leadership: complete access to academics, students, staff, attendance, timetable, and examinations; read-only oversight for fees.',
    grantedNodeCodes: [
      'academics',
      'students',
      'attendance',
      'staff',
      'exams',
      'front_office',
      'timetable',
      // Read-only financial oversight
      'fees.structures.templates.view',
      'fees.invoices.billing.view',
      'fees.payments.collections.view',
      'fees.discounts.waivers.view',
      'fees.defaulters.aging.view',
      // Oversight on auxiliary services
      'transport.vehicles.fleet.view',
      'transport.routes.stops.view',
      'transport.allocations.riders.view',
      'library.books.catalog.view',
      'library.circulation.transactions.view',
      'library.fines.penalties.view',
      'hostel.buildings.infrastructure.view',
      'hostel.rooms.occupancy.view',
      'hostel.mess.attendance.view',
      // Institutional settings
      'settings.organization_profile.identity.view',
      'settings.campuses.locations.view',
      'settings.roles_permissions.rbac.view',
      'settings.user_assignments.allocations.view',
      'settings.audit_logs.trail.view',
    ],
  },

  // 3. INSTITUTION_HEAD
  {
    roleCode: 'INSTITUTION_HEAD',
    roleName: 'Head of Institution / Trustee',
    description: 'Executive board and trustee governance: institution-wide analytics, financial overview, compliance inspection, and campus metrics.',
    grantedNodeCodes: [
      'academics.curriculum.courses.view',
      'academics.classes.grades.view',
      'academics.sections.allocations.view',
      'students.profiles.records.view',
      'students.profiles.records.export',
      'attendance.reports.analytics.view',
      'attendance.reports.analytics.export',
      'fees.structures.templates.view',
      'fees.invoices.billing.view',
      'fees.payments.collections.view',
      'fees.discounts.waivers.view',
      'fees.defaulters.aging.view',
      'staff.directory.records.view',
      'staff.payroll.processing.view',
      'exams.report_cards.generation.view',
      'settings.organization_profile.identity.view',
      'settings.campuses.locations.view',
      'settings.audit_logs.trail.view',
      'settings.audit_logs.trail.export',
    ],
  },

  // 4. TEACHER
  {
    roleCode: 'TEACHER',
    roleName: 'Faculty / Teacher',
    description: 'Classroom teaching and evaluation: access to curriculum, student rosters, lesson plans, daily attendance, exam marks entry, and class schedules.',
    grantedNodeCodes: [
      'academics.curriculum.courses.view',
      'academics.classes.grades.view',
      'academics.sections.allocations.view',
      'academics.subjects.assignments.view',
      'academics.lesson_plans.planner.view',
      'academics.lesson_plans.planner.manage',
      'students.profiles.records.view',
      'students.documents.repository.view',
      'attendance.student_daily.roster.view',
      'attendance.student_daily.roster.mark',
      'attendance.student_daily.roster.edit',
      'attendance.student_leave.requests.view',
      'attendance.student_leave.requests.approve',
      'attendance.staff_daily.register.view',
      'exams.schedules.planning.view',
      'exams.marks_entry.assessments.view',
      'exams.marks_entry.assessments.input',
      'exams.report_cards.generation.view',
      'timetable.class_schedules.grids.view',
      'timetable.teacher_allocations.workload.view',
      'timetable.substitutions.daily.view',
      'library.books.catalog.view',
    ],
  },

  // 5. ACCOUNTANT
  {
    roleCode: 'ACCOUNTANT',
    roleName: 'Bursar / Accountant',
    description: 'Financial administration: fee structures, student invoice generation, cashiering collections, payment receipts, discounts, and fee defaulters.',
    grantedNodeCodes: [
      'fees',
      'students.profiles.records.view',
      'settings.organization_profile.identity.view',
    ],
  },

  // 6. LIBRARIAN
  {
    roleCode: 'LIBRARIAN',
    roleName: 'Librarian',
    description: 'Library operations: book cataloging, circulation checkouts and returns, member issuance, lost book penalties, and library inventory.',
    grantedNodeCodes: [
      'library',
      'students.profiles.records.view',
      'staff.directory.records.view',
    ],
  },

  // 7. STUDENT
  {
    roleCode: 'STUDENT',
    roleName: 'Student',
    description: 'Student self-service portal: view own curriculum, timetable, daily attendance, examination performance, homework, and pending fee dues.',
    grantedNodeCodes: [
      'academics.curriculum.courses.view',
      'academics.lesson_plans.planner.view',
      'students.profiles.records.view',
      'attendance.student_daily.roster.view',
      'attendance.student_leave.requests.apply',
      'fees.invoices.billing.view',
      'exams.schedules.planning.view',
      'exams.report_cards.generation.view',
      'timetable.class_schedules.grids.view',
      'library.books.catalog.view',
    ],
  },

  // 8. PARENT
  {
    roleCode: 'PARENT',
    roleName: 'Parent / Guardian',
    description: 'Guardian portal: view ward profile, track daily attendance, view exam transcripts, communicate with teachers, view fee dues, and register grievances.',
    grantedNodeCodes: [
      'academics.curriculum.courses.view',
      'students.profiles.records.view',
      'attendance.student_daily.roster.view',
      'attendance.student_leave.requests.apply',
      'fees.invoices.billing.view',
      'fees.payments.collections.view',
      'exams.schedules.planning.view',
      'exams.report_cards.generation.view',
      'timetable.class_schedules.grids.view',
      'front_office.grievances.tickets.view',
      'front_office.grievances.tickets.manage',
    ],
  },
];

