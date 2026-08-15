CREATE TYPE "public"."user_role" AS ENUM('evaluator', 'super_admin');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'evaluator' NOT NULL;