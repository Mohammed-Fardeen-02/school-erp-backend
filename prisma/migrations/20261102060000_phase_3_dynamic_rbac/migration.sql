-- =========================================================================
-- Phase 3: Dynamic Multi-Tenant RBAC & Modular Permissions Engine Forward Migration
-- Multi-Schema: platform, organization
-- Specification: v3.0.2
-- =========================================================================

-- Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS organization;

-- =========================================================================
-- ENUMS
-- =========================================================================

DO $$ BEGIN
    CREATE TYPE organization."RoleType" AS ENUM ('SYSTEM_TEMPLATE', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE platform."NodeType" AS ENUM ('MODULE', 'SECTION', 'FEATURE', 'ACTION');
EXCEPTION
    WHEN duplicate_object THEN 
        BEGIN
            ALTER TYPE platform."NodeType" ADD VALUE IF NOT EXISTS 'ACTION';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
END $$;

ALTER TYPE platform."NodeType" ADD VALUE IF NOT EXISTS 'ACTION';

-- =========================================================================
-- TABLE: platform.permission_nodes (Canonical Modular Tree Hierarchy)
-- =========================================================================

CREATE TABLE IF NOT EXISTS platform.permission_nodes (
    id TEXT NOT NULL,
    node_code VARCHAR(100) NOT NULL,
    node_name VARCHAR(150) NOT NULL,
    node_type platform."NodeType" NOT NULL DEFAULT 'FEATURE',
    parent_id TEXT,
    node_level INTEGER NOT NULL DEFAULT 3,
    display_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT permission_nodes_pkey PRIMARY KEY (id),
    CONSTRAINT permission_nodes_parent_id_fkey FOREIGN KEY (parent_id) 
        REFERENCES platform.permission_nodes(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE platform.permission_nodes ALTER COLUMN node_code TYPE VARCHAR(100);
ALTER TABLE platform.permission_nodes ALTER COLUMN node_name TYPE VARCHAR(150);

CREATE UNIQUE INDEX IF NOT EXISTS permission_nodes_node_code_key ON platform.permission_nodes(node_code);
CREATE INDEX IF NOT EXISTS permission_nodes_parent_id_idx ON platform.permission_nodes(parent_id);
CREATE INDEX IF NOT EXISTS permission_nodes_node_code_idx ON platform.permission_nodes(node_code);
CREATE INDEX IF NOT EXISTS permission_nodes_node_type_idx ON platform.permission_nodes(node_type);

-- =========================================================================
-- TABLE: platform.rbac_invalidation_outbox (Distributed Invalidation Sync)
-- =========================================================================

CREATE TABLE IF NOT EXISTS platform.rbac_invalidation_outbox (
    id TEXT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT,
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT rbac_invalidation_outbox_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS rbac_invalidation_outbox_processed_created_at_idx ON platform.rbac_invalidation_outbox(processed, created_at);
CREATE INDEX IF NOT EXISTS rbac_invalidation_outbox_organization_id_idx ON platform.rbac_invalidation_outbox(organization_id);

-- =========================================================================
-- TABLE: organization.roles (Tenant Custom Roles & Platform Templates)
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.roles (
    id TEXT NOT NULL,
    organization_id TEXT,
    role_code VARCHAR(50) NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    role_type organization."RoleType" NOT NULL DEFAULT 'CUSTOM',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT roles_pkey PRIMARY KEY (id)
);

-- Foreign key on organization.roles with restrictive delete to protect organizational history
ALTER TABLE organization.roles DROP CONSTRAINT IF EXISTS roles_organization_id_fkey;
ALTER TABLE organization.roles ADD CONSTRAINT roles_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce RoleType Ownership Invariant: SYSTEM_TEMPLATE must have organization_id IS NULL; CUSTOM must have organization_id IS NOT NULL
ALTER TABLE organization.roles DROP CONSTRAINT IF EXISTS check_role_type_org_id;
ALTER TABLE organization.roles ADD CONSTRAINT check_role_type_org_id CHECK (
    (role_type = 'SYSTEM_TEMPLATE' AND organization_id IS NULL) OR
    (role_type = 'CUSTOM' AND organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS roles_organization_id_idx ON organization.roles(organization_id);
CREATE INDEX IF NOT EXISTS roles_role_code_idx ON organization.roles(role_code);
CREATE INDEX IF NOT EXISTS roles_role_type_idx ON organization.roles(role_type);

CREATE UNIQUE INDEX IF NOT EXISTS unique_system_role_code 
ON organization.roles (role_code) 
WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_custom_role_code_per_org 
ON organization.roles (organization_id, role_code) 
WHERE organization_id IS NOT NULL;

-- =========================================================================
-- TABLE: organization.role_permissions (Modular Grant Matrix)
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.role_permissions (
    id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    is_granted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT role_permissions_role_id_node_id_key UNIQUE (role_id, node_id),
    CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) 
        REFERENCES organization.roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT role_permissions_node_id_fkey FOREIGN KEY (node_id) 
        REFERENCES platform.permission_nodes(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $$ BEGIN
    ALTER TABLE organization.role_permissions ADD COLUMN IF NOT EXISTS is_granted BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE organization.role_permissions DROP COLUMN IF EXISTS can_view;
    ALTER TABLE organization.role_permissions DROP COLUMN IF EXISTS can_create;
    ALTER TABLE organization.role_permissions DROP COLUMN IF EXISTS can_edit;
    ALTER TABLE organization.role_permissions DROP COLUMN IF EXISTS can_delete;
    ALTER TABLE organization.role_permissions DROP COLUMN IF EXISTS can_export;
    ALTER TABLE organization.role_permissions DROP COLUMN IF EXISTS can_import;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON organization.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_node_id_idx ON organization.role_permissions(node_id);

-- =========================================================================
-- TABLE: organization.user_roles (Dynamic User Role Assignments)
-- =========================================================================

CREATE TABLE IF NOT EXISTS organization.user_roles (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    location_id TEXT,
    membership_id TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_by TEXT,
    assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_by TEXT,
    revoked_at TIMESTAMP(3),
    reason VARCHAR(255),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT user_roles_pkey PRIMARY KEY (id)
);

-- Restrictive Foreign Keys to guarantee non-destructive historical authorization preservation
ALTER TABLE organization.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE organization.user_roles ADD CONSTRAINT user_roles_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE organization.user_roles DROP CONSTRAINT IF EXISTS user_roles_organization_id_fkey;
ALTER TABLE organization.user_roles ADD CONSTRAINT user_roles_organization_id_fkey 
    FOREIGN KEY (organization_id) REFERENCES organization.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE organization.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_id_fkey;
ALTER TABLE organization.user_roles ADD CONSTRAINT user_roles_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES organization.roles(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE organization.user_roles DROP CONSTRAINT IF EXISTS user_roles_location_id_fkey;
ALTER TABLE organization.user_roles ADD CONSTRAINT user_roles_location_id_fkey 
    FOREIGN KEY (location_id) REFERENCES organization.locations(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE organization.user_roles DROP CONSTRAINT IF EXISTS user_roles_membership_id_fkey;
ALTER TABLE organization.user_roles ADD CONSTRAINT user_roles_membership_id_fkey 
    FOREIGN KEY (membership_id) REFERENCES organization.organization_memberships(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant: Active assignments must NOT have revocation timestamps; Revoked must have revoked_at, revoked_by, and reason
ALTER TABLE organization.user_roles DROP CONSTRAINT IF EXISTS check_user_role_lifecycle;
ALTER TABLE organization.user_roles ADD CONSTRAINT check_user_role_lifecycle CHECK (
    (is_active = TRUE AND revoked_at IS NULL AND revoked_by IS NULL) OR
    (is_active = FALSE AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON organization.user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_organization_id_idx ON organization.user_roles(organization_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON organization.user_roles(role_id);
CREATE INDEX IF NOT EXISTS user_roles_location_id_idx ON organization.user_roles(location_id);
CREATE INDEX IF NOT EXISTS user_roles_membership_id_idx ON organization.user_roles(membership_id);
CREATE INDEX IF NOT EXISTS user_roles_is_active_idx ON organization.user_roles(is_active);

DROP INDEX IF EXISTS organization.unique_user_role_org_wide;
DROP INDEX IF EXISTS organization.unique_user_role_campus_scoped;

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_role_org_wide 
ON organization.user_roles (user_id, organization_id, role_id) 
WHERE location_id IS NULL AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_role_campus_scoped 
ON organization.user_roles (user_id, organization_id, role_id, location_id) 
WHERE location_id IS NOT NULL AND is_active = TRUE;

-- =========================================================================
-- DATABASE TRIGGERS: Cross-Tenant Integrity & Tree Hierarchy
-- =========================================================================

-- Trigger 1: Cross-Tenant Integrity Enforcement on user_roles
CREATE OR REPLACE FUNCTION organization.trg_check_user_role_tenant_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_role_org_id TEXT;
    v_role_type organization."RoleType";
    v_loc_org_id TEXT;
    v_mem_org_id TEXT;
    v_mem_user_id TEXT;
BEGIN
    -- 1. Custom Role Ownership & System Template Validation
    SELECT organization_id, role_type INTO v_role_org_id, v_role_type
    FROM organization.roles WHERE id = NEW.role_id;
    
    IF v_role_type IS NULL THEN
        RAISE EXCEPTION 'Referential integrity violation: Target role % does not exist', NEW.role_id USING ERRCODE = '23503';
    END IF;

    IF v_role_type = 'SYSTEM_TEMPLATE' AND v_role_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'Tenant ownership violation: System template role % has tenant ownership %',
            NEW.role_id, v_role_org_id USING ERRCODE = '23514';
    END IF;

    IF v_role_type = 'CUSTOM' AND (v_role_org_id IS NULL OR v_role_org_id <> NEW.organization_id) THEN
        RAISE EXCEPTION 'Cross-tenant violation: Custom role % belongs to organization %, not assignment organization %',
            NEW.role_id, v_role_org_id, NEW.organization_id USING ERRCODE = '23514';
    END IF;

    -- 2. Location Ownership (if campus-scoped)
    IF NEW.location_id IS NOT NULL THEN
        SELECT organization_id INTO v_loc_org_id
        FROM organization.locations WHERE id = NEW.location_id;
        
        IF v_loc_org_id IS NULL OR v_loc_org_id <> NEW.organization_id THEN
            RAISE EXCEPTION 'Cross-tenant violation: Location % belongs to organization %, not assignment organization %',
                NEW.location_id, v_loc_org_id, NEW.organization_id USING ERRCODE = '23514';
        END IF;
    END IF;

    -- 3. Membership Ownership and User Consistency
    SELECT organization_id, user_id INTO v_mem_org_id, v_mem_user_id
    FROM organization.organization_memberships WHERE id = NEW.membership_id;
    
    IF v_mem_org_id IS NULL OR v_mem_org_id <> NEW.organization_id OR v_mem_user_id <> NEW.user_id THEN
        RAISE EXCEPTION 'Cross-tenant violation: Membership % does not match assignment user % or organization %',
            NEW.membership_id, NEW.user_id, NEW.organization_id USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_user_role_tenant_integrity ON organization.user_roles;
CREATE TRIGGER check_user_role_tenant_integrity
BEFORE INSERT OR UPDATE ON organization.user_roles
FOR EACH ROW EXECUTE FUNCTION organization.trg_check_user_role_tenant_integrity();

-- Trigger 2: Permission Tree Hierarchy & Cycle Prevention
CREATE OR REPLACE FUNCTION platform.trg_check_permission_node_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_type platform."NodeType";
    v_parent_level INTEGER;
    v_cur_id TEXT;
BEGIN
    -- On UPDATE: prevent changing node_type if node has existing children that would become invalid
    IF TG_OP = 'UPDATE' THEN
        IF OLD.node_type <> NEW.node_type THEN
            IF EXISTS (SELECT 1 FROM platform.permission_nodes WHERE parent_id = OLD.id) THEN
                RAISE EXCEPTION 'Hierarchy violation: Cannot change node_type of node % because it has existing descendants', OLD.id USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    -- Root MODULE must have level 1 and no parent
    IF NEW.node_type = 'MODULE' THEN
        IF NEW.parent_id IS NOT NULL OR NEW.node_level <> 1 THEN
            RAISE EXCEPTION 'Hierarchy violation: MODULE must be level 1 with no parent' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    -- Non-module nodes must have a parent
    IF NEW.parent_id IS NULL THEN
        RAISE EXCEPTION 'Hierarchy violation: % node must have a parent', NEW.node_type USING ERRCODE = '23514';
    END IF;

    SELECT node_type, node_level INTO v_parent_type, v_parent_level
    FROM platform.permission_nodes WHERE id = NEW.parent_id;

    IF v_parent_type IS NULL THEN
        RAISE EXCEPTION 'Hierarchy violation: Parent node % not found', NEW.parent_id USING ERRCODE = '23514';
    END IF;

    -- Validate Level and Parent Type progression
    IF NEW.node_type = 'SECTION' AND (v_parent_type <> 'MODULE' OR NEW.node_level <> 2) THEN
        RAISE EXCEPTION 'Hierarchy violation: SECTION must have MODULE parent and be level 2' USING ERRCODE = '23514';
    ELSIF NEW.node_type = 'FEATURE' AND (v_parent_type <> 'SECTION' OR NEW.node_level <> 3) THEN
        RAISE EXCEPTION 'Hierarchy violation: FEATURE must have SECTION parent and be level 3' USING ERRCODE = '23514';
    ELSIF NEW.node_type = 'ACTION' AND (v_parent_type <> 'FEATURE' OR NEW.node_level <> 4) THEN
        RAISE EXCEPTION 'Hierarchy violation: ACTION must have FEATURE parent and be level 4' USING ERRCODE = '23514';
    END IF;

    -- Cycle check: traverse ancestors to ensure self is not reached
    v_cur_id := NEW.parent_id;
    WHILE v_cur_id IS NOT NULL LOOP
        IF v_cur_id = NEW.id THEN
            RAISE EXCEPTION 'Hierarchy violation: Circular reference detected in permission node hierarchy' USING ERRCODE = '23514';
        END IF;
        SELECT parent_id INTO v_cur_id FROM platform.permission_nodes WHERE id = v_cur_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_permission_node_hierarchy ON platform.permission_nodes;
CREATE TRIGGER check_permission_node_hierarchy
BEFORE INSERT OR UPDATE ON platform.permission_nodes
FOR EACH ROW EXECUTE FUNCTION platform.trg_check_permission_node_hierarchy();
