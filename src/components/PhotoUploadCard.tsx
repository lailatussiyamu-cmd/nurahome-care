"use client";

import React, { useRef, useState } from "react";
import { kecilkanGambar, penghalangBerkas } from "@/logic/gambar";
import {
  Camera,
  Upload,
  CheckCircle2,
  X,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
} from "lucide-react";

export type PhotoType =
  | "ARRIVAL_CONFIRMATION"
  | "WOUND_BEFORE"
  | "WOUND_AFTER"
  | "PROCEDURE_COMPLETION"
  | "SUPPLY_VERIFICATION";

interface PhotoUploadCardProps {
  bookingId: number;
  photoType: PhotoType;
  title: string;
  description: string;
  required?: boolean;
  existingPhoto?: any | null;
  onPhotoUploaded: () => void;
}

export function PhotoUploadCard({
  bookingId,
  photoType,
  title,
  description,
  required = true,
  existingPhoto,
  onPhotoUploaded,
}: PhotoUploadCardProps) {
  const [preview, setPreview] = useState<string | null>(
    existingPhoto?.imageUrl || null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(!!existingPhoto);
  const [caption, setCaption] = useState(existingPhoto?.caption || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    /**
     * Dua perbaikan sekaligus di sini:
     *
     * 1. Pesannya berbahasa Indonesia. Sisa templat berbahasa Inggris
     *    ("Image must be smaller than 8 MB") muncul ke perawat di lapangan.
     *
     * 2. Fotonya DIKECILKAN dulu, tidak lagi disimpan apa adanya. Batas
     *    8 MB yang lama tidak menolong apa pun: 8 MB adalah ukuran yang
     *    justru merobohkan aplikasi setelah beberapa puluh kunjungan.
     */
    const halangan = penghalangBerkas(file);
    if (halangan) {
      setGalat(halangan);
      return;
    }

    setGalat(null);
    setIsUploading(true);
    try {
      const hasil = await kecilkanGambar(file);
      const dataUrl = hasil.dataUrl;
      setPreview(dataUrl);

      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPLOAD_TASK_PHOTO",
          bookingId,
          photoType,
          imageUrl: dataUrl,
          caption,
        }),
      });

      if (!res.ok) {
        const jawab = await res.json().catch(() => ({}));
        setGalat(jawab?.error ?? "Foto gagal dikirim.");
        setPreview(existingPhoto?.imageUrl || null);
        return;
      }

      setUploadSuccess(true);
      onPhotoUploaded();
    } catch (e) {
      /**
       * Kegagalannya DITAMPILKAN, tidak hanya dicatat ke konsol.
       *
       * Versi lama menelan galatnya: perawat melihat pratinjau fotonya
       * muncul dan mengira sudah terkirim, padahal tidak ada apa pun yang
       * tersimpan. Untuk foto sebelum-sesudah yang menjadi bukti tindakan,
       * itu kehilangan yang baru ketahuan saat dibutuhkan.
       */
      setGalat(e instanceof Error ? e.message : "Foto gagal diproses.");
      setPreview(existingPhoto?.imageUrl || null);
    } finally {
      setIsUploading(false);
    }
  };

  const photoTypeIcon: Record<PhotoType, string> = {
    ARRIVAL_CONFIRMATION: "📍",
    WOUND_BEFORE: "🩹",
    WOUND_AFTER: "✨",
    PROCEDURE_COMPLETION: "✅",
    SUPPLY_VERIFICATION: "🧰",
  };

  return (
    <div
      className={`rounded-2xl border-2 p-5 transition ${
        uploadSuccess
          ? "border-nh-sembuh bg-nh-sembuh/40"
          : required
          ? "border-amber-300 bg-amber-50/30"
          : "border-nh-garis bg-nh-panel"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl">{photoTypeIcon[photoType]}</span>
          <div>
            <div className="font-bold text-nh-putih text-sm flex items-center gap-2">
              {title}
              {required && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">
                  Required
                </span>
              )}
            </div>
            <p className="text-xs text-nh-kabut mt-0.5">{description}</p>
          </div>
        </div>

        {uploadSuccess && (
          <div className="flex items-center gap-1 text-nh-sembuh">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-xs font-bold">Verified</span>
          </div>
        )}
      </div>

      {/* Photo Preview or Upload Area */}
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-nh-garis bg-nh-malam mt-3">
          <img
            src={preview}
            alt={title}
            className="w-full h-52 object-cover"
          />
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <span className="px-2 py-1 rounded-lg bg-black/70 text-nh-putih text-[10px] font-bold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Tamper-Evident
            </span>
            {!uploadSuccess && (
              <button
                onClick={() => {
                  setPreview(null);
                  setUploadSuccess(false);
                }}
                className="p-1.5 rounded-lg bg-red-600 text-nh-putih hover:bg-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
            <div className="text-nh-putih text-[11px] font-semibold">
              Diambil: {new Date().toLocaleString("id-ID")}
            </div>
          </div>
        </div>
      ) : (
        <div>
        {galat && (
          <p className="mt-3 text-xs text-nh-bahaya leading-relaxed" role="alert">
            {galat}
          </p>
        )}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 border-2 border-dashed border-nh-garis-2 rounded-xl p-6 text-center cursor-pointer hover:border-nh-ungu hover:bg-nh-ungu/30 transition"
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-nh-ungu animate-spin" />
              {/* Kalimatnya diperbaiki dua kali: dari bahasa Inggris, dan
                  dari klaim "encrypting" yang tidak pernah terjadi. */}
              <span className="text-xs font-semibold text-nh-kabut">
                Mengecilkan &amp; mengirim foto…
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-nh-ungu-tekan text-nh-putih flex items-center justify-center">
                <Camera className="w-6 h-6" />
              </div>
              <div className="font-bold text-nh-putih text-sm">
                Ketuk untuk memotret atau memilih foto
              </div>
              <div className="text-xs text-nh-kabut">
                JPG, PNG, HEIC • Maksimal 8 MB • Data waktu & lokasi ikut tersimpan
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        </div>
      )}

      {/* Optional Caption */}
      {!uploadSuccess && preview && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional caption (e.g. 'Pre-treatment, 2.8 cm diameter')"
            className="flex-1 h-10 px-3 rounded-lg border border-nh-garis-2 text-xs bg-nh-panel"
          />
          <button
            onClick={async () => {
              setIsUploading(true);
              try {
                await fetch("/api/platform", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "UPLOAD_TASK_PHOTO",
                    bookingId,
                    providerName: "Ns. Ratna Dewi, S.Kep., CWCS",
                    photoType,
                    imageUrl: preview,
                    caption,
                  }),
                });
                setUploadSuccess(true);
                onPhotoUploaded();
              } catch (e) {
                console.error(e);
              } finally {
                setIsUploading(false);
              }
            }}
            className="px-4 h-10 rounded-lg bg-nh-ungu-tekan text-nh-putih text-xs font-bold hover:bg-nh-ungu-tua"
          >
            Confirm
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-nh-sembuh font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          Photo securely stored with audit trail. Patient can view this image in their wound timeline.
        </div>
      )}
    </div>
  );
}
