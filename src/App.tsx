/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  LogOut,
  Plus,
  ChevronRight,
  Signature,
  LayoutDashboard,
  Calendar,
  Activity,
  Check,
  X,
  History,
  GraduationCap,
  Shield,
  ChevronDown,
  Link,
  Copy,
  ExternalLink,
  Send,
  Search,
  Download,
  Info
} from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import kopSuratImg from "./assets/kop_surat.png";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Role = "student" | "admin";

interface Teacher {
  id: number;
  name: string;
}

interface WaliKelas {
  id: number;
  name: string;
  class_name: string;
}

interface UserData {
  id: number;
  nomor_induk: string;
  name: string;
  role: Role;
  class_name: string;
}

interface Permit {
  id: number;
  student_id: number;
  student_name: string;
  class_name: string;
  type: "izin" | "sakit" | "pkl";
  reason: string;
  start_time: string;
  end_time: string;
  permit_date: string;
  status: "pending_wali" | "wali_approved" | "pending_ph" | "fully_approved";
  sign_slug?: string;
  sign_ph_slug?: string;
  wali_name?: string;
  piket_name?: string;
  ph_name?: string;
  signature_piket?: string;
  signature_wali?: string;
  signature_siswa?: string;
  signature_ph?: string;
  proof_file?: string;
  created_at: string;
}

interface Stats {
  total: number;
  pending: number;
  approved: number;
  types: { type: string; count: number }[];
}

interface PermitLog {
  id: number;
  permit_id: number;
  actor_name: string;
  action: string;
  created_at: string;
  student_name: string;
  type: string;
}

const SCHOOL_END_TIME = "16:00";

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// --- Session persistence (expires after 8 hours) ---
const SESSION_KEY = "siap_user_session";
const TOKEN_KEY = "siap_auth_token";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 jam

function saveSession(user: UserData, token: string) {
  const payload = { user, expiresAt: Date.now() + SESSION_DURATION_MS };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  localStorage.setItem(TOKEN_KEY, token);
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" };
}
function restoreSession(): UserData | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const { user, expiresAt } = JSON.parse(stored);
    if (Date.now() > expiresAt) {
      clearSession();
      return null;
    }
    return user;
  } catch { clearSession(); return null; }
}

// --- Toast notification system ---
interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

let toastIdCounter = 0;

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: Toast["type"] = "info") => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const restoredUser = restoreSession();
  const [user, setUser] = useState<UserData | null>(restoredUser);

  const renderToasts = () => (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertCircle : toast.type === "warning" ? AlertCircle : Info;
          const color = toast.type === "success" ? "#10B981" : toast.type === "error" ? "#EF4444" : toast.type === "warning" ? "#F59E0B" : "#3B82F6";
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="rounded-xl shadow-2xl p-4 flex items-center gap-3 w-80 pointer-events-auto"
              style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
            >
              <Icon className="w-6 h-6 shrink-0" style={{ color }} />
              <p className="text-sm font-medium leading-tight flex-1" style={{ color: '#1F2937' }}>{toast.message}</p>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="ml-auto shrink-0 p-1 rounded-md transition-colors hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  // Detect initial login page from URL
  const getInitialView = (): "login_student" | "login_teacher" | "dashboard" | "form" | "sign" | "logs" => {
    if (restoredUser) return "dashboard";
    const path = window.location.pathname;
    if (path === "/login/teacher") return "login_teacher";
    return "login_student";
  };

  const [view, setView] = useState<
    "login_student" | "login_teacher" | "dashboard" | "form" | "sign" | "logs"
  >(getInitialView());
  const [permits, setPermits] = useState<Permit[]>([]);
  const [logs, setLogs] = useState<PermitLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);

  // Login State
  const [nomor_induk, setNomorInduk] = useState("");
  const [password, setPassword] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");

  // Sign URL modal state
  const [generatedSlug, setGeneratedSlug] = useState<string | null>(null);
  const [phSlug, setPhSlug] = useState<string | null>(null);

  // Pagination State
  const [permitCurrentPage, setPermitCurrentPage] = useState(1);
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const PERMITS_PER_PAGE = 5;
  const LOGS_PER_PAGE = 10;

  // Search and Export state
  const [permitSearchQuery, setPermitSearchQuery] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const [publicSignSlug, setPublicSignSlug] = useState<string | null>(null);
  const [publicPermit, setPublicPermit] = useState<Permit | null>(null);
  const [nig, setNig] = useState("");
  const [publicSignDone, setPublicSignDone] = useState(false);
  const [publicSignError, setPublicSignError] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    type: "izin",
    reason: "",
    start_time: getCurrentTime(),
    end_time: SCHOOL_END_TIME,
    proof_file: "",
  });

  // Detect /sign/:slug URL on mount
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/sign\/([a-f0-9]+)$/);
    if (match) {
      setPublicSignSlug(match[1]);
    }
  }, []);

  // Fetch public permit data when slug detected
  useEffect(() => {
    if (!publicSignSlug) return;
    fetch(`/api/sign/${publicSignSlug}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) setPublicPermit(data);
        else setPublicSignError(data.message || "Surat izin tidak ditemukan");
      })
      .catch(() => setPublicSignError("Gagal memuat data"));
  }, [publicSignSlug]);

  // Fetch teachers for login dropdown
  useEffect(() => {
    if (!publicSignSlug) {
      fetch("/api/teachers").then(r => r.json()).then(setTeachers).catch(() => {});
    }
  }, [publicSignSlug]);

  // Update time fields when type changes
  useEffect(() => {
    if (formData.type === "sakit") {
      setFormData(prev => ({ ...prev, start_time: getCurrentTime(), end_time: SCHOOL_END_TIME }));
    }
  }, [formData.type]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          proof_file: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const sigCanvas = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const hdrs = authHeaders();
      const pRes = await fetch(
        `/api/permits${user?.role === "student" ? `?student_id=${user.id}` : ""}`,
        { headers: hdrs },
      );
      if (pRes.status === 401) { clearSession(); setUser(null); setView("login_student"); return; }
      const pData = await pRes.json();
      setPermits(pData);

      const lRes = await fetch(
        `/api/logs${user?.role === "student" ? `?student_id=${user.id}` : ""}`,
        { headers: hdrs },
      );
      const lData = await lRes.json();
      setLogs(lData);

      if (user?.role === "admin") {
        const sRes = await fetch("/api/stats", { headers: hdrs });
        const sData = await sRes.json();
        setStats(sData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomor_induk.trim()) { showToast("Nomor Induk tidak boleh kosong", "warning"); return; }
    if (!password.trim()) { showToast("Password tidak boleh kosong", "warning"); return; }
    try {
      const res = await fetch("/api/login/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomor_induk, password }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        saveSession(data.user, data.token);
        setUser(data.user);
        setView("dashboard");
        showToast(`Selamat datang, ${data.user.name}!`, "success");
      } else {
        showToast("Nomor Induk atau Password salah", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan koneksi ke server", "error");
    }
  };

  const handleLoginTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacherId) {
      showToast("Pilih nama guru terlebih dahulu", "warning");
      return;
    }
    if (!password.trim()) { showToast("Password tidak boleh kosong", "warning"); return; }
    try {
      const res = await fetch("/api/login/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_id: parseInt(selectedTeacherId), password }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        saveSession(data.user, data.token);
        setUser(data.user);
        setView("dashboard");
        showToast(`Selamat datang, ${data.user.name}!`, "success");
      } else {
        showToast("Password salah", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan koneksi ke server", "error");
    }
  };

  const handleSubmitPermit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !sigCanvas.current) return;
    if (sigCanvas.current.isEmpty()) {
      showToast("Tanda tangan tidak boleh kosong!", "warning");
      return;
    }
    const studentSig = sigCanvas.current.getCanvas().toDataURL("image/png");

    if (formData.start_time > formData.end_time) {
      showToast("Jam mulai tidak boleh lebih besar dari jam selesai!", "warning");
      return;
    }
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch("/api/permits", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          student_id: user.id,
          student_name: user.name,
          class_name: user.class_name,
          type: formData.type,
          reason: formData.reason,
          start_time: formData.start_time,
          end_time: formData.end_time,
          permit_date: today,
          proof_file: formData.proof_file,
          signature_siswa: studentSig,
          actor_name: user.name,
        }),
      });
      const data = await res.json();
      if (data.sign_slug) {
        setGeneratedSlug(data.sign_slug);
      }
      fetchData();
      setFormData({
        type: "izin",
        reason: "",
        start_time: getCurrentTime(),
        end_time: SCHOOL_END_TIME,
        proof_file: "",
      });
    } catch (err) {
      showToast("Gagal mengirim surat. Periksa koneksi Anda.", "error");
    }
  };

  const handleSign = async () => {
    if (!selectedPermit || !sigCanvas.current) return;
    if (sigCanvas.current.isEmpty()) {
      showToast("Tanda tangan tidak boleh kosong!", "warning");
      return;
    }
    const signature = sigCanvas.current.getCanvas().toDataURL("image/png");

    try {
      const res = await fetch(`/api/permits/${selectedPermit.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          signature_piket: signature,
          actor_name: user?.name,
        }),
      });
      const data = await res.json();
      if (data.sign_ph_slug) {
        setPhSlug(data.sign_ph_slug);
      }
      fetchData();
      setView("dashboard");
      setSelectedPermit(null);
      showToast("Berhasil menandatangani!", "success");
    } catch (err) {
      showToast("Gagal menandatangani. Periksa koneksi.", "error");
    }
  };

  // =====================================================================
  // FIX: Tentukan isPH berdasarkan STATUS permit, BUKAN perbandingan slug.
  //
  // BUG LAMA:
  //   const isPH = publicPermit?.sign_ph_slug === publicSignSlug;
  //   → Jika API /api/sign/:slug tidak mengembalikan field sign_ph_slug,
  //     maka isPH selalu false → status check salah → form TTD tidak muncul.
  //
  // FIX BARU:
  //   const isPH = publicPermit?.status === "pending_ph";
  //   → Tidak bergantung pada slug comparison, cukup cek status permit.
  //   → Wali Kelas selalu TTD saat status "pending_wali" (isPH = false).
  //   → PH selalu TTD saat status "pending_ph" (isPH = true).
  // =====================================================================
  const isPH = publicPermit?.status === "pending_ph";

  // Handle wali kelas / PH signing from public page
  const handlePublicSign = async () => {
    if (!nig.trim()) {
      showToast(isPH ? "NIG PH tidak boleh kosong!" : "NIG Wali Kelas tidak boleh kosong!", "warning");
      return;
    }

    // FIX: Tambahkan null check untuk sigCanvas.current sebelum .isEmpty()
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      showToast("Tanda tangan tidak boleh kosong!", "warning");
      return;
    }

    setLoading(true);
    const signature = sigCanvas.current.getCanvas().toDataURL("image/png");
    try {
      // FIX: Payload sesuai isPH yang sudah diperbaiki
      const payload = isPH
        ? { ph_nig: nig.trim(), signature_ph: signature }
        : { nig: nig.trim(), signature_wali: signature };

      const res = await fetch(`/api/sign/${publicSignSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setPublicSignDone(true);
        showToast("Berhasil ditandatangani!", "success");
      } else {
        showToast(data.message || "Gagal menandatangani", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan koneksi", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExportFromLog = async (permit_id: number) => {
    const existingPermit = permits.find((p) => p.id === permit_id);
    if (existingPermit) {
      exportToPDF(existingPermit);
      return;
    }
    try {
      const res = await fetch(`/api/permits/${permit_id}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success && data.permit) {
        exportToPDF(data.permit);
      } else {
        showToast("Gagal memuat detail izin untuk diunduh", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan jaringan", "error");
    }
  };

  const exportToPDF = (permit: Permit) => {
    const doc = new jsPDF();
    const img = new Image();
    img.src = kopSuratImg;

    img.onload = () => {
      // Calculate aspect ratio for A4 width
      const imgWidth = 190;
      const imgHeight = (img.height * imgWidth) / img.width;

      doc.addImage(img, "PNG", 10, 5, imgWidth, imgHeight);

      const startY = imgHeight + 15;

      // Content
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("SURAT KETERANGAN PERIZINAN", 105, startY, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Nama Siswa: ${permit.student_name}`, 20, startY + 15);
      doc.text(`Kelas: ${permit.class_name}`, 20, startY + 25);
      doc.text(
        `Jenis Izin: ${permit.type === "sakit" ? "Sakit" : permit.type === "pkl" ? "PKL" : "Izin"}`,
        20,
        startY + 35,
      );
      doc.text(`Alasan: ${permit.reason}`, 20, startY + 45, { maxWidth: 170 });
      doc.text(`Tanggal: ${permit.permit_date}`, 20, startY + 65);
      doc.text(`Waktu: ${permit.start_time} - ${permit.end_time}`, 20, startY + 75);
      doc.text(`ID Referensi: SIAP-${permit.id}-${Date.now().toString().slice(-4)}`, 20, startY + 85);

      // Signatures Layout
      const piketName = permit.piket_name || "Guru Piket";
      const waliName = permit.wali_name || "Wali Kelas";
      const phNameText = permit.ph_name || "PH";

      // Top Left: Guru Piket
      doc.text("Menyetujui,", 20, startY + 105);
      doc.text("Guru Piket,", 20, startY + 110);
      if (permit.signature_piket) {
        doc.addImage(permit.signature_piket, "PNG", 20, startY + 115, 40, 20);
      }
      doc.text(`(${piketName})`, 20, startY + 145);

      // Top Right: Siswa
      doc.text("Pemohon,", 140, startY + 105);
      doc.text("Siswa,", 140, startY + 110);
      if (permit.signature_siswa) {
        doc.addImage(permit.signature_siswa, "PNG", 140, startY + 115, 40, 20);
      }
      doc.text(`(${permit.student_name})`, 140, startY + 145);

      // Bottom Left: PH
      doc.text("Mengetahui,", 20, startY + 165);
      doc.text("PH,", 20, startY + 170);
      if (permit.signature_ph) {
        doc.addImage(permit.signature_ph, "PNG", 20, startY + 175, 40, 20);
      }
      doc.text(`(${phNameText})`, 20, startY + 205);

      // Bottom Right: Wali Kelas
      doc.text("Wali Kelas,", 140, startY + 165);
      if (permit.signature_wali) {
        doc.addImage(permit.signature_wali, "PNG", 140, startY + 175, 40, 20);
      }
      doc.text(`(${waliName})`, 140, startY + 205);

      // Footer
      doc.setFontSize(8);
      doc.text(
        "Dokumen ini dihasilkan secara digital oleh SIAP SMK Plus Pelita Nusantara dan dinyatakan sah sebagai pengganti surat fisik.",
        105,
        280,
        { align: "center" },
      );

      doc.save(`Surat_Izin_${permit.student_name}_${permit.id}.pdf`);
    };

    img.onerror = () => {
      showToast("Gagal memuat gambar kop surat ke dalam PDF", "error");
    };
  };

  const handleExportToExcel = () => {
    if (!exportStartDate || !exportEndDate) {
      showToast("Pilih rentang tanggal terlebih dahulu", "warning");
      return;
    }

    const start = new Date(exportStartDate);
    const end = new Date(exportEndDate);

    const toExport = permits.filter(p => {
      const pDate = new Date(p.permit_date);
      return p.status === "fully_approved" && pDate >= start && pDate <= end;
    });

    if (toExport.length === 0) {
      showToast("Tidak ada data yang disetujui pada rentang tanggal tersebut", "info");
      return;
    }

    const exportData = toExport.map(p => ({
      "ID": p.id,
      "Tanggal": p.permit_date,
      "Nama Siswa": p.student_name,
      "Kelas": p.class_name,
      "Kategori": p.type === "sakit" ? "Sakit" : "Izin",
      "Waktu": `${p.start_time} - ${p.end_time}`,
      "Alasan": p.reason,
      "Wali Kelas": p.wali_name || "-",
      "Guru Piket": p.piket_name || "-"
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan_Perizinan");
    XLSX.writeFile(wb, `Laporan_Perizinan_${exportStartDate}_sd_${exportEndDate}.xlsx`);

    setShowExportModal(false);
    showToast("Berhasil mengekspor data", "success");
  };

  // Pagination and Search logic
  const filteredPermits = permits.filter((p) => {
    if (!permitSearchQuery) return true;
    const q = permitSearchQuery.toLowerCase();
    return (
      p.student_name.toLowerCase().includes(q) ||
      p.class_name.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q) ||
      p.reason.toLowerCase().includes(q)
    );
  });

  const paginatedPermits = filteredPermits.slice(
    (permitCurrentPage - 1) * PERMITS_PER_PAGE,
    permitCurrentPage * PERMITS_PER_PAGE
  );
  const totalPermitPages = Math.ceil(filteredPermits.length / PERMITS_PER_PAGE);

  const paginatedLogs = logs.slice(
    (logCurrentPage - 1) * LOGS_PER_PAGE,
    logCurrentPage * LOGS_PER_PAGE
  );
  const totalLogPages = Math.ceil(logs.length / LOGS_PER_PAGE);

  // =====================
  // PUBLIC SIGN PAGE (Wali Kelas / PH via link)
  // =====================
  if (publicSignSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden" style={{ background: '#F9F6F2' }}>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-[120px] opacity-10 -translate-y-1/2 translate-x-1/3" style={{ background: '#6D1408' }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-[120px] opacity-5 translate-y-1/2 -translate-x-1/3" style={{ background: '#1F2937' }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden relative z-10"
          style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
        >
          <div className="p-8 text-center" style={{ borderBottom: '1px solid #D5D5D5' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl" style={{ background: '#6D1408', boxShadow: '0 10px 30px rgba(109,20,8,0.3)' }}>
              <Signature className="w-8 h-8" style={{ color: '#F9F6F2' }} />
            </div>
            {/* FIX: Gunakan isPH (berbasis status) bukan perbandingan slug */}
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#1F2937' }}>
              Tanda Tangan {isPH ? "Penanggung Jawab Harian (PH)" : "Wali Kelas"}
            </h1>
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mt-2" style={{ color: '#393939' }}>
              SIAP • SMK Plus Pelita Nusantara
            </p>
          </div>

          {publicSignError ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#6D1408' }} />
              <p className="text-sm font-medium" style={{ color: '#1F2937' }}>{publicSignError}</p>
            </div>
          ) : publicSignDone ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(109,20,8,0.1)' }}>
                <Check className="w-8 h-8" style={{ color: '#6D1408' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: '#1F2937' }}>Berhasil Ditandatangani!</h3>
              {/* FIX: Pesan sukses sesuai isPH yang sudah diperbaiki */}
              <p className="text-sm" style={{ color: '#393939' }}>
                Surat izin telah disetujui. {isPH ? "Proses perizinan selesai." : "Siswa dapat melanjutkan proses ke Guru Piket."}
              </p>
            </div>
          ) : publicPermit ? (
            <div className="p-6 space-y-5">
              {/* Permit Details */}
              <div className="rounded-2xl p-5 space-y-3" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#393939' }}>Detail Pengajuan</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase" style={{ color: '#393939' }}>Nama Siswa</p>
                    <p className="font-semibold" style={{ color: '#1F2937' }}>{publicPermit.student_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase" style={{ color: '#393939' }}>Kelas</p>
                    <p className="font-semibold" style={{ color: '#1F2937' }}>{publicPermit.class_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase" style={{ color: '#393939' }}>Kategori</p>
                    <p className="font-semibold capitalize" style={{ color: '#1F2937' }}>
                      {publicPermit.type === "sakit" ? "Sakit" : publicPermit.type === "pkl" ? "PKL" : "Izin"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase" style={{ color: '#393939' }}>Waktu</p>
                    <p className="font-semibold" style={{ color: '#1F2937' }}>{publicPermit.start_time} - {publicPermit.end_time}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold uppercase" style={{ color: '#393939' }}>Alasan</p>
                    <p className="font-medium p-3 rounded-xl mt-1" style={{ color: '#1F2937', background: '#FFFFFF', border: '1px solid #D5D5D5' }}>{publicPermit.reason}</p>
                  </div>
                </div>
              </div>

              {/* =================================================================
                  FIX UTAMA: Kondisi pengecekan status sebelum menampilkan form TTD.
                  
                  BUG LAMA:
                    publicPermit.status !== (publicPermit.sign_ph_slug === publicSignSlug
                      ? "pending_ph" : "pending_wali")
                  → Jika sign_ph_slug null dari API, selalu cek "pending_wali"
                  → Status "pending_ph" !== "pending_wali" → true → tampil "Sudah TTD" ❌
                  
                  FIX BARU:
                    publicPermit.status !== (isPH ? "pending_ph" : "pending_wali")
                  → isPH sudah benar (berbasis status), sehingga kondisi ini akurat ✓
                  ================================================================= */}
              {publicPermit.status !== (isPH ? "pending_ph" : "pending_wali") ? (
                <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(109,20,8,0.08)', border: '1px solid rgba(109,20,8,0.2)' }}>
                  <Check className="w-6 h-6 mx-auto mb-2" style={{ color: '#6D1408' }} />
                  <p className="text-sm font-bold" style={{ color: '#6D1408' }}>Surat ini sudah ditandatangani</p>
                </div>
              ) : (
                <>
                  {/* Signer Input */}
                  <div className="space-y-2">
                    {/* FIX: Label menggunakan isPH yang sudah diperbaiki */}
                    <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                      {isPH ? "NIG Penanggung Jawab Harian (PH)" : "Nomor Induk Guru (NIG) Wali Kelas"}
                    </label>
                    <div className="relative">
                      <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 z-10" style={{ color: '#393939' }} />
                      <input
                        type="text"
                        value={nig}
                        onChange={(e) => setNig(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 border rounded-xl outline-none transition-all text-sm font-medium shadow-sm"
                        style={{ background: '#FFFFFF', borderColor: '#D5D5D5', color: '#1F2937' }}
                        placeholder={isPH ? "Masukkan NIG PH" : "Masukkan NIG Wali Kelas"}
                        required
                      />
                    </div>
                  </div>

                  {/* Signature Pad */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>Tanda Tangan</label>
                      <button
                        onClick={() => sigCanvas.current?.clear()}
                        className="text-xs font-semibold" style={{ color: '#6D1408' }}
                      >
                        Reset
                      </button>
                    </div>
                    <div className="rounded-xl h-40 overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                      <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{ className: "w-full h-full cursor-crosshair" }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePublicSign}
                    disabled={!nig || loading}
                    className="w-full font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] text-sm hover:brightness-110 disabled:opacity-40"
                    style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 24px rgba(109,20,8,0.25)' }}
                  >
                    {loading ? "Memproses..." : "Setujui & Tanda Tangan"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#D5D5D5', borderTopColor: '#6D1408' }} />
              <p className="text-sm font-medium" style={{ color: '#393939' }}>Memuat data...</p>
            </div>
          )}

          <p className="text-center text-[10px] font-medium tracking-wide py-4" style={{ color: '#393939', borderTop: '1px solid #D5D5D5' }}>
            © 2026 Devacto IT RPL • SMK PNB
          </p>
        </motion.div>
        {renderToasts()}
      </div>
    );
  }

  // =====================
  // LOGIN PAGE: STUDENT (Dark Theme)
  // =====================
  if (view === "login_student" && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden" style={{ background: '#F9F6F2' }}>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-[120px] opacity-10 -translate-y-1/2 translate-x-1/3" style={{ background: '#6D1408' }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-[120px] opacity-5 translate-y-1/2 -translate-x-1/3" style={{ background: '#1F2937' }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10"
          style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
        >
          <div className="p-10 text-center pb-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl" style={{ background: '#6D1408', boxShadow: '0 10px 30px rgba(109,20,8,0.3)' }}>
              <GraduationCap className="w-10 h-10" style={{ color: '#F9F6F2' }} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1F2937' }}>
              Login Siswa
            </h1>
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mt-2" style={{ color: '#393939' }}>
              SIAP • SMK Plus Pelita Nusantara
            </p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleLoginStudent}
            className="p-10 pt-6 space-y-5"
          >
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                Nomor Induk Siswa
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#393939' }} />
                <input
                  type="text"
                  value={nomor_induk}
                  onChange={(e) => setNomorInduk(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 border rounded-xl focus:ring-4 outline-none transition-all text-sm font-medium shadow-sm"
                  style={{ background: '#FFFFFF', borderColor: '#D5D5D5', color: '#1F2937' }}
                  placeholder="Masukkan Nomor Induk"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                Password
              </label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#393939' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 border rounded-xl focus:ring-4 outline-none transition-all text-sm font-medium shadow-sm"
                  style={{ background: '#FFFFFF', borderColor: '#D5D5D5', color: '#1F2937' }}
                  placeholder="Masukkan password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full font-semibold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] text-sm mt-2 hover:brightness-110"
              style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 24px rgba(109,20,8,0.25)' }}
            >
              Masuk sebagai Murid
            </button>
          </motion.form>

          <p className="text-center text-[10px] font-medium tracking-wide pb-6 pt-4" style={{ color: '#393939', borderTop: '1px solid #D5D5D5' }}>
            © 2026 Devacto IT RPL • SMK PNB
          </p>
        </motion.div>
        {renderToasts()}
      </div>
    );
  }

  // =====================
  // LOGIN PAGE: GURU PIKET (Dark Theme)
  // =====================
  if (view === "login_teacher" && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden" style={{ background: '#F9F6F2' }}>
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full blur-[120px] opacity-10 -translate-y-1/2 -translate-x-1/3" style={{ background: '#6D1408' }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full blur-[120px] opacity-5 translate-y-1/2 translate-x-1/3" style={{ background: '#1F2937' }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10"
          style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
        >
          <div className="p-10 text-center pb-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl" style={{ background: '#6D1408', boxShadow: '0 10px 30px rgba(109,20,8,0.3)' }}>
              <Shield className="w-10 h-10" style={{ color: '#F9F6F2' }} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1F2937' }}>
              Login Guru Piket
            </h1>
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mt-2" style={{ color: '#393939' }}>
              SIAP • SMK Plus Pelita Nusantara
            </p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleLoginTeacher}
            className="p-10 pt-6 space-y-5"
          >
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                Nama Guru Piket
              </label>
              <div className="relative">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 z-10" style={{ color: '#393939' }} />
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full pl-12 pr-10 py-3.5 border rounded-xl outline-none transition-all text-sm font-medium shadow-sm appearance-none cursor-pointer"
                  style={{ background: '#FFFFFF', borderColor: '#D5D5D5', color: '#1F2937' }}
                  required
                >
                  <option value="">— Pilih Guru —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#393939' }} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                Password
              </label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#393939' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 border rounded-xl focus:ring-4 outline-none transition-all text-sm font-medium shadow-sm"
                  style={{ background: '#FFFFFF', borderColor: '#D5D5D5', color: '#1F2937' }}
                  placeholder="Masukkan password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full font-semibold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] text-sm mt-2 hover:brightness-110"
              style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 24px rgba(109,20,8,0.25)' }}
            >
              Masuk sebagai Guru Piket
            </button>
          </motion.form>

          <p className="text-center text-[10px] font-medium tracking-wide pb-6 pt-4" style={{ color: '#393939', borderTop: '1px solid #D5D5D5' }}>
            © 2026 Devacto IT RPL • SMK PNB
          </p>
        </motion.div>
        {renderToasts()}
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans flex flex-col" style={{ background: '#F9F6F2', color: '#1F2937' }}>
      {/* Header */}
      <header className="px-8 h-20 flex items-center justify-between shadow-sm z-50 sticky top-0" style={{ background: '#1F2937', borderBottom: '1px solid #393939' }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md" style={{ background: '#6D1408' }}>
            <FileText className="w-5 h-5" style={{ color: '#F9F6F2' }} />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight" style={{ color: '#F9F6F2' }}>
              E-SIAP
            </h1>
            <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: '#D5D5D5' }}>
              Pelita Nusantara
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(109,20,8,0.2)', color: '#F9F6F2', border: '1px solid rgba(109,20,8,0.4)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#6D1408', boxShadow: '0 0 8px rgba(109,20,8,0.5)' }} />
            Active 2025/26
          </div>
          <div className="flex items-center gap-4 pl-6" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold leading-none" style={{ color: '#F9F6F2' }}>
                {user.name}
              </p>
              <p className="text-[10px] font-medium mt-1" style={{ color: '#D5D5D5' }}>
                {user.role === "admin" ? "Guru Piket" : user.class_name}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(109,20,8,0.3)', color: '#F9F6F2', border: '1px solid rgba(109,20,8,0.4)' }}>
              {user.name.charAt(0)}
            </div>
            <button
              onClick={() => setView(view === "logs" ? "dashboard" : "logs")}
              className="p-2.5 rounded-xl transition-all" style={{ color: '#D5D5D5' }}
              title="Audit Logs"
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={() => { clearSession(); setUser(null); setView("login_student"); window.history.pushState({}, "", "/"); }}
              className="p-2.5 rounded-xl transition-all" style={{ color: '#D5D5D5' }}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {view === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {/* LEFT SIDE: Student / Admin Overview */}
              <section
                className={cn(
                  "rounded-[2rem] shadow-sm flex flex-col overflow-hidden",
                )}
                style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
              >
                <div
                  className={cn(
                    "px-8 py-6 flex justify-between items-center",
                  )}
                  style={{ borderBottom: '1px solid #D5D5D5' }}
                >
                  <h2
                    className={cn(
                      "font-bold text-sm tracking-tight flex items-center gap-3",
                    )}
                    style={{ color: '#1F2937' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                      <LayoutDashboard className="w-4 h-4" />
                    </div>
                    {user.role === "student"
                      ? "Panel Murid"
                      : "Ikhtisar Sistem"}
                  </h2>
                  <span
                    className={cn(
                      "text-[10px] uppercase font-semibold px-3 py-1 rounded-full",
                    )}
                    style={{ color: '#393939', background: '#F9F6F2', border: '1px solid #D5D5D5' }}
                  >
                    {user.role === "admin" ? "GURU PIKET" : "SISWA"}
                  </span>
                </div>

                <div className="p-8 flex-1 space-y-6 overflow-y-auto">
                  {user.role === "student" ? (
                    <>
                      <div className="flex items-center justify-between p-6 rounded-2xl" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                        <div>
                          <h3 className="text-sm font-bold" style={{ color: '#1F2937' }}>
                            Aksi Cepat
                          </h3>
                          <p className="text-xs mt-1" style={{ color: '#393939' }}>
                            Buat pengajuan baru
                          </p>
                        </div>
                        <button
                          onClick={() => setView("form")}
                          className="px-6 py-3.5 rounded-xl flex items-center gap-2 font-semibold text-sm shadow-lg active:scale-[0.98] transition-all hover:brightness-110"
                          style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 20px rgba(109,20,8,0.25)' }}
                        >
                          <Plus className="w-4 h-4" />
                          <span>Minta Izin</span>
                        </button>
                      </div>
                      <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'rgba(109,20,8,0.06)', border: '1px solid rgba(109,20,8,0.15)' }}>
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                            <AlertCircle className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-bold leading-tight" style={{ color: '#1F2937' }}>
                              Prosedur Penting
                            </p>
                            <p className="text-xs font-medium leading-relaxed mt-1" style={{ color: '#393939' }}>
                              Gunakan identitas asli dan alasan jujur. Seluruh
                              data terekam oleh sistem{" "}
                              <strong>Devacto IT RPL</strong> untuk keamanan
                              bersama.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Admin Global Stats */
                    stats && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 rounded-2xl flex flex-col justify-center items-center" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                              Total Hari Ini
                            </p>
                            <p className="text-4xl font-bold mt-3 tabular-nums" style={{ color: '#1F2937' }}>
                              {stats.total}
                            </p>
                          </div>
                          <div className="p-6 rounded-2xl shadow-lg flex flex-col justify-center items-center" style={{ background: '#6D1408', boxShadow: '0 8px 24px rgba(109,20,8,0.25)' }}>
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(249,246,242,0.7)' }}>
                              Menunggu TTD
                            </p>
                            <p className="text-4xl font-bold mt-3 tabular-nums" style={{ color: '#F9F6F2' }}>
                              {stats.pending}
                            </p>
                          </div>
                        </div>
                        <div className="p-6 rounded-2xl" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                          <h4 className="text-xs font-semibold mb-4 flex items-center gap-2" style={{ color: '#393939' }}>
                            Statistik Perizinan
                          </h4>
                          <div className="space-y-3">
                            {stats.types.map((t) => (
                              <div
                                key={t.type}
                                className="flex items-center justify-between p-3 rounded-xl"
                                style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center",
                                    )}
                                    style={t.type === "sakit" ? { background: 'rgba(109,20,8,0.1)', color: '#6D1408' } : { background: '#F9F6F2', color: '#393939' }}
                                  >
                                    {t.type === "sakit" ? (
                                      <Activity className="w-4 h-4" />
                                    ) : (
                                      <Calendar className="w-4 h-4" />
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold capitalize">
                                    {t.type}
                                  </span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                  <span className="text-lg font-bold" style={{ color: '#1F2937' }}>
                                    {t.count}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>

              {/* RIGHT SIDE: List of Permits */}
              <section
                className={cn(
                  "rounded-[2rem] shadow-sm flex flex-col overflow-hidden",
                )}
                style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
              >
                <div
                  className={cn(
                    "px-8 py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4",
                  )}
                  style={{ borderBottom: '1px solid #D5D5D5' }}
                >
                  <h2
                    className={cn(
                      "font-bold text-sm tracking-tight flex items-center gap-3",
                    )}
                    style={{ color: '#1F2937' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                      <FileText className="w-4 h-4" />
                    </div>
                    {user.role === "admin"
                      ? "Antrean Persetujuan"
                      : "Riwayat Laporan"}
                  </h2>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#393939' }} />
                      <input
                        type="text"
                        placeholder="Cari nama, kelas..."
                        value={permitSearchQuery}
                        onChange={(e) => {
                          setPermitSearchQuery(e.target.value);
                          setPermitCurrentPage(1);
                        }}
                        className="w-full pl-9 pr-4 py-2 rounded-xl text-xs font-medium outline-none transition-all shadow-sm"
                        style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                      />
                    </div>
                    {user.role === "admin" && (
                      <button
                        onClick={() => setShowExportModal(true)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2 active:scale-[0.98]"
                        style={{ background: '#6D1408', color: '#F9F6F2', border: '1px solid rgba(109,20,8,0.2)' }}
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-3">
                  {filteredPermits.length === 0 ? (
                    <div
                      className={cn(
                        "p-12 rounded-2xl border-2 border-dashed text-center",
                      )}
                      style={{ borderColor: '#D5D5D5' }}
                    >
                      <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: '#D5D5D5' }} />
                      <p className="text-sm font-medium" style={{ color: '#393939' }}>
                        Belum ada data tersedia
                      </p>
                    </div>
                  ) : (
                    paginatedPermits.map((permit) => (
                      <motion.div
                        layout
                        key={permit.id}
                        className={cn(
                          "p-5 rounded-2xl border flex items-center justify-between transition-all group duration-200",
                        )}
                        style={
                          permit.status === "wali_approved"
                            ? { background: 'rgba(109,20,8,0.04)', border: '1px solid rgba(109,20,8,0.15)' }
                            : permit.status === "pending_wali"
                              ? { background: '#F9F6F2', border: '1px solid #D5D5D5' }
                              : { background: '#FFFFFF', border: '1px solid #D5D5D5' }
                        }
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm",
                            )}
                            style={
                              permit.type === "sakit"
                                ? { background: 'rgba(109,20,8,0.1)', color: '#6D1408' }
                                : { background: '#F9F6F2', color: '#393939' }
                            }
                          >
                            {user.role === "admin" ? (
                              permit.student_name.substring(0, 2).toUpperCase()
                            ) : permit.type === "sakit" ? (
                              <Activity className="w-5 h-5" />
                            ) : (
                              <Calendar className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p
                              className={cn("text-sm font-bold")}
                              style={{ color: '#1F2937' }}
                            >
                              {user.role === "admin"
                                ? permit.student_name
                                : permit.type === "sakit"
                                  ? "Sakit"
                                  : permit.type === "pkl"
                                    ? "PKL"
                                    : "Izin"}
                            </p>
                            <p className="text-xs font-medium mt-1" style={{ color: '#393939' }}>
                              {permit.class_name} • {permit.permit_date} ({permit.start_time} - {permit.end_time})
                            </p>
                            {permit.proof_file && (
                              <a
                                href={permit.proof_file}
                                download={`Lampiran_Sakit_${permit.student_name.replace(/\s+/g, "_")}`}
                                className="text-[10px] flex items-center gap-1 mt-1.5 font-semibold"
                                style={{ color: '#6D1408' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <FileText className="w-3 h-3" /> Unduh Lampiran
                                Sakit
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {user.role === "admin" ? (
                            permit.status === "wali_approved" ? (
                              <button
                                onClick={() => {
                                  setSelectedPermit(permit);
                                  setView("sign");
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-[0.98] hover:brightness-110"
                                style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 4px 16px rgba(109,20,8,0.3)' }}
                              >
                                Tanda Tangan Piket
                              </button>
                            ) : permit.status === "pending_ph" ? (
                              <button
                                onClick={() => {
                                  setPhSlug(permit.sign_ph_slug || null);
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-[0.98] hover:brightness-110 flex items-center gap-2"
                                style={{ background: '#F9F6F2', color: '#6D1408', border: '1px solid #6D1408' }}
                              >
                                <Link className="w-3 h-3" /> Lihat Link PH
                              </button>
                            ) : (
                              <div className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5" style={{ background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }}>
                                <Check className="w-3.5 h-3.5" />
                                Selesai
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-2">
                              {user.role === "student" && permit.status === "pending_wali" && (
                                <button
                                  onClick={() => setGeneratedSlug(permit.sign_slug || null)}
                                  className="p-2 rounded-lg transition-all active:scale-[0.98]"
                                  style={{ background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }}
                                  title="Lihat Link Wali Kelas"
                                >
                                  <Link className="w-4 h-4" />
                                </button>
                              )}
                              {user.role === "student" &&
                                permit.status === "fully_approved" && (
                                  <button
                                    onClick={() => exportToPDF(permit)}
                                    className="p-2 rounded-lg transition-all active:scale-[0.98]"
                                    style={{ background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }}
                                    title="Unduh PDF"
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                )}
                              <span
                                className={cn(
                                  "text-xs font-semibold px-2.5 py-1 rounded-lg",
                                )}
                                style={
                                  permit.status === "pending_wali"
                                    ? { background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }
                                    : permit.status === "wali_approved"
                                      ? { background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }
                                      : { background: 'rgba(109,20,8,0.1)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.2)' }
                                }
                              >
                                {permit.status === "pending_wali"
                                  ? "Menunggu Wali"
                                  : permit.status === "wali_approved"
                                    ? "Menunggu Piket"
                                    : permit.status === "pending_ph"
                                      ? "Menunggu PH"
                                      : "Disetujui"}
                              </span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
                {totalPermitPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-4" style={{ borderTop: '1px solid #D5D5D5' }}>
                    <button
                      disabled={permitCurrentPage === 1}
                      onClick={() => setPermitCurrentPage(p => p - 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                      style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs font-medium" style={{ color: '#393939' }}>
                      Hal {permitCurrentPage} dari {totalPermitPages}
                    </span>
                    <button
                      disabled={permitCurrentPage === totalPermitPages}
                      onClick={() => setPermitCurrentPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                      style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                    >
                      Selanjutnya
                    </button>
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {view === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-4xl mx-auto w-full"
            >
              <div className="rounded-[2rem] shadow-lg overflow-hidden flex flex-col h-[70vh]" style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #D5D5D5' }}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base" style={{ color: '#1F2937' }}>
                        Log Aktivitas Perizinan
                      </h3>
                      <p className="text-xs font-medium" style={{ color: '#393939' }}>
                        Audit Trail Perubahan Status
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setView("dashboard")}
                    className="p-2 rounded-full transition-colors" style={{ color: '#393939' }}>
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-0">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 shadow-sm" style={{ background: '#FFFFFF', borderBottom: '1px solid #D5D5D5' }}>
                      <tr>
                        <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Waktu
                        </th>
                        <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Pelaku
                        </th>
                        <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Aktivitas
                        </th>
                        <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Siswa
                        </th>
                        <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Jenis
                        </th>
                        <th className="px-6 py-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody style={{ borderColor: '#D5D5D5' }} className="divide-y">
                      {paginatedLogs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-16 text-center text-sm font-medium"
                            style={{ color: '#393939' }}
                          >
                            Belum ada aktivitas tercatat
                          </td>
                        </tr>
                      ) : (
                        paginatedLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="transition-colors"
                            style={{ borderColor: '#D5D5D5' }}
                          >
                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold" style={{ color: '#1F2937' }}>
                                {new Date(log.created_at).toLocaleDateString()}
                              </p>
                              <p className="text-xs font-medium" style={{ color: '#393939' }}>
                                {new Date(log.created_at).toLocaleTimeString()}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }}>
                                  {log.actor_name.charAt(0)}
                                </div>
                                <span className="text-sm font-semibold" style={{ color: '#1F2937' }}>
                                  {log.actor_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "text-xs font-semibold px-2.5 py-1 rounded-lg",
                                )}
                                style={
                                  log.action.includes("Mengajukan")
                                    ? { background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }
                                    : log.action.includes("Menyetujui")
                                      ? { background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }
                                      : { background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }
                                }
                              >
                                {log.action}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-medium" style={{ color: '#393939' }}>
                              {log.student_name}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "text-xs font-bold capitalize px-2 py-1 rounded-md",
                                )}
                                style={
                                  log.type === "sakit"
                                    ? { background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }
                                    : { background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }
                                }
                              >
                                {log.type}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => handleExportFromLog(log.permit_id)}
                                className="p-2 rounded-lg transition-all active:scale-[0.98]"
                                style={{ background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }}
                                title="Unduh PDF"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 flex items-center justify-between" style={{ borderTop: '1px solid #D5D5D5' }}>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={logCurrentPage === 1}
                      onClick={() => setLogCurrentPage(p => p - 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                      style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs font-medium" style={{ color: '#393939' }}>
                      Hal {logCurrentPage} dari {Math.max(1, totalLogPages)}
                    </span>
                    <button
                      disabled={logCurrentPage === totalLogPages || totalLogPages === 0}
                      onClick={() => setLogCurrentPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                      style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                    >
                      Selanjutnya
                    </button>
                  </div>
                  <p className="text-xs font-medium" style={{ color: '#393939' }}>
                    Menampilkan total {logs.length} entri riwayat
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Export Excel Modal */}
          <AnimatePresence>
            {showExportModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={() => setShowExportModal(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-5"
                  style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold" style={{ color: '#1F2937' }}>Export Laporan</h3>
                    <button onClick={() => setShowExportModal(false)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                      <X className="w-4 h-4" style={{ color: '#393939' }} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>Tanggal Mulai</label>
                      <input
                        type="date"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="w-full text-sm font-medium rounded-xl p-3 outline-none transition-all shadow-sm"
                        style={{ background: '#F9F6F2', border: '1px solid #D5D5D5', color: '#1F2937' }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>Tanggal Selesai</label>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                        className="w-full text-sm font-medium rounded-xl p-3 outline-none transition-all shadow-sm"
                        style={{ background: '#F9F6F2', border: '1px solid #D5D5D5', color: '#1F2937' }}
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-center leading-relaxed" style={{ color: '#393939' }}>
                    Hanya data yang <strong>sudah disetujui penuh</strong> (Wali Kelas & Guru Piket) yang akan diekspor.
                  </p>

                  <button
                    onClick={handleExportToExcel}
                    className="w-full font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 hover:brightness-110"
                    style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 20px rgba(109,20,8,0.25)' }}
                  >
                    <Download className="w-4 h-4" /> Export ke Excel
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {view === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto w-full"
            >
              <div className="rounded-[2.5rem] shadow-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                <div className="p-8 flex items-center justify-between" style={{ borderBottom: '1px solid #D5D5D5' }}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl" style={{ color: '#1F2937' }}>
                        Pengajuan Perizinan
                      </h3>
                      <p className="text-xs font-medium mt-1" style={{ color: '#393939' }}>
                        Isi data perizinan dengan lengkap dan benar
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setView("dashboard")}
                    className="p-3 rounded-2xl transition-all" style={{ background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmitPermit} className="p-8 space-y-6">
                  {/* Auto-filled Student Info (disabled) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                        Nama Lengkap Siswa
                      </label>
                      <input
                        type="text"
                        disabled
                        value={user?.name || ""}
                        className="w-full text-sm font-medium rounded-xl p-3.5 outline-none cursor-not-allowed shadow-sm"
                        style={{ background: '#F9F6F2', border: '1px solid #D5D5D5', color: '#393939' }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                        Kelas / Jurusan
                      </label>
                      <input
                        type="text"
                        disabled
                        value={user?.class_name || ""}
                        className="w-full text-sm font-medium rounded-xl p-3.5 outline-none cursor-not-allowed shadow-sm"
                        style={{ background: '#F9F6F2', border: '1px solid #D5D5D5', color: '#393939' }}
                      />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                      Kategori Izin
                    </label>
                    <select
                      required
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          type: e.target.value as any,
                        })
                      }
                      className="w-full text-sm font-medium rounded-xl p-3.5 outline-none transition-all appearance-none cursor-pointer shadow-sm"
                      style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                    >
                      <option value="izin">Izin</option>
                      <option value="sakit">Sakit</option>
                      <option value="pkl">PKL</option>
                    </select>
                  </div>

                  {/* Time Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                        Jam Mulai
                      </label>
                      <input
                        type="time"
                        required
                        disabled={formData.type === "sakit"}
                        value={formData.start_time}
                        onChange={(e) =>
                          setFormData({ ...formData, start_time: e.target.value })
                        }
                        className="w-full text-sm font-medium rounded-xl p-3.5 outline-none transition-all shadow-sm"
                        style={formData.type === "sakit" ? { background: '#F9F6F2', border: '1px solid #D5D5D5', color: '#393939', cursor: 'not-allowed' } : { background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                        Jam Selesai
                      </label>
                      <input
                        type="time"
                        required
                        disabled={formData.type === "sakit"}
                        value={formData.end_time}
                        onChange={(e) =>
                          setFormData({ ...formData, end_time: e.target.value })
                        }
                        className="w-full text-sm font-medium rounded-xl p-3.5 outline-none transition-all shadow-sm"
                        style={formData.type === "sakit" ? { background: '#F9F6F2', border: '1px solid #D5D5D5', color: '#393939', cursor: 'not-allowed' } : { background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                      />
                    </div>
                  </div>

                  {formData.type === "sakit" && (
                    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(109,20,8,0.06)', border: '1px solid rgba(109,20,8,0.15)' }}>
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#6D1408' }} />
                      <p className="text-xs font-medium leading-relaxed" style={{ color: '#393939' }}>
                        Kategori <strong>Sakit</strong>: Waktu otomatis dari sekarang ({getCurrentTime()}) sampai jam pulang ({SCHOOL_END_TIME}).
                      </p>
                    </div>
                  )}

                  {formData.type === "sakit" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                        Upload Surat Sakit (Opsional)
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleFileChange}
                        className="w-full text-sm font-medium rounded-xl p-3 outline-none transition-all shadow-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold"
                        style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>
                      Alasan Terperinci
                    </label>
                    <textarea
                      required
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                      }
                      placeholder="Jelaskan secara detail alasan meninggalkan jam pelajaran..."
                      className="w-full h-32 text-sm font-medium rounded-xl p-3.5 resize-none outline-none transition-all shadow-sm"
                      style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#1F2937' }}
                    ></textarea>
                  </div>

                  {/* Student Signature */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold ml-1" style={{ color: '#393939' }}>Tanda Tangan Siswa</label>
                      <button
                        type="button"
                        onClick={() => sigCanvas.current?.clear()}
                        className="text-xs font-semibold" style={{ color: '#6D1408' }}
                      >
                        Reset
                      </button>
                    </div>
                    <div className="rounded-2xl h-40 overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                      <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{ className: "w-full h-full cursor-crosshair" }}
                      />
                    </div>
                  </div>

                  <button className="w-full font-bold py-4 rounded-xl text-sm shadow-lg transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2 hover:brightness-110" style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 24px rgba(109,20,8,0.25)' }}>
                    <Send className="w-4 h-4" />
                    Kirim & Ajukan ke Wali Kelas
                  </button>
                </form>
              </div>

            </motion.div>
          )}

          {view === "sign" && selectedPermit && (
            <motion.div
              key="sign"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-xl mx-auto w-full"
            >
              <div className="rounded-[2rem] shadow-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: '1px solid #D5D5D5' }}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                      <Signature className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg" style={{ color: '#1F2937' }}>
                        Verifikasi Tanda Tangan
                      </h3>
                      <p className="text-xs font-medium mt-1" style={{ color: '#393939' }}>
                        Siswa: {selectedPermit.student_name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setView("dashboard")}
                    className="p-3 rounded-2xl transition-all" style={{ background: '#F9F6F2', color: '#393939', border: '1px solid #D5D5D5' }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="rounded-2xl p-5 space-y-3" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                    <h4 className="text-sm font-bold pb-2" style={{ color: '#1F2937', borderBottom: '1px solid #D5D5D5' }}>
                      Detail Pengajuan
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Nama Siswa
                        </p>
                        <p className="font-medium mt-0.5" style={{ color: '#1F2937' }}>
                          {selectedPermit.student_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Kelas
                        </p>
                        <p className="font-medium mt-0.5" style={{ color: '#1F2937' }}>
                          {selectedPermit.class_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Kategori
                        </p>
                        <p className="font-medium mt-0.5 capitalize" style={{ color: '#1F2937' }}>
                          {selectedPermit.type === "sakit" ? "Sakit" : selectedPermit.type === "pkl" ? "PKL" : "Izin"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Waktu Izin
                        </p>
                        <p className="font-medium mt-0.5" style={{ color: '#1F2937' }}>
                          {selectedPermit.permit_date} ({selectedPermit.start_time} - {selectedPermit.end_time})
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#393939' }}>
                          Alasan Terperinci
                        </p>
                        <p className="font-medium mt-1 p-3 rounded-xl" style={{ color: '#1F2937', background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                          {selectedPermit.reason}
                        </p>
                      </div>
                      {selectedPermit.proof_file && (
                        <div className="col-span-2 mt-1 pt-3" style={{ borderTop: '1px solid #D5D5D5' }}>
                          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#393939' }}>
                            Lampiran
                          </p>
                          <a
                            href={selectedPermit.proof_file}
                            download={`Lampiran_Sakit_${selectedPermit.student_name.replace(/\s+/g, "_")}`}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                            style={{ background: 'rgba(109,20,8,0.08)', color: '#6D1408', border: '1px solid rgba(109,20,8,0.15)' }}
                          >
                            <FileText className="w-4 h-4" /> Unduh Surat Sakit
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl p-4" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                    <div className="flex justify-between items-center mb-4 px-2">
                      <span className="text-xs font-semibold" style={{ color: '#393939' }}>
                        Area Tanda Tangan
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-md font-bold" style={{ background: 'rgba(109,20,8,0.08)', color: '#6D1408' }}>
                        Ready
                      </span>
                    </div>
                    <div className="rounded-xl h-48 overflow-hidden relative" style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}>
                      <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{
                          className: "w-full h-full cursor-crosshair",
                        }}
                      />
                      <div className="absolute bottom-3 right-3 flex gap-2">
                        <button
                          onClick={() => sigCanvas.current?.clear()}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                          style={{ background: '#FFFFFF', border: '1px solid #D5D5D5', color: '#393939' }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-center mt-4 font-medium" style={{ color: '#393939' }}>
                      Tanda tangan ini merupakan verifikasi resmi dari sistem.
                    </p>
                  </div>

                  <button
                    onClick={() => handleSign()}
                    className="w-full py-4 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-[0.98] hover:brightness-110"
                    style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 24px rgba(109,20,8,0.25)' }}
                  >
                    Simpan Tanda Tangan Guru Piket
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Modals (Generated Links) */}
        <AnimatePresence>
          {generatedSlug && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
              onClick={() => { setGeneratedSlug(null); setView("dashboard"); }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
                style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                    <Link className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold" style={{ color: '#1F2937' }}>Link Tanda Tangan Wali Kelas</h3>
                  <p className="text-sm" style={{ color: '#393939' }}>Kirim link ini ke Wali Kelas Anda untuk mendapatkan tanda tangan.</p>
                </div>

                <div className="p-4 rounded-xl flex items-center justify-between gap-3" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                  <p className="text-xs font-mono truncate flex-1" style={{ color: '#1F2937' }}>
                    {window.location.origin}/sign/{generatedSlug}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/sign/${generatedSlug}`);
                      showToast("Link berhasil disalin!", "success");
                    }}
                    className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4" style={{ color: '#6D1408' }} />
                  </button>
                </div>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Assalamualaikum, saya mohon izin dan meminta tanda tangan Wali Kelas.\n\nSilakan buka link berikut:\n${window.location.origin}/sign/${generatedSlug}\n\nTerima kasih.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg hover:brightness-110"
                  style={{ background: '#6D1408', color: '#F9F6F2', boxShadow: '0 8px 20px rgba(109,20,8,0.25)' }}
                >
                  <ExternalLink className="w-4 h-4" />
                  Bagikan via WhatsApp
                </a>

                <button
                  onClick={() => { setGeneratedSlug(null); setView("dashboard"); }}
                  className="w-full font-semibold py-2 text-sm transition-colors" style={{ color: '#393939' }}
                >
                  Tutup & Kembali ke Dashboard
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phSlug && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
              onClick={() => setPhSlug(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
                style={{ background: '#FFFFFF', border: '1px solid #D5D5D5' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(109,20,8,0.1)', color: '#6D1408' }}>
                    <Link className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold" style={{ color: '#1F2937' }}>Link Tanda Tangan PH</h3>
                  <p className="text-sm" style={{ color: '#393939' }}>Berikan link ini ke Penanggung Jawab Harian (PH) untuk tanda tangan terakhir.</p>
                </div>

                <div className="p-4 rounded-xl flex items-center justify-between gap-3" style={{ background: '#F9F6F2', border: '1px solid #D5D5D5' }}>
                  <p className="text-xs font-mono truncate flex-1" style={{ color: '#1F2937' }}>
                    {window.location.origin}/sign/{phSlug}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/sign/${phSlug}`);
                      showToast("Link berhasil disalin!", "success");
                    }}
                    className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Copy className="w-4 h-4" style={{ color: '#6D1408' }} />
                  </button>
                </div>

                <button
                  onClick={() => setPhSlug(null)}
                  className="w-full font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98]"
                  style={{ background: '#6D1408', color: '#F9F6F2' }}
                >
                  Tutup
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-4 mt-auto" style={{ background: '#FFFFFF', borderTop: '1px solid #D5D5D5' }}>
        <div className="flex items-center gap-3 text-xs font-medium" style={{ color: '#393939' }}>
          <span>Versi 3.0.1</span>
          <span className="w-1 h-1 rounded-full" style={{ background: '#D5D5D5' }}></span>
          <span style={{ color: '#6D1408' }}>Sistem Keamanan Aktif</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: '#393939' }}>
          <span>© 2026 Devacto IT RPL • SMK Plus Pelita Nusantara</span>
        </div>
      </footer>

      {/* Global Toast Notifications */}
      {renderToasts()}
    </div>
  );
}