-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "DeploymentTrigger" AS ENUM ('ci', 'manual_redeploy', 'manual_rollback');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('queued', 'preparing', 'probing', 'switching', 'succeeded', 'failed', 'rolled_back', 'recovery_failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DeploymentSlot" AS ENUM ('blue', 'green');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "image_namespace" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "health_path" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "current_release_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "image_digest" TEXT NOT NULL,
    "scan_policy_version" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "previous_release_id" UUID,
    "trigger" "DeploymentTrigger" NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'queued',
    "requested_by" UUID,
    "slot" "DeploymentSlot",
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failure_code" TEXT,
    "lease_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_events" (
    "id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event_code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_credentials" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_domain_key" ON "projects"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "projects_current_release_id_key" ON "projects"("current_release_id");

-- CreateIndex
CREATE INDEX "projects_repository_branch_idx" ON "projects"("repository", "branch");

-- CreateIndex
CREATE INDEX "releases_project_id_approved_at_idx" ON "releases"("project_id", "approved_at");

-- CreateIndex
CREATE UNIQUE INDEX "releases_project_id_workflow_run_id_key" ON "releases"("project_id", "workflow_run_id");

-- CreateIndex
CREATE INDEX "deployments_project_id_status_created_at_idx" ON "deployments"("project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "deployments_release_id_idx" ON "deployments"("release_id");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_events_deployment_id_sequence_key" ON "deployment_events"("deployment_id", "sequence");

-- CreateIndex
CREATE INDEX "api_credentials_project_id_revoked_at_idx" ON "api_credentials"("project_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_release_id_fkey" FOREIGN KEY ("current_release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_previous_release_id_fkey" FOREIGN KEY ("previous_release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
