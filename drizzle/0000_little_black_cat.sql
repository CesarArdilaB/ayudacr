CREATE TYPE "public"."assessment_answer" AS ENUM('yes', 'no', 'not_observable');--> statement-breakpoint
CREATE TABLE "assessment_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"criterion_key" text NOT NULL,
	"answer" "assessment_answer" NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelter_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_version" text DEFAULT '2026-08-10' NOT NULL,
	"institution" text NOT NULL,
	"visit_date" date NOT NULL,
	"municipality" text NOT NULL,
	"department" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_role" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"protection_risk_details" text DEFAULT '' NOT NULL,
	"general_observations" text DEFAULT '' NOT NULL,
	"visitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_assessment_id_shelter_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."shelter_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_responses_assessment_idx" ON "assessment_responses" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_responses_assessment_criterion_uidx" ON "assessment_responses" USING btree ("assessment_id","criterion_key");--> statement-breakpoint
CREATE INDEX "shelter_assessments_created_by_idx" ON "shelter_assessments" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "shelter_assessments_visit_date_idx" ON "shelter_assessments" USING btree ("visit_date");