"use client";

import React, { useState } from "react";
import { fotoSudahDihapus } from "@/logic/tugas";
import { X, ShieldCheck, ZoomIn, Calendar, User } from "lucide-react";

interface PhotoGalleryProps {
  photos: any[];
  title?: string;
}

export function PhotoGallery({ photos, title = "Photo Verification Timeline" }: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);

  if (!photos || photos.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-dashed border-nh-garis-2 bg-nh-panel-2/50 text-center text-xs text-nh-kabut">
        No photos uploaded yet for this booking.
      </div>
    );
  }

  const photoTypeLabels: Record<string, { label: string; color: string; icon: string }> = {
    ARRIVAL_CONFIRMATION: { label: "Tiba Verified", color: "bg-blue-100 text-blue-800", icon: "📍" },
    WOUND_BEFORE: { label: "Luka sebelum tindakan", color: "bg-amber-100 text-amber-800", icon: "🩹" },
    WOUND_AFTER: { label: "Luka setelah tindakan", color: "bg-nh-sembuh/15 text-nh-sembuh", icon: "✨" },
    PROCEDURE_COMPLETION: { label: "Procedure Complete", color: "bg-violet-100 text-violet-800", icon: "✅" },
    SUPPLY_VERIFICATION: { label: "Bahan Verified", color: "bg-nh-garis text-nh-putih", icon: "🧰" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-nh-putih text-sm">{title}</h3>
        <span className="text-xs text-nh-kabut">{photos.length} foto</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.map((photo) => {
          const typeInfo = photoTypeLabels[photo.photoType] || {
            label: photo.photoType,
            color: "bg-nh-panel-2 text-nh-putih",
            icon: "📷",
          };

          return (
            <div
              key={photo.id}
              onClick={() => setSelectedPhoto(photo)}
              className="relative group cursor-pointer rounded-xl overflow-hidden border border-nh-garis hover:border-nh-ungu transition hover:shadow-md"
            >
              <div className="aspect-square bg-nh-panel-2 relative overflow-hidden">
                {/* Foto yang gambarnya sudah dihapus karena masa simpan
                    habis. Tanpa cabang ini yang tampil adalah ikon gambar
                    rusak — yang terbaca sebagai aplikasi bermasalah, bukan
                    sebagai kebijakan penyimpanan yang ditepati. */}
                {fotoSudahDihapus(photo) ? (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-nh-kabut-2 text-center px-2 leading-relaxed">
                    Dihapus setelah masa simpan
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photo.imageUrl}
                    alt={photo.caption || typeInfo.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                  <ZoomIn className="w-8 h-8 text-nh-putih opacity-0 group-hover:opacity-100 transition" />
                </div>
              </div>
              <div className="p-2.5 bg-nh-panel space-y-1">
                <span
                  className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${typeInfo.color}`}
                >
                  {typeInfo.icon} {typeInfo.label}
                </span>
                <div className="text-[10px] text-nh-kabut truncate">
                  {new Date(photo.timestamp).toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-nh-panel rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/70 text-nh-putih hover:bg-black transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="max-h-[70vh] overflow-hidden bg-nh-malam flex items-center justify-center">
              <img
                src={selectedPhoto.imageUrl}
                alt={selectedPhoto.caption}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-base font-bold text-nh-putih">
                  {photoTypeLabels[selectedPhoto.photoType]?.label || selectedPhoto.photoType}
                </div>
                <span className="px-2.5 py-1 rounded-full bg-nh-sembuh/15 text-nh-sembuh text-[11px] font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Verified by Provider
                </span>
              </div>

              {selectedPhoto.caption && (
                <p className="text-sm text-nh-kabut italic">{selectedPhoto.caption}</p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-nh-garis text-xs text-nh-kabut">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-nh-kabut-2" />
                  <span>
                    {new Date(selectedPhoto.timestamp).toLocaleString("en-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-nh-kabut-2" />
                  <span>{selectedPhoto.providerName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
