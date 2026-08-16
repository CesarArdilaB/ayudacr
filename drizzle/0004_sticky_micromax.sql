CREATE TABLE "assessment_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_photos_position_check" CHECK ("assessment_photos"."position" >= 0 AND "assessment_photos"."position" < 4),
	CONSTRAINT "assessment_photos_mime_check" CHECK ("assessment_photos"."mime_type" = 'image/jpeg'),
	CONSTRAINT "assessment_photos_size_check" CHECK ("assessment_photos"."size" > 0 AND "assessment_photos"."size" <= 307200 AND "assessment_photos"."size" = octet_length("assessment_photos"."data"))
);
--> statement-breakpoint
ALTER TABLE "assessment_photos" ADD CONSTRAINT "assessment_photos_assessment_id_shelter_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."shelter_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_photos_assessment_idx" ON "assessment_photos" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_photos_assessment_position_uidx" ON "assessment_photos" USING btree ("assessment_id","position");