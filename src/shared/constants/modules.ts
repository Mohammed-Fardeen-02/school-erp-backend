export enum ModuleId {
  ACADEMICS = 'ACADEMICS',
  STUDENTS = 'STUDENTS',
  ATTENDANCE = 'ATTENDANCE',
  FEES = 'FEES',
  STAFF = 'STAFF',
  EXAMS = 'EXAMS',
  FRONT_OFFICE = 'FRONT_OFFICE',
  TIMETABLE = 'TIMETABLE',
  TRANSPORT = 'TRANSPORT',
  LIBRARY = 'LIBRARY',
  HOSTEL = 'HOSTEL',
  SETTINGS = 'SETTINGS',
}

export interface ModuleMetadata {
  id: ModuleId;
  name: string;
  category: 'core' | 'academic' | 'administrative' | 'financial' | 'system';
  dependencies: ModuleId[];
}

export const MODULE_REGISTRY: Record<ModuleId, ModuleMetadata> = {
  [ModuleId.ACADEMICS]: {
    id: ModuleId.ACADEMICS,
    name: 'Academics & Curriculum',
    category: 'academic',
    dependencies: [],
  },
  [ModuleId.STUDENTS]: {
    id: ModuleId.STUDENTS,
    name: 'Students & Admissions',
    category: 'academic',
    dependencies: [ModuleId.ACADEMICS],
  },
  [ModuleId.ATTENDANCE]: {
    id: ModuleId.ATTENDANCE,
    name: 'Attendance & Registers',
    category: 'academic',
    dependencies: [ModuleId.ACADEMICS, ModuleId.STUDENTS],
  },
  [ModuleId.FEES]: {
    id: ModuleId.FEES,
    name: 'Fees & Finance',
    category: 'financial',
    dependencies: [ModuleId.STUDENTS],
  },
  [ModuleId.STAFF]: {
    id: ModuleId.STAFF,
    name: 'Staff & Faculty',
    category: 'administrative',
    dependencies: [],
  },
  [ModuleId.EXAMS]: {
    id: ModuleId.EXAMS,
    name: 'Examinations & Marks',
    category: 'academic',
    dependencies: [ModuleId.ACADEMICS, ModuleId.STUDENTS],
  },
  [ModuleId.FRONT_OFFICE]: {
    id: ModuleId.FRONT_OFFICE,
    name: 'Front Desk & Reception',
    category: 'administrative',
    dependencies: [],
  },
  [ModuleId.TIMETABLE]: {
    id: ModuleId.TIMETABLE,
    name: 'Timetable & Schedules',
    category: 'academic',
    dependencies: [ModuleId.ACADEMICS, ModuleId.STAFF],
  },
  [ModuleId.TRANSPORT]: {
    id: ModuleId.TRANSPORT,
    name: 'Transport & Fleet',
    category: 'core',
    dependencies: [ModuleId.STUDENTS],
  },
  [ModuleId.LIBRARY]: {
    id: ModuleId.LIBRARY,
    name: 'Library & Catalog',
    category: 'core',
    dependencies: [ModuleId.STUDENTS, ModuleId.STAFF],
  },
  [ModuleId.HOSTEL]: {
    id: ModuleId.HOSTEL,
    name: 'Hostel & Housing',
    category: 'core',
    dependencies: [ModuleId.STUDENTS],
  },
  [ModuleId.SETTINGS]: {
    id: ModuleId.SETTINGS,
    name: 'Institutional Settings',
    category: 'system',
    dependencies: [],
  },
};

export const SUBSCRIPTION_PLAN_MODULES: Record<string, ModuleId[]> = {
  STANDARD: [
    ModuleId.ACADEMICS,
    ModuleId.STUDENTS,
    ModuleId.ATTENDANCE,
    ModuleId.SETTINGS,
  ],
  PROFESSIONAL: [
    ModuleId.ACADEMICS,
    ModuleId.STUDENTS,
    ModuleId.ATTENDANCE,
    ModuleId.FEES,
    ModuleId.STAFF,
    ModuleId.EXAMS,
    ModuleId.TIMETABLE,
    ModuleId.SETTINGS,
  ],
  ENTERPRISE: Object.values(ModuleId),
};

/**
 * Returns all transitive prerequisites for a given module.
 */
export function getTransitiveDependencies(
  moduleId: ModuleId,
  visited: Set<ModuleId> = new Set<ModuleId>()
): Set<ModuleId> {
  const definition = MODULE_REGISTRY[moduleId];
  if (!definition) return visited;

  for (const dep of definition.dependencies) {
    if (!visited.has(dep)) {
      visited.add(dep);
      getTransitiveDependencies(dep, visited);
    }
  }

  return visited;
}

/**
 * Validates that an array of enabled modules satisfies all prerequisite dependencies.
 * Returns null if valid, or an error message detailing the missing dependency.
 */
export function validateModuleDependencies(enabledModules: ModuleId[]): string | null {
  const enabledSet = new Set<ModuleId>(enabledModules);

  for (const mod of enabledModules) {
    const requiredDeps = getTransitiveDependencies(mod);
    for (const dep of requiredDeps) {
      if (!enabledSet.has(dep)) {
        return `Cannot enable module '${mod}' without prerequisite module '${dep}'.`;
      }
    }
  }

  return null;
}

