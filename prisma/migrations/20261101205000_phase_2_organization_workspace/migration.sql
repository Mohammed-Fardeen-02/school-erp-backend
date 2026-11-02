-- =========================================================================
-- Phase 2: Organization & Workspace Access Engine Forward Migration
-- Multi-Schema: auth, organization, platform, audit
-- =========================================================================

-- Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS audit;

-- =========================================================================
-- AUTH SCHEMA: Core Identity & Sessions
-- =========================================================================

DO $$ BEGIN
    CREATE TYPE auth."UserType" AS ENUM ('PLATFORM', 'TENANT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auth.users (
    id TEXT NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    avatar_url VARCHAR(500),
    user_type auth."UserType" NOT NULL DEFAULT 'TENANT',
    is_active BOOLEAN NOT NULL DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    token_version INTEGER NOT NULL DEFAULT 1,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP(3),
    last_login_at TIMESTAMP(3),
    last_login_ip VARCHAR(45),
    password_reset_hash VARCHAR(255),
    password_reset_expires TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON auth.users(email);
CREATE INDEX IF NOT EXISTS users_user_type_idx ON auth.users(user_type);

CREATE TABLE IF NOT EXISTS auth.sessions (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    family_id VARCHAR(100) NOT NULL,
    device_info VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMP(3),
    revoked_reason VARCHAR(100),
    expires_at TIMESTAMP(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT sessions_pkey PRIMARY KEY (id),
    CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_family_id_idx ON auth.sessions(family_id);
CREATE INDEX IF NOT EXISTS sessions_is_revoked_idx ON auth.sessions(is_revoked);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    consumed_at TIMESTAMP(3),
    revoked_at TIMESTAMP(3),
    replaced_by_token_id TEXT,
    expires_at TIMESTAMP(3) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_key ON auth.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_session_id_idx ON auth.refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON auth.refresh_tokens(token_hash);

-- =========================================================================
-- AUDIT SCHEMA: Activity & Audit Logging
-- =========================================================================

CREATE TABLE IF NOT EXISTS audit.audit_logs (
    id TEXT NOT NULL,
    organization_id TEXT,
    user_id TEXT,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id TEXT,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS audit_logs_organization_id_idx ON audit.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_entity_id_idx ON audit.audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit.audit_logs(created_at);

-- =========================================================================
-- ENUMS: organization Schema
-- =========================================================================

DO $$ BEGIN
    CREATE TYPE organization."OrganizationType" AS ENUM (
        'K12_SCHOOL_CHAIN',
        'INDEPENDENT_SCHOOL',
        'COLLEGE_UNIVERSITY',
        'POLYTECHNIC_INSTITUTE',
        'VOCATIONAL_CENTER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE organization."LocationType" AS ENUM (
        'MAIN_CAMPUS',
        'BRANCH_CAMPUS',
        'ADMINISTRATIVE_HQ',
        'TRAINING_CENTER',
        'HOSTEL_FACILITY',
        'SPORTS_COMPLEX'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE organization."TenantStatus" AS ENUM (
        'PROVISIONING',
        'ACTIVE',
        'SUSPENDED',
        'TRIAL',
        'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE organization."MembershipStatus" AS ENUM (
        'ACTIVE',
        'SUSPENDED',
        'TERMINATED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE organization."MembershipType" AS ENUM (
        'STAFF',
        'FACULTY',
        'STUDENT',
        'GUARDIAN',
        'TRUSTEE',
        'CONSULTANT'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE organization."OrganizationAccessLevel" AS ENUM (
        'OWNER',
        'ADMIN',
        'MEMBER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE organization."ModuleId" AS ENUM (
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
        'SETTINGS'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- TABLE: organization.organizations
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.organizations (
    id TEXT NOT NULL,
    code VARCHAR(50) NOT NULL,
    legal_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    organization_type organization."OrganizationType" NOT NULL DEFAULT 'K12_SCHOOL_CHAIN',
    status organization."TenantStatus" NOT NULL,
    email VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    website VARCHAR(200),
    tax_id VARCHAR(50),
    registration_no VARCHAR(100),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) NOT NULL DEFAULT 'IN',
    postal_code VARCHAR(20),
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    subscription_plan VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    max_locations INTEGER NOT NULL DEFAULT 5,
    max_users INTEGER NOT NULL DEFAULT 500,
    max_students INTEGER NOT NULL DEFAULT 2000,
    trial_ends_at TIMESTAMP(3),
    logo_url VARCHAR(500),
    brand_color VARCHAR(20),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,

    CONSTRAINT organizations_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_code_key ON organization.organizations(code);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organization.organizations(status);
CREATE INDEX IF NOT EXISTS organizations_code_idx ON organization.organizations(code);

-- =========================================================================
-- TABLE: organization.locations
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.locations (
    id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    location_type organization."LocationType" NOT NULL DEFAULT 'BRANCH_CAMPUS',
    is_main_campus BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    email VARCHAR(120),
    phone VARCHAR(30),
    principal_name VARCHAR(100),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) NOT NULL DEFAULT 'IN',
    postal_code VARCHAR(20),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,

    CONSTRAINT locations_pkey PRIMARY KEY (id),
    CONSTRAINT locations_organization_id_fkey FOREIGN KEY (organization_id) 
        REFERENCES organization.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS locations_organization_id_code_key ON organization.locations(organization_id, code);
CREATE INDEX IF NOT EXISTS locations_organization_id_idx ON organization.locations(organization_id);
CREATE INDEX IF NOT EXISTS locations_is_active_idx ON organization.locations(is_active);

-- Main Campus Invariant: At most ONE main campus per organization
CREATE UNIQUE INDEX IF NOT EXISTS unique_main_campus_per_organization 
ON organization.locations (organization_id) 
WHERE is_main_campus = TRUE;

-- =========================================================================
-- TABLE: organization.organization_memberships
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.organization_memberships (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    access_level organization."OrganizationAccessLevel" NOT NULL DEFAULT 'MEMBER',
    membership_type organization."MembershipType" NOT NULL DEFAULT 'STAFF',
    status organization."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    job_title VARCHAR(100),
    department VARCHAR(100),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,

    CONSTRAINT organization_memberships_pkey PRIMARY KEY (id),
    CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) 
        REFERENCES organization.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_memberships_user_id_organization_id_key 
ON organization.organization_memberships(user_id, organization_id);

CREATE INDEX IF NOT EXISTS organization_memberships_user_id_idx ON organization.organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS organization_memberships_organization_id_idx ON organization.organization_memberships(organization_id);
CREATE INDEX IF NOT EXISTS organization_memberships_status_idx ON organization.organization_memberships(status);
CREATE INDEX IF NOT EXISTS organization_memberships_access_level_idx ON organization.organization_memberships(access_level);

-- Primary Organization Invariant: At most ONE primary organization per user
CREATE UNIQUE INDEX IF NOT EXISTS unique_primary_membership_per_user 
ON organization.organization_memberships (user_id) 
WHERE is_primary = TRUE;

-- =========================================================================
-- TABLE: organization.organization_modules
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.organization_modules (
    id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    module_id organization."ModuleId" NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    configured_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT organization_modules_pkey PRIMARY KEY (id),
    CONSTRAINT organization_modules_organization_id_fkey FOREIGN KEY (organization_id) 
        REFERENCES organization.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_modules_organization_id_module_id_key 
ON organization.organization_modules(organization_id, module_id);

CREATE INDEX IF NOT EXISTS organization_modules_organization_id_idx ON organization.organization_modules(organization_id);

-- =========================================================================
-- RELATION: audit.audit_logs -> organization.organizations
-- =========================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'audit_logs_organization_id_fkey'
    ) THEN
        ALTER TABLE audit.audit_logs 
        ADD CONSTRAINT audit_logs_organization_id_fkey 
        FOREIGN KEY (organization_id) REFERENCES organization.organizations(id) 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;

