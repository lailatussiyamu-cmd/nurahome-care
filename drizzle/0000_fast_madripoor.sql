CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"full_address" text NOT NULL,
	"city" text DEFAULT 'Kota Malang' NOT NULL,
	"postal_code" text,
	"latitude" double precision DEFAULT -7.9797,
	"longitude" double precision DEFAULT 112.6304,
	"notes" text,
	"is_default" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_role" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"details" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_code" text NOT NULL,
	"patient_id" integer NOT NULL,
	"patient_name" text NOT NULL,
	"dependent_name" text,
	"service_id" integer NOT NULL,
	"service_name" text NOT NULL,
	"service_category" text NOT NULL,
	"provider_id" integer,
	"provider_name" text,
	"address_id" integer,
	"address_text" text NOT NULL,
	"scheduled_date" text NOT NULL,
	"scheduled_time_slot" text NOT NULL,
	"status" text DEFAULT 'MENUNGGU_TINJAUAN' NOT NULL,
	"review_started_at" timestamp,
	"quoted_at" timestamp,
	"quoted_by_provider_id" integer,
	"quoted_by_provider_name" text,
	"review_findings" text,
	"quote_round" integer DEFAULT 0 NOT NULL,
	"rejection_reason" text,
	"rejected_provider_ids" text,
	"approved_at" timestamp,
	"approved_by_name" text,
	"base_price_idr" integer NOT NULL,
	"distance_fee_idr" integer DEFAULT 25000 NOT NULL,
	"supplies_fee_idr" integer DEFAULT 45000 NOT NULL,
	"emergency_fee_idr" integer DEFAULT 0 NOT NULL,
	"total_price_idr" integer NOT NULL,
	"payment_method" text DEFAULT 'QRIS / GoPay' NOT NULL,
	"payment_status" text DEFAULT 'PAID' NOT NULL,
	"triage_red_flag" boolean DEFAULT false,
	"triage_notes" text,
	"sengketa" boolean DEFAULT false NOT NULL,
	"catatan_sistem" text,
	"terakhir_didorong" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_booking_code_unique" UNIQUE("booking_code")
);
--> statement-breakpoint
CREATE TABLE "circumcision_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"patient_id" integer NOT NULL,
	"patient_age_years" integer NOT NULL,
	"weight_kg" double precision NOT NULL,
	"method_preferred" text NOT NULL,
	"bleeding_disorders" text DEFAULT 'None' NOT NULL,
	"allergies" text DEFAULT 'None' NOT NULL,
	"anatomical_notes" text,
	"guardian_name" text NOT NULL,
	"guardian_phone" text NOT NULL,
	"consent_given" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"patient_id" integer NOT NULL,
	"assessment_summary" text NOT NULL,
	"wound_dimensions" text NOT NULL,
	"exudate_level" text NOT NULL,
	"procedures_performed" text NOT NULL,
	"supplies_used" text NOT NULL,
	"pain_score_post" integer NOT NULL,
	"homecare_instructions" text NOT NULL,
	"next_follow_up_date" text,
	"ai_assisted_draft" boolean DEFAULT false,
	"verified_by_provider" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"version" text NOT NULL,
	"text_snapshot" text NOT NULL,
	"quote_snapshot" text NOT NULL,
	"signed_by_name" text NOT NULL,
	"signer_relation" text DEFAULT 'DIRI_SENDIRI' NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"photo_consent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dependents" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"relationship" text NOT NULL,
	"date_of_birth" text NOT NULL,
	"gender" text NOT NULL,
	"weight_kg" double precision,
	"medical_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"ok" boolean NOT NULL,
	"reason" text,
	"ip_hash" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"sender_name" text NOT NULL,
	"sender_role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text,
	"payment_id" integer,
	"transaction_status" text,
	"fraud_status" text,
	"gross_amount" text,
	"signature_ok" boolean DEFAULT false NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"raw_json" text,
	"ip_hash" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"order_id" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"provider" text DEFAULT 'MIDTRANS' NOT NULL,
	"amount_idr" integer NOT NULL,
	"status" text DEFAULT 'MENUNGGU' NOT NULL,
	"status_reason" text,
	"payment_type" text,
	"provider_txn_id" text,
	"redirect_url" text,
	"snap_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"paid_at" timestamp,
	"last_notice_hash" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "provider_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"jenis" text NOT NULL,
	"file_url" text NOT NULL,
	"nomor" text,
	"berlaku_sampai" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"license_number" text NOT NULL,
	"specialty" text NOT NULL,
	"years_experience" integer NOT NULL,
	"bio" text NOT NULL,
	"service_area_city" text NOT NULL,
	"service_radius_km" integer DEFAULT 15 NOT NULL,
	"rating_avg" double precision DEFAULT 4.9 NOT NULL,
	"completed_visits" integer DEFAULT 0 NOT NULL,
	"verified_status" text DEFAULT 'BELUM_DIAJUKAN' NOT NULL,
	"sip_number" text,
	"sip_berlaku_sampai" text,
	"sip_diterbitkan_oleh" text,
	"verification_submitted_at" timestamp,
	"verified_at" timestamp,
	"verified_by_name" text,
	"verified_sumber" text,
	"verification_note" text,
	"available_hours" text DEFAULT '08:00 - 20:00' NOT NULL,
	"is_available_now" boolean DEFAULT true NOT NULL,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price_idr" integer NOT NULL,
	"from_catalog" boolean DEFAULT true NOT NULL,
	"original_unit_price_idr" integer,
	"reason" text,
	"quote_round" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"patient_name" text NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"service_name" text NOT NULL,
	"overall_rating" integer NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"base_price_idr" integer NOT NULL,
	"supplies_fee_idr" integer DEFAULT 0 NOT NULL,
	"required_equipment" text NOT NULL,
	"preparation_instructions" text NOT NULL,
	"eligibility_criteria" text NOT NULL,
	"follow_up_recommendations" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"provider_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_reason" text,
	"device_label" text,
	"ip_hash" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "task_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"provider_id" integer,
	"provider_name" text,
	"uploaded_by_role" text DEFAULT 'PERAWAT' NOT NULL,
	"photo_type" text NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"verified_by_provider" boolean DEFAULT true NOT NULL,
	"image_deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "testimoni" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"patient_id" integer NOT NULL,
	"patient_name" text NOT NULL,
	"provider_id" integer,
	"provider_name" text,
	"service_name" text NOT NULL,
	"wilayah" text,
	"bintang" integer NOT NULL,
	"nilai_ketepatan_waktu" integer,
	"nilai_kebersihan" integer,
	"nilai_keterampilan" integer,
	"isi_asli" text NOT NULL,
	"isi_tayang" text NOT NULL,
	"diedit" boolean DEFAULT false NOT NULL,
	"diedit_oleh" text,
	"diedit_pada" timestamp,
	"alasan_edit" text,
	"izin_tayang" text DEFAULT 'BOLEH_SAMARAN' NOT NULL,
	"nama_tayang" text,
	"status_tinjauan" text DEFAULT 'BARU' NOT NULL,
	"keluhan" boolean DEFAULT false NOT NULL,
	"status_ke_perawat" text DEFAULT 'BARU' NOT NULL,
	"alasan_tahan" text,
	"diteruskan_pada" timestamp,
	"bahaya_klinis" boolean DEFAULT false NOT NULL,
	"catatan_untuk_perawat" text,
	"balasan_perawat" text,
	"balasan_pada" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"role" text DEFAULT 'PATIENT' NOT NULL,
	"avatar_url" text,
	"date_of_birth" text,
	"gender" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"allergies" text,
	"medical_history" text,
	"diabetes_status" text DEFAULT 'No',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"password_hash" text,
	"password_updated_at" timestamp,
	"phone_normal" text,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"account_status" text DEFAULT 'AKTIF' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"keputusan" text NOT NULL,
	"alasan" text,
	"diperiksa_di" text,
	"admin_user_id" integer,
	"admin_name" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"provider_license" text NOT NULL,
	"arrived_at" timestamp,
	"finished_at" timestamp,
	"what_was_done" text NOT NULL,
	"wound_condition" text,
	"home_instructions" text NOT NULL,
	"warning_signs" text,
	"next_visit_suggestion" text,
	"supplies_used" text,
	"signed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wound_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"patient_id" integer NOT NULL,
	"wound_location" text NOT NULL,
	"wound_duration" text NOT NULL,
	"cause_of_wound" text NOT NULL,
	"length_cm" double precision NOT NULL,
	"width_cm" double precision NOT NULL,
	"depth_cm" double precision DEFAULT 0.3 NOT NULL,
	"tissue_type" text NOT NULL,
	"exudate_amount" text NOT NULL,
	"exudate_type" text NOT NULL,
	"odor" text DEFAULT 'None' NOT NULL,
	"periwound_condition" text NOT NULL,
	"pain_score" integer NOT NULL,
	"infection_signs" boolean DEFAULT false NOT NULL,
	"fever" boolean DEFAULT false NOT NULL,
	"bleeding" text DEFAULT 'Minimal' NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wound_timeline_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"booking_id" integer,
	"visit_day_label" text NOT NULL,
	"date_recorded" text NOT NULL,
	"length_cm" double precision NOT NULL,
	"width_cm" double precision NOT NULL,
	"area_sq_cm" double precision NOT NULL,
	"pain_score" integer NOT NULL,
	"exudate_status" text NOT NULL,
	"dressing_type" text NOT NULL,
	"provider_name" text NOT NULL,
	"notes" text NOT NULL,
	"image_url" text
);
