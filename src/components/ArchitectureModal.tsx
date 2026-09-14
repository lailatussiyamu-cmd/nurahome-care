"use client";

import React, { useState } from "react";
import {
  X,
  ShieldCheck,
  Database,
  Cpu,
  CreditCard,
  Lock,
  Layers,
  CheckCircle2,
  FileText,
} from "lucide-react";

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ArchitectureModal({ isOpen, onClose }: ArchitectureModalProps) {
  const [activeTab, setActiveTab] = useState<
    "ARCHITECTURE" | "ERD" | "AI_SAFETY" | "SECURITY_PAYMENT"
  >("ARCHITECTURE");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nh-malam/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-nh-panel rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-nh-garis overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-nh-malam text-nh-putih">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nh-ungu-tekan flex items-center justify-center">
              <Layers className="w-5 h-5 text-nh-putih" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                Full-Stack Healthcare System Architecture & Clinical Blueprint
              </h2>
              <p className="text-xs text-nh-kabut">
                Production Architecture • PostgreSQL + Drizzle ORM • Role-Based Access • AI Triage Guardrails
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-nh-kabut-2 hover:text-nh-putih hover:bg-nh-panel-2 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-nh-garis bg-nh-panel-2 px-6 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("ARCHITECTURE")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "ARCHITECTURE"
                ? "border-nh-ungu text-nh-ungu-muda bg-nh-panel"
                : "border-transparent text-nh-kabut hover:text-nh-putih"
            }`}
          >
            <Layers className="w-4 h-4" /> System Architecture & MVP Scope
          </button>
          <button
            onClick={() => setActiveTab("ERD")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "ERD"
                ? "border-nh-ungu text-nh-ungu-muda bg-nh-panel"
                : "border-transparent text-nh-kabut hover:text-nh-putih"
            }`}
          >
            <Database className="w-4 h-4" /> Relational Database ERD (14 Tables)
          </button>
          <button
            onClick={() => setActiveTab("AI_SAFETY")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "AI_SAFETY"
                ? "border-nh-ungu text-nh-ungu-muda bg-nh-panel"
                : "border-transparent text-nh-kabut hover:text-nh-putih"
            }`}
          >
            <Cpu className="w-4 h-4" /> AI Clinical Triage & Safety Architecture
          </button>
          <button
            onClick={() => setActiveTab("SECURITY_PAYMENT")}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === "SECURITY_PAYMENT"
                ? "border-nh-ungu text-nh-ungu-muda bg-nh-panel"
                : "border-transparent text-nh-kabut hover:text-nh-putih"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Security, Payment & Indonesia Compliance
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-nh-kabut">
          {activeTab === "ARCHITECTURE" && (
            <div className="space-y-5">
              <div className="bg-nh-ungu/10 border border-nh-ungu/30 rounded-xl p-4">
                <h3 className="font-bold text-nh-ungu-muda text-base mb-1">
                  Product Concept & Marketplace Ecosystem
                </h3>
                <p className="text-nh-ungu-muda text-xs leading-relaxed">
                  NuraHome Care connects <strong>Patients & Family Caregivers</strong> directly with{" "}
                  <strong>Certified Wound Care Specialists (CWCS) & Senior Circumcision Practitioners</strong>{" "}
                  for sterile, hospital-grade home visits. Designed with strict least-privilege Role-Based Access Control across three portals: Patient, Nurse Provider, and Admin Director.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-nh-garis rounded-xl p-4 bg-nh-panel">
                  <div className="font-bold text-nh-putih mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-nh-ungu" /> Role 1: Patient & Family
                  </div>
                  <ul className="text-xs space-y-1.5 text-nh-kabut">
                    <li>• Multi-dependent family profile management</li>
                    <li>• 14-point structured wound & circumcision pre-assessment</li>
                    <li>• Transparent Smart Pricing calculator</li>
                    <li>• Live GPS nurse en-route tracking & ETA</li>
                    <li>• Longitudinal wound healing area & pain graphs</li>
                  </ul>
                </div>

                <div className="border border-nh-garis rounded-xl p-4 bg-nh-panel">
                  <div className="font-bold text-nh-putih mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-nh-ungu-muda" /> Role 2: Nurse Provider
                  </div>
                  <ul className="text-xs space-y-1.5 text-nh-kabut">
                    <li>• STR / SIPP credential verification workflow</li>
                    <li>• Least-privilege visit access (assigned bookings only)</li>
                    <li>• AI-assisted clinical SOAP note documentation</li>
                    <li>• Wound measurement & progress image upload</li>
                    <li>• Earnings & completed procedure ledger</li>
                  </ul>
                </div>

                <div className="border border-nh-garis rounded-xl p-4 bg-nh-panel">
                  <div className="font-bold text-nh-putih mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-nh-ungu-muda" /> Role 3: Admin Command
                  </div>
                  <ul className="text-xs space-y-1.5 text-nh-kabut">
                    <li>• Provider STR license verification & radius assignment</li>
                    <li>• Dynamic service catalog & base/fee pricing engine</li>
                    <li>• Manual provider dispatch override</li>
                    <li>• Real-time revenue, booking & cancellation analytics</li>
                    <li>• Immutable security & clinical record audit logs</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "ERD" && (
            <div className="space-y-4">
              <p className="text-xs text-nh-kabut">
                Normalized PostgreSQL database schema implemented via Drizzle ORM (`src/db/schema.ts`):
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 bg-nh-panel-2 rounded-lg border border-nh-garis">
                  <span className="font-bold text-nh-ungu-muda">1. users & dependents</span>
                  <p className="text-nh-kabut mt-1">
                    Stores patient/nurse/admin accounts, emergency contacts, allergies, diabetes status, and family dependents (children/parents).
                  </p>
                </div>
                <div className="p-3 bg-nh-panel-2 rounded-lg border border-nh-garis">
                  <span className="font-bold text-nh-ungu-muda">2. services & providers</span>
                  <p className="text-nh-kabut mt-1">
                    Stores specialized Wound Care & Circumcision catalog items, STR/SIPP nurse license credentials, service radius, and ratings.
                  </p>
                </div>
                <div className="p-3 bg-nh-panel-2 rounded-lg border border-nh-garis">
                  <span className="font-bold text-nh-ungu-muda">3. bookings & addresses</span>
                  <p className="text-nh-kabut mt-1">
                    Tracks 11-stage booking lifecycle (`PAID` → `PROVIDER_ASSIGNED` → `PROVIDER_ON_THE_WAY` → `IN_PROGRESS` → `COMPLETED`) and smart pricing breakdown.
                  </p>
                </div>
                <div className="p-3 bg-nh-panel-2 rounded-lg border border-nh-garis">
                  <span className="font-bold text-nh-ungu-muda">4. wound_assessments & circumcision_assessments</span>
                  <p className="text-nh-kabut mt-1">
                    Structured pre-visit clinical intake (dimensions, exudate, tissue type, pain score, Super-Ring vs Laser preference, guardian consent).
                  </p>
                </div>
                <div className="p-3 bg-nh-panel-2 rounded-lg border border-nh-garis">
                  <span className="font-bold text-nh-ungu-muda">5. clinical_notes & wound_timeline_entries</span>
                  <p className="text-nh-kabut mt-1">
                    Provider-verified SOAP clinical documentation and longitudinal Day 1 → Day 14 wound surface area contraction records.
                  </p>
                </div>
                <div className="p-3 bg-nh-panel-2 rounded-lg border border-nh-garis">
                  <span className="font-bold text-nh-ungu-muda">6. audit_logs, messages, reviews, notifications</span>
                  <p className="text-nh-kabut mt-1">
                    Immutable clinical access audit trail, encrypted patient-nurse chat messages, verified ratings, and real-time status alerts.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "AI_SAFETY" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-bold text-amber-900 text-sm mb-1">
                  Strict Healthcare AI Safety Guardrails
                </h4>
                <p className="text-amber-800 text-xs">
                  The AI assistant strictly operates as a <strong>Clinical Administrative & Decision-Support Assistant</strong>. It never autonomously diagnoses conditions or prescribes medications.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 border border-nh-garis rounded-xl">
                  <div className="font-bold text-nh-putih mb-1">
                    1. Automated Red-Flag Triage Screening
                  </div>
                  <p className="text-nh-kabut">
                    Detects severe arterial bleeding, high fever (&gt;38.5°C), rapid tissue necrosis, or altered consciousness and immediately halts routine booking to escalate to <strong>119 Emergency / Hospital IGD</strong>.
                  </p>
                </div>
                <div className="p-4 border border-nh-garis rounded-xl">
                  <div className="font-bold text-nh-putih mb-1">
                    2. Nurse SOAP Documentation Structurer
                  </div>
                  <p className="text-nh-kabut">
                    Converts nurse voice/text shorthand notes into structured hospital SOAP format (`Subjective`, `Objective`, `Assessment`, `Plan`), requiring explicit nurse digital sign-off before saving.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "SECURITY_PAYMENT" && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-nh-panel-2 rounded-xl border border-nh-garis">
                <div className="font-bold text-nh-putih mb-1 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-nh-ungu" /> Smart Pricing Engine & Payment Gateway Abstraction
                </div>
                <p className="text-nh-kabut">
                  Transparent formula: <code>Base Procedure Price + Distance/Travel Fee + Sterile Bahan Kit + Out-of-Hours Fee = Total Price</code>. Payment status is verified via server-side webhook abstraction supporting QRIS, GoPay, OVO, and Indonesian Virtual Accounts (BCA/Mandiri).
                </p>
              </div>

              <div className="p-4 bg-nh-panel-2 rounded-xl border border-nh-garis">
                <div className="font-bold text-nh-putih mb-1 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-nh-ungu" /> Indonesian Regulatory & Data Privacy Compliance
                </div>
                <p className="text-nh-kabut">
                  Designed in accordance with <strong>Indonesian Personal Data Protection Law (UU PDP No. 27/2022)</strong> and Ministry of Health (Kemenkes) electronic medical record standards. Providers only access patient records for visits explicitly assigned to them.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-nh-panel-2 border-t border-nh-garis flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-nh-ungu-tekan text-nh-putih text-xs font-semibold hover:bg-nh-ungu-tua transition"
          >
            Close Architecture Blueprint
          </button>
        </div>
      </div>
    </div>
  );
}
