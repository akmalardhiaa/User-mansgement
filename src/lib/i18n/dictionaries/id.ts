/**
 * Indonesian, and the source of truth for the shape of every dictionary.
 *
 * `en.ts` is typed against this object, so a key added here without an English
 * translation fails the typecheck rather than falling back silently to
 * Indonesian at some later point in front of an audience.
 *
 * Grouped by where the words appear, not by what they say: somebody changing
 * the approval page should find every word on it in one place.
 */
export const id = {
  nav: {
    directory: "Direktori",
    requests: "Pengajuan",
    newRequest: "Pengajuan baru",
    editProfile: "Edit profil",
    activity: "Aktivitas",
    profile: "Profil",
    mainNavigation: "Navigasi utama",
    signOut: "Keluar",
    signingOut: "Keluar…",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
  },

  language: {
    /** On the switch itself: what clicking it does, not what is selected now. */
    switchTo: "Ganti ke Bahasa Inggris",
    switchToShort: "English",
    current: "Bahasa: Indonesia",
  },

  login: {
    metaTitle: "Masuk · HC User Management",
    eyebrow: "User Management",
    title: "Masuk Portal",
    subtitle: "Silakan masukkan kredensial akun Human Capital Anda.",
    username: "Username",
    usernamePlaceholder: "nama.pengguna atau email",
    password: "Kata sandi",
    submit: "Masuk",
    submitting: "Masuk…",
    withAd: "Masuk dengan akun Active Directory Anda.",
    demoTitle: "Mode demo — Active Directory belum tersambung",
    demoBody:
      "Masuk sebagai admin dengan kata sandi admin12345, atau lewat direktori simulasi sebagai ayu.prameswari dengan mock12345. Portal ini hanya untuk Human Capital: manager dan tim CISO menyetujui dari email, bukan dari sini. Daftar akun demo ada di README.",
    demoEnvHint: "Isi LDAP_URL di .env.local untuk mengaktifkan login Active Directory.",
    notConfiguredTitle: "Login belum dikonfigurasi",
    notConfiguredBody:
      "Setel LDAP_URL di environment, lalu jalankan ulang aplikasinya. Contohnya ada di .env.example.",
    failed: "Username atau kata sandi salah.",
  },

  loginAside: {
    directoryTitle: "Direktori Karyawan Terintegrasi",
    platform: "HUMAN CAPITAL PLATFORM",
    headlineTop: "Portal Terpadu",
    headlineBottom: "User Management",
    lead: "Kelola siklus hidup akses akun karyawan secara otomatis, aman, dan transparan melalui satu dasbor modern.",
    directoryBody:
      "Pencarian cepat, penyaringan divisi, dan manajemen status akun secara real-time.",
    approvalTitle: "Persetujuan Bertingkat lewat Email",
    approvalBody:
      "Alur persetujuan terverifikasi oleh Manager dan IT Security otomatis melalui email.",
    auditTitle: "Jejak Audit Lintas Sistem",
    auditBody: "Rekam jejak transparan dan akuntabel untuk setiap perubahan hak akses.",
  },

  accessDenied: {
    title: "Akses ditolak",
    body: "Akun Anda berhasil masuk, tetapi peran portal Anda tidak mencakup halaman ini.",
    required: "Dibutuhkan",
    yourRoles: "Peran Anda",
    noRole: "Belum ada peran portal",
    roleHc: "Human Capital",
    roleAdmin: "Administrator sistem",
    roleOps: "Operator",
    roleAuditor: "Auditor",
    hint: "Peran portal berasal dari keanggotaan group Active Directory. Hubungi administrator sistem bila Anda seharusnya memiliki akses ini.",
    viewProfile: "Lihat profil saya",
  },

  directory: {
    eyebrow: "Human Capital Platform",
    badge: "User Management",
    titleMain: "Direktori Karyawan",
    titleAccent: "& User Management",
    description:
      "Portal terpadu direktori karyawan dan pengelolaan izin akses, dengan login Active Directory.",
    addEmployee: "Tambah karyawan",
    needRead: "Akses baca direktori karyawan",

    statusActive: "Aktif",
    statusDisabled: "Nonaktif",

    statTotal: "Total karyawan",
    statTotalCaption: "Seluruh direktori",
    statActiveCaption: "Akses berjalan normal",
    statPending: "Ada pengajuan",
    statPendingCaption: "Perubahan yang belum dijalankan",
    statDisabledCaption: "Akun tidak berjalan",

    searchPlaceholder: "Cari nama, email, jabatan…",
    searchLabel: "Cari karyawan",
    clearSearch: "Hapus pencarian",
    filterStatus: "Saring berdasarkan status",
    allStatus: "Semua status",
    inApproval: "Dalam persetujuan",
    filterDepartment: "Saring berdasarkan departemen",
    allDepartments: "Semua departemen",
    otherDepartment: "Lainnya",
    sortBy: "Urutkan berdasarkan",
    sortPrefix: "Urut",
    ascending: "Urutan menaik — klik untuk membalik",
    descending: "Urutan menurun — klik untuk membalik",
    ascendingShort: "Menaik (A→Z)",
    descendingShort: "Menurun (Z→A)",
    export: "Ekspor",
    exportHint: "Unduh baris yang terlihat sebagai file Excel",
    exportFailed: "Ekspor gagal.",
    countOf: "dari",

    columnName: "Nama",
    columnUpdated: "Terakhir diperbarui",
    columnJobTitle: "Jabatan",
    columnDepartment: "Departemen",
    columnStatus: "Status",
    columnPending: "Pengajuan berjalan",
    columnActions: "Tindakan",
    detail: "Detail",
    detailHint: "Lihat profil detail karyawan",
    proposeChange: "Ajukan perubahan",
    proposeChangeHint: "Ajukan perpindahan divisi — melewati persetujuan manager dan CISO",
    newBadge: "Baru",
    emptyFiltered: "Tidak ada karyawan yang cocok dengan filter ini.",
    emptyDirectory: "Direktori masih kosong.",

    pipelineTitle: "Karyawan baru dalam proses",
    pipelineHint:
      "Tampil begitu diajukan. Akunnya belum ada — masuk ke tabel direktori setelah kedua persetujuan selesai dan akun dibuat di AD.",
    pipelineSubmitted: "Diajukan",
    pipelineManager: "Manager",
    pipelineCiso: "CISO",
    pipelineCreated: "Dibuat di AD",
    pipelineDraft: "Draf — belum dikirim ke approver",
    /** {name} is the manager of record for this request. */
    pipelineWaitingManager: "Menunggu persetujuan {name}",
    pipelineWaitingCiso: "Menunggu persetujuan tim CISO",
    pipelineExecuting: "Sedang dibuat di AD…",
    pipelineFailed: "Gagal dibuat di AD — buka detail untuk dicek",
    pipelineReady: "Disetujui — siap dibuat di AD",
    pipelineStep: "Tahap",
    /** {count} is how many are approved and waiting for the worker. */
    pipelineReadyCount: "{count} siap dibuat",
    pipelineViewRequest: "Lihat pengajuan",
    pipelineRunWorker: "Jalankan worker",
  },

  common: {
    footer: "Human Capital · direktori karyawan dengan login Active Directory",
    loading: "Memuat…",
    save: "Simpan",
    cancel: "Batal",
    close: "Tutup",
    back: "Kembali",
    search: "Cari",
    retry: "Coba lagi",
    yes: "Ya",
    no: "Tidak",
    optional: "opsional",
    none: "—",
  },
};

/**
 * Values are plain `string`, not the literals `as const` would give: the
 * English dictionary has to satisfy this type, and it cannot do that if every
 * value is typed as the exact Indonesian wording. Keys stay exact, which is
 * the check that matters — a missing or misspelt one fails the build.
 */
export type Dictionary = typeof id;
