import { User, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma-client';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  userType?: 'PLATFORM' | 'TENANT';
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export class UsersRepository {
  /**
   * Find a user by email address (case-insensitive)
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        email: {
          equals: email.trim().toLowerCase(),
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Find a user by primary key ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new user identity
   */
  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone?.trim(),
        avatarUrl: data.avatarUrl?.trim(),
        userType: data.userType ?? 'TENANT',
        isActive: data.isActive ?? true,
        mustChangePassword: data.mustChangePassword ?? false,
        tokenVersion: 1,
      },
    });
  }

  /**
   * Concurrency-safe atomic increment of failed login attempts.
   * If threshold (5) is reached, sets a 15-minute account lockout.
   */
  async atomicIncrementFailedLogins(
    userId: string
  ): Promise<{ failedLogins: number; isLocked: boolean; lockedUntil: Date | null }> {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: { increment: 1 },
      },
      select: { failedLogins: true },
    });

    if (updated.failedLogins >= 5) {
      const lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: lockoutUntil },
      });
      return {
        failedLogins: updated.failedLogins,
        isLocked: true,
        lockedUntil: lockoutUntil,
      };
    }

    return {
      failedLogins: updated.failedLogins,
      isLocked: false,
      lockedUntil: null,
    };
  }

  /**
   * Atomically resets failed login attempts upon successful authentication.
   */
  async atomicResetFailedLogins(userId: string, ipAddress?: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress || null,
      },
    });
  }

  /**
   * Stores a SHA-256 password reset hash with a 15-minute expiry.
   */
  async setPasswordResetHash(userId: string, hash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetHash: hash,
        passwordResetExpires: expiresAt,
      },
    });
  }

  /**
   * Finds an active user by a valid, unexpired password reset token hash.
   */
  async findByValidResetHash(hash: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        passwordResetHash: hash,
        passwordResetExpires: {
          gt: new Date(),
        },
        isActive: true,
      },
    });
  }

  /**
   * Updates user password, clears reset tokens, and increments tokenVersion to
   * invalidate all outstanding access tokens immediately.
   */
  async updatePasswordAndIncrementVersion(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetHash: null,
        passwordResetExpires: null,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
  }

  /**
   * Update arbitrary user profile fields
   */
  async update(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}

export const usersRepository = new UsersRepository();

