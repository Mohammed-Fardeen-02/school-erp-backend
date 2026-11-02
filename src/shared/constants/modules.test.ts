import { describe, it, expect } from 'vitest';
import {
  ModuleId,
  getTransitiveDependencies,
  validateModuleDependencies,
  MODULE_REGISTRY,
} from './modules';

describe('Module Entitlement Registry & Dependency Graph', () => {
  it('should define all 12 core educational modules', () => {
    const modules = Object.values(ModuleId);
    expect(modules).toHaveLength(12);
    expect(modules).toContain(ModuleId.ACADEMICS);
    expect(modules).toContain(ModuleId.STUDENTS);
    expect(modules).toContain(ModuleId.FEES);
    expect(modules).toContain(ModuleId.SETTINGS);
  });

  it('should return empty set for root modules without dependencies', () => {
    const academicsDeps = getTransitiveDependencies(ModuleId.ACADEMICS);
    expect(Array.from(academicsDeps)).toEqual([]);

    const staffDeps = getTransitiveDependencies(ModuleId.STAFF);
    expect(Array.from(staffDeps)).toEqual([]);
  });

  it('should resolve direct dependencies correctly', () => {
    const studentDeps = getTransitiveDependencies(ModuleId.STUDENTS);
    expect(Array.from(studentDeps)).toContain(ModuleId.ACADEMICS);
  });

  it('should resolve transitive dependencies across multiple levels', () => {
    // ATTENDANCE -> STUDENTS -> ACADEMICS
    const attendanceDeps = getTransitiveDependencies(ModuleId.ATTENDANCE);
    const depsArray = Array.from(attendanceDeps);
    expect(depsArray).toContain(ModuleId.STUDENTS);
    expect(depsArray).toContain(ModuleId.ACADEMICS);

    // FEES -> STUDENTS -> ACADEMICS
    const feesDeps = getTransitiveDependencies(ModuleId.FEES);
    expect(Array.from(feesDeps)).toContain(ModuleId.STUDENTS);
    expect(Array.from(feesDeps)).toContain(ModuleId.ACADEMICS);
  });

  it('should validate valid module combinations with zero errors', () => {
    const validSelection = [
      ModuleId.ACADEMICS,
      ModuleId.STUDENTS,
      ModuleId.ATTENDANCE,
      ModuleId.FEES,
      ModuleId.SETTINGS,
    ];
    const validationError = validateModuleDependencies(validSelection);
    expect(validationError).toBeNull();
  });

  it('should catch missing transitive prerequisites', () => {
    // FEES without ACADEMICS (even if STUDENTS is present)
    const invalidSelection = [ModuleId.FEES, ModuleId.STUDENTS];
    const validationError = validateModuleDependencies(invalidSelection);
    expect(validationError).not.toBeNull();
    expect(validationError).toContain("Cannot enable module 'FEES'");
    expect(validationError).toContain("without prerequisite module 'ACADEMICS'");
  });
});

