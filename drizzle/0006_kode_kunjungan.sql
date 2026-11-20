ALTER TABLE "bookings" ADD COLUMN "kode_kunjungan" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "kode_salah" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Kunjungan yang sudah dibayar sebelum fitur ini ada tetap mendapat kode,
-- supaya tidak ada satu pun kunjungan berjalan yang bisa "tiba" tanpa kode.
UPDATE "bookings"
SET "kode_kunjungan" = lpad(floor(random() * 10000)::int::text, 4, '0')
WHERE "status" IN ('DIBAYAR', 'PERAWAT_BERANGKAT') AND "kode_kunjungan" IS NULL;
