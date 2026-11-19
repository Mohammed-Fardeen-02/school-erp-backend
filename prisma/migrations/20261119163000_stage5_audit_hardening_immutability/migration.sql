-- =========================================================================
-- Stage 5.2 Migration: Audit Hardening, Immutability Trigger & Campus Context
-- =========================================================================

-- 1. Add location_id column to audit.audit_logs
ALTER TABLE audit.audit_logs ADD COLUMN IF NOT EXISTS location_id TEXT;

-- 2. Update Foreign Key Constraints on audit.audit_logs to RESTRICT
-- In enterprise audit logging, referenced identities (Users, Organizations, Locations)
-- cannot be deleted while historical audit trail depends on them.
ALTER TABLE audit.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE audit.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_organization_id_fkey;
ALTER TABLE audit.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organization.organizations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE audit.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_location_id_fkey;
ALTER TABLE audit.audit_logs
    ADD CONSTRAINT audit_logs_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES organization.locations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Create Performance & Forensic Composite Indexes
CREATE INDEX IF NOT EXISTS audit_logs_location_id_idx ON audit.audit_logs(location_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit.audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_at_desc_idx ON audit.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_loc_created_at_desc_idx ON audit.audit_logs(location_id, created_at DESC);

-- 4. Safe Backfill of Historical location_id
-- Only backfills when locationId is explicitly present in new_state JSON
-- and unambiguously exists in organization.locations under the matching tenant.
UPDATE audit.audit_logs
SET location_id = new_state->>'locationId'
WHERE location_id IS NULL
  AND new_state IS NOT NULL
  AND new_state ? 'locationId'
  AND EXISTS (
    SELECT 1 FROM organization.locations l
    WHERE l.id = audit.audit_logs.new_state->>'locationId'
      AND (audit.audit_logs.organization_id IS NULL OR l.organization_id = audit.audit_logs.organization_id)
  );

-- 5. Append-Only Immutability Protection Trigger
-- Prohibits UPDATE and DELETE operations on audit.audit_logs at the PostgreSQL engine level.
CREATE OR REPLACE FUNCTION audit.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow explicit maintenance override for test/administrative suite cleanup
    IF current_setting('app.allow_audit_modification', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    RAISE EXCEPTION 'audit.audit_logs is an append-only audit log table. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit.audit_logs
FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_log_mutation();
