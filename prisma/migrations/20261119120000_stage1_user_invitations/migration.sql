-- AlterEnum
DO $$ BEGIN
    ALTER TYPE organization."MembershipStatus" ADD VALUE 'INVITED';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE organization."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS organization.organization_invitations (
    id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    email VARCHAR(150) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    role_id TEXT NOT NULL,
    location_id TEXT,
    access_level organization."OrganizationAccessLevel" NOT NULL DEFAULT 'MEMBER',
    membership_type organization."MembershipType" NOT NULL DEFAULT 'STAFF',
    status organization."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    invited_by TEXT NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    accepted_at TIMESTAMP(3),
    revoked_at TIMESTAMP(3),
    revoked_by TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT organization_invitations_pkey PRIMARY KEY (id),
    CONSTRAINT organization_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT organization_invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES organization.roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT organization_invitations_location_id_fkey FOREIGN KEY (location_id) REFERENCES organization.locations(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_token_hash_key ON organization.organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS organization_invitations_organization_id_email_idx ON organization.organization_invitations(organization_id, email);
CREATE INDEX IF NOT EXISTS organization_invitations_token_hash_idx ON organization.organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS organization_invitations_status_idx ON organization.organization_invitations(status);

