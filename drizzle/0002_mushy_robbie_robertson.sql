CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"saluran" text NOT NULL,
	"tujuan" text NOT NULL,
	"jenis" text NOT NULL,
	"isi" text,
	"status" text DEFAULT 'MENUNGGU' NOT NULL,
	"galat" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"isi_dihapus_pada" timestamp
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip_hash" text
);
