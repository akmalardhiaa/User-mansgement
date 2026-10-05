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
    adStatus: "Koneksi AD",
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
    demoEnvHint: "Isi AD_LDAP_URL, LDAP_BASE_DN, dan LDAP_CA_CERT_PATH untuk mengaktifkan login Active Directory.",
    notConfiguredTitle: "Login belum dikonfigurasi",
    notConfiguredBody:
      "Setel AD_LDAP_URL, LDAP_BASE_DN, dan LDAP_CA_CERT_PATH di environment, lalu jalankan ulang aplikasi. Contohnya ada di .env.example.",
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
    /** {count} rows written to the workbook. */
    exported: "{count} baris diekspor ke Excel.",
    countOf: "dari",
    /** {count} disabled accounts the default view leaves out. */
    hiddenInactive: "{count} nonaktif disembunyikan",
    hiddenInactiveHint:
      "Akun nonaktif tidak ditampilkan di tampilan awal. Cari namanya, atau pilih status Nonaktif, untuk melihatnya.",

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

  requests: {
    metaTitle: "Pengajuan · HC User Management",
    needRead: "Izin membaca pengajuan",
    eyebrow: "Pengajuan",
    title: "Daftar pengajuan",
    description:
      "Onboarding, Movement, dan Termination. Status di sini adalah status pengajuannya — bukan keadaan akun, yang hanya berubah setelah perubahan benar-benar dijalankan.",
    newRequest: "Pengajuan baru",
    filterType: "Jenis",
    filterStatus: "Status",
    allTypes: "Semua jenis",
    allStatuses: "Semua status",
    apply: "Terapkan",
    reset: "Reset",
    empty: "Belum ada pengajuan yang cocok.",
    /** {name} raised it, {date} is when. */
    raisedBy: "Diajukan {name}",
    version: "versi {version}",
    waitingOnYou: "Menunggu keputusan Anda",
    previous: "← Sebelumnya",
    next: "Berikutnya →",
  },

  newRequest: {
    metaTitle: "Pengajuan baru · HC User Management",
    needCreate: "Izin membuat pengajuan",
    backToList: "Kembali ke daftar pengajuan",
    eyebrow: "Pengajuan",
    title: "Pengajuan baru",
    description:
      "Untuk karyawan baru yang belum punya akun. Untuk karyawan yang sudah ada, buka Edit profil. Disetujui manager lalu CISO sebelum akunnya dibuat.",
    submittedTitle: "Pengajuan terkirim",
    /** {name} is who the request is about. */
    submittedBody: "Pengajuan untuk {name} sudah dikunci dan diteruskan ke approver pertama.",
    whoApproves: "Yang harus menyetujui",
    stepManager: "1. Manager",
    stepCiso: "2. CISO",
    /** {count} members of the CISO team, each with their own link. */
    cisoTeamNote: "{count} email terpisah · keputusan pertama berlaku",
    nothingChangedYet:
      "Belum ada yang berubah pada akun. Direktori tetap menampilkan keadaan sekarang sampai kedua approval masuk dan perubahannya benar-benar dijalankan.",
    viewRequest: "Lihat pengajuan",
    raiseAnother: "Buat pengajuan lain",
    requestList: "Daftar pengajuan",
    existingEmployeeNote:
      "Halaman ini untuk karyawan baru yang belum punya akun. Untuk karyawan yang sudah ada — ubah profil, pindah divisi, atau nonaktifkan akun — buka menu Edit profil.",
  },

  forms: {
    submit: "Kirim ke approver",
    submitRevision: "Kirim revisi ke approver",
    submitting: "Mengirim…",

    sectionIdentity: "Identitas karyawan",
    sectionPlacement: "Penempatan dan atasan",
    sectionManagerAccess: "Atasan langsung",

    firstName: "Nama depan",
    lastName: "Nama belakang",
    fullName: "Nama lengkap",
    fullNameHint: "Terisi otomatis; bisa diubah.",
    email: "Email perusahaan",
    emailDomain: "Domain",
    jobTitle: "Jabatan",
    jobTitleHint: "Pilih dari daftar, atau ketik jabatan baru.",
    department: "Departemen",
    departmentHint: "Pilih dari daftar, atau ketik divisi baru.",
    employmentType: "Status kepegawaian",
    permanent: "Permanent",
    contract: "Temporary",
    vendor: "Vendor",
    intern: "Magang",
    /** Shown under the employment type field, as the company's own convention. */
    employmentCodeHint:
      "1-2 permanent, 3-4 temporary.",
    contractEnd: "Tanggal berakhir",
    contractEndHint: "Wajib untuk temporary.",
    emailHint: "Nama depan + belakang, lalu angka status di akhir. Misalnya nadiakusuma3.",
    userId: "User ID",
    userIdHint: "Nama untuk login ke komputer dan aplikasi kantor. Terisi dari email.",
    lastWorkingDateHint: "Akun dinonaktifkan sehari setelah tanggal ini.",
    location: "Lokasi penempatan",
    headOffice: "Kantor pusat",
    branch: "Cabang",
    branchName: "Nama cabang",
    startDate: "Tanggal mulai bekerja",
    startDateHint: "Hari pertama kerja. Akun dibuat begitu kedua persetujuan masuk.",
    jobDescription: "Keterangan jabatan (opsional)",
    manager: "Manager",

    employee: "Karyawan",
    chooseEmployee: "Pilih karyawan…",
    attribute: "Atribut",
    now: "Sekarang",
    becomes: "Menjadi",
    toDepartment: "Departemen tujuan",
    toJobTitle: "Jabatan tujuan",
    toManager: "Manager divisi tujuan",
    newJobDescription: "Keterangan jabatan baru (opsional)",
    movementReason: "Alasan pemindahan",
    movementReasonPlaceholder: "Rotasi internal, pengisian posisi kosong, …",
    readByApprovers: "Dibaca kedua approver.",
    effectiveAt: "Waktu efektif (opsional)",
    effectiveAtHint: "Kosongkan agar langsung dijalankan.",

    reasonCategory: "Kategori alasan",
    reasonCategoryHint: "Kategori saja — detailnya tidak dikirim ke approver.",
    reasonResign: "Mengundurkan diri",
    reasonContractEnd: "Kontrak berakhir",
    reasonRetire: "Pensiun",
    reasonDismissal: "Pemutusan hubungan kerja",
    reasonOther: "Lainnya",
    lastWorkingDate: "Tanggal terakhir bekerja",
    disableAt: "Waktu efektif penonaktifan (opsional)",
    handoverTo: "Serah terima kepada (opsional)",
    handoverPlaceholder: "Nama rekan yang melanjutkan pekerjaan",
    internalNote: "Catatan internal (opsional)",
    internalNoteHint:
      "Tersimpan di pengajuan. Tidak pernah dimasukkan ke email persetujuan.",
  },

  summary: {
    userId: "User ID",
    name: "Nama",
    email: "Email perusahaan",
    emailDomain: "Domain",
    jobTitle: "Jabatan",
    department: "Departemen",
    employmentType: "Status kepegawaian",
    /** {date} is when the contract ends. */
    contractUntil: "Temporary · berakhir {date}",
    /** Appended after the kind of employment, for the fixed-term kinds. */
    endsOn: "Tanggal terakhir bekerja: {date}",
    permanent: "Permanent",
    location: "Lokasi",
    /** {name} is the branch. */
    branchNamed: "Cabang · {name}",
    headOffice: "Kantor pusat",
    manager: "Manager",
    startDate: "Mulai bekerja",
    accessProfile: "Profil akses",
    jobDescription: "Keterangan jabatan",
    toDepartment: "Departemen tujuan",
    toJobTitle: "Jabatan tujuan",
    toManager: "Manager tujuan",
    newAccessProfile: "Profil akses baru",
    reason: "Alasan",
    reasonCategory: "Kategori alasan",
    lastWorkingDate: "Tanggal terakhir bekerja",
    handoverTo: "Serah terima kepada",
    action: "Tindakan",
    terminationAction: "Nonaktifkan dan karantina akun — bukan hapus permanen",
    field: "Isian",
    before: "Sebelum",
    after: "Sesudah",
    changesComputed: "Perubahan dihitung saat pengajuan dikirim.",
    profileScopeNote:
      "Email, manager, dan hak akses (group) tidak berubah lewat pengajuan ini.",
  },

  detail: {
    back: "Kembali ke daftar pengajuan",
    eyebrow: "Pengajuan",
    /** {name} raised it, {date} is when, {version} only when revised. */
    raised: "Diajukan {name} pada {date}",
    version: "versi {version}",

    failedNotice:
      "Eksekusi berhenti sebelum selesai. Akun berada pada keadaan yang tercatat di bawah — periksa dulu sebelum mencoba lagi.",
    scheduledNotice: "Sah dan menunggu waktu efektif. Belum ada perubahan pada akun.",
    approvedNotice:
      "Kedua approval sudah masuk dan perubahan ini sah. Perubahannya belum dijalankan sampai worker menjalankannya, jadi akun masih dalam keadaan semula.",

    payloadTitle: "Isi pengajuan",
    /** {hash} is the first part of the payload fingerprint. */
    payloadLocked: "Dikunci sejak dikirim. Sidik jari: {hash}",
    auditTitle: "Jejak audit",
    auditEmpty: "Belum ada peristiwa tercatat.",
    approvalsTitle: "Persetujuan",
    stageManager: "1. Manager",
    stageCiso: "2. CISO",
    approved: "Disetujui",
    rejected: "Ditolak",
    /** {name} is the team member who answered first. */
    decidedBy: " oleh {name}",
    waitingTeam: "Menunggu — keputusan pertama dari anggota tim yang berlaku",
    waiting: "Belum memutuskan",
    notRoutedYet: "Belum dirutekan — pengajuan masih berupa draf.",

    detailsTitle: "Rincian",
    number: "Nomor",
    versionLabel: "Versi",
    effectiveAt: "Waktu efektif",
    immediately: "Segera",
    policy: "Kebijakan",
    closedReason: "Alasan penutupan",
    revise: "Revisi pengajuan",
    reviseHint:
      "Revisi membatalkan persetujuan yang sudah ada dan otomatis mengirim email persetujuan baru ke manager.",

    auditDrafted: "Draf dibuat",
    auditSubmitted: "Dikirim ke approver",
    auditApproved: "Disetujui",
    auditRejected: "Ditolak",
    auditRevised: "Direvisi",
    auditCancelled: "Dibatalkan",
    auditQueued: "Masuk antrean eksekusi",
    auditScheduled: "Dijadwalkan",
  },

  approval: {
    metaTitle: "Persetujuan · HC User Management",
    settledTitle: "Sudah diputuskan",
    settledHint:
      "Permintaan ini dikirim ke beberapa orang sekaligus, dan keputusan pertama yang masuk yang berlaku. Tautan Anda otomatis tidak berlaku begitu keputusan itu tercatat.",
    unusableTitle: "Tautan tidak dapat dipakai",
    unusableHint:
      "Bila Anda yakin seharusnya dapat memutuskan pengajuan ini, hubungi Human Capital untuk meminta tautan baru. Tautan lama sengaja tidak dapat dihidupkan kembali.",
    /** {name} raised it, {version} is which version this link decides. */
    raised: "Diajukan {name} · versi {version}",
    /** {count} members of the CISO team hold a link to this. */
    teamNotice:
      "Dikirim ke {count} anggota tim CISO. Keputusan pertama yang masuk yang berlaku; tautan anggota lain otomatis tidak berlaku setelahnya.",
    /** {name} approved at {date}. */
    managerApproved: "Manager {name} sudah menyetujui pada {date}.",
    singleUseNote: "Tautan ini sekali pakai dan memiliki masa berlaku. Jangan meneruskannya.",

    recordedApproved: "Persetujuan Anda tercatat",
    recordedRejected: "Penolakan Anda tercatat",
    recordedApprovedBody: "Terima kasih. Tautan ini sudah dipakai dan tidak berlaku lagi.",
    recordedRejectedBody:
      "Pemohon akan melihat alasan yang Anda tulis. Tautan ini sudah tidak berlaku.",
    approvalNotExecution:
      "Persetujuan mengesahkan perubahan, bukan menjalankannya. Akun baru berubah setelah eksekusi dijalankan dan hasilnya diverifikasi.",

    /** {stage} is Manager or CISO. */
    yourDecision: "Keputusan Anda — tahap {stage}",
    managerScope: "Anda menyetujui kebutuhan divisi atas perubahan ini.",
    cisoScope:
      "Anda menyetujui dampak aksesnya. Persetujuan ini mengesahkan perubahan, bukan menjalankannya.",
    rejectReason: "Alasan penolakan",
    rejectReasonPlaceholder: "Jelaskan apa yang perlu diperbaiki sebelum diajukan ulang.",
    rejectReasonHint: "Wajib diisi. Pemohon membaca alasan ini.",
    sendRejection: "Kirim penolakan",
    approve: "Setujui",
    reject: "Tolak",
  },

  actions: {
    typeOnboarding: "Onboarding",
    typeOnboardingHint: "Karyawan baru yang belum punya akun.",
    typeMovement: "Movement",
    typeMovementHint: "Pindah divisi, jabatan, atau manager.",
    typeTermination: "Termination",
    typeTerminationHint: "Menonaktifkan akun karyawan yang keluar.",
    requestKind: "Jenis pengajuan",

    cancelRequest: "Batalkan pengajuan",
    cancelConfirm: "Batalkan pengajuan ini?",
    cancelYes: "Ya, batalkan",
    cancelled: "Pengajuan dibatalkan.",
    runWorker: "Jalankan worker",
    nothingDue: "Tidak ada pekerjaan yang jatuh tempo.",
    retry: "Coba jalankan lagi",
    requeued: "Pengajuan dimasukkan kembali ke antrean eksekusi.",
    sendPendingMail: "Kirim email tertunda",
    noMailDue: "Tidak ada email yang jatuh tempo.",
    subjectMissing: "Karyawan yang diajukan tidak ditemukan lagi.",

    reviseMetaTitle: "Revisi pengajuan · HC User Management",
    reviseNeed: "Izin membuat dan merevisi pengajuan",
    reviseRequesterOnly: "Hanya pemohon yang dapat merevisi pengajuan ini.",
    reviseEyebrow: "Revisi pengajuan",
    /** {from} and {to} are version numbers. */
    reviseDescription:
      "Versi {from} → {to}. Persetujuan lama dibatalkan, tautan email lama mati, dan email baru dikirim ke manager.",

    choosePlaceholder: "Pilih…",
    searchPlaceholder: "Cari…",
    openList: "Buka daftar",
    closeList: "Tutup daftar",
  },

  editProfile: {
    metaTitle: "Edit User · HC User Management",
    need: "Izin mengajukan perubahan profil karyawan",
    eyebrow: "Manajemen Akun",
    title: "Edit User & Profil Karyawan",
    description:
      "Setiap perubahan disetujui manager lalu CISO lewat email sebelum berlaku.",

    inFlight: "dalam pengajuan",
    submitProfile: "Ajukan perubahan profil",
    submitMovement: "Ajukan pindah divisi",
    submitTermination: "Ajukan penonaktifan",
    deactivateNote:
      "Isi tanggal ini hanya bila karyawan keluar. Akun dinonaktifkan dan dipindah ke karantina sehari setelahnya.",
    mixedNote:
      "Dua jenis perubahan sekaligus. Divisi, jabatan, dan manager diajukan sebagai pindah divisi; status kepegawaian dan lokasi sebagai perubahan profil; tanggal terakhir bekerja sebagai penonaktifan. Ajukan satu per satu.",
    pickSomeone: "Pilih karyawan di sebelah kiri untuk mengedit.",

    displayNameHint: "Tampil di dashboard dan email persetujuan.",
    departmentHint: "Nama divisi saja; hak akses tetap.",
    jobDescription: "Keterangan jabatan",
    jobDescriptionPlaceholder: "Ruang lingkup pekerjaan, tanggung jawab utama…",
    notSet: "Belum ditentukan",
    permanent: "Permanent",
    headOffice: "Pusat (Head Office)",
    branch: "Cabang (Branch Office)",
    hcNote: "Catatan HC",
    hcNotePlaceholder: "Catatan internal, opsional.",

    changesTitle: "Perubahan yang akan diajukan",
    noChanges: "Belum ada perubahan. Ubah minimal satu isian untuk mengajukan.",
    submit: "Ajukan perubahan",
    afterSubmit: "Profil baru berubah setelah manager dan CISO menyetujui lewat email.",
    emailManagerLocked: "Email dan manager tidak bisa diubah di sini.",
    seeRequests: "Lihat daftar pengajuan",

    chooseManager: "Pilih manager…",

    actionsLabel: "Tindakan untuk karyawan ini",
    actionProfile: "Ubah profil",
    actionMovement: "Pindah divisi",
    actionTermination: "Nonaktifkan akun",
    lockedNote:
      "Karyawan ini sedang punya pengajuan berjalan. Selesaikan atau batalkan pengajuan itu dulu sebelum mengajukan perubahan lain.",
  },

  activity: {
    metaTitle: "Aktivitas · HC User Management",
    need: "Izin membaca jejak aktivitas",
    eyebrow: "Jejak aktivitas",
    title: "Riwayat aktivitas",
    searchPlaceholder: "Cari nama, pelaku, atau keterangan",
    searchLabel: "Cari aktivitas",
    filterKind: "Saring berdasarkan jenis aktivitas",
    allKinds: "Semua aktivitas",
    empty: "Belum ada aktivitas yang tercatat.",
    by: "oleh",

    userCreated: "Akun diajukan",
    transferRequested: "Pindah divisi diajukan",
    accessDisabled: "Akses ditangguhkan",
    accessEnabled: "Akses diaktifkan",
    requestApproved: "Disetujui manager",
    requestRejected: "Ditolak manager",
    provisioningDone: "Penyiapan selesai",
    directoryExported: "Direktori diekspor",
    profileUpdated: "Profil diperbarui",
  },

  notifications: {
    title: "Notifikasi",
    /** {count} items need somebody to do something. */
    needAttention: "{count} perlu diperhatikan",
    allClear: "Semua beres ✓",
    nothingToSee: "Tidak ada yang perlu diperhatikan.",
    /** {count} on the bell itself. */
    ariaCount: "{count} pengajuan perlu diperhatikan",
    ariaEmpty: "Notifikasi — tidak ada yang perlu diperhatikan",
    viewAll: "Lihat semua pengajuan",

    failed: "Gagal dijalankan — akun belum berubah",
    /** {who} is the manager or the CISO team, {waited} how long. */
    waiting: "Belum dijawab {who} — {waited}",
    waitingManager: "manager",
    waitingCiso: "tim CISO",
    /** {count} days, or hours where it is under a day. */
    days: "{count} hari",
    hours: "{count} jam",
    rejected: "Ditolak approver",
    completed: "Selesai dijalankan",

    typeOnboarding: "Onboarding",
    typeMovement: "Mutasi",
    typeTermination: "Offboarding",
    typeProfileUpdate: "Perubahan Profil",
  },

  email: {
    title: "Email persetujuan",
    queued: "Menunggu dikirim",
    accepted: "Diterima provider",
    failed: "Gagal dikirim",
    approvalRequest: "Permintaan persetujuan",
    resultNotice: "Pemberitahuan hasil",
    rejectionNotice: "Pemberitahuan penolakan",
    attempt: "Percobaan",
    acceptedAtPrefix: "diterima provider",
    failedAtPrefix: "gagal",
    retryAfter: "Dicoba lagi setelah {when}.",
    disclaimer:
      "“Diterima provider” berarti pesan sudah diantrekan untuk dikirim — bukan bukti sudah masuk kotak masuk. Tidak ada di sistem ini yang mengetahui hal itu.",
  },

  profile: {
    metaTitle: "Profil · HC User Management",
    eyebrow: "Akun",
    title: "Profil saya",
    description:
      "Informasi akun Anda dari Active Directory. Perubahan nama atau kata sandi dilakukan lewat AD.",
    name: "Nama",
    username: "Username",
    email: "Email",
    department: "Departemen",
    portalRoles: "Peran portal",
    noRole: "Belum ada peran portal",
  },

  execution: {
    drift: "Kondisi akun berubah sejak disetujui",
    payloadMismatch: "Isi pengajuan tidak cocok dengan yang disetujui",
    adPermission: "Hak worker tidak cukup",
    adConflict: "Objek bentrok di direktori",
    adNotFound: "Objek tidak ditemukan",
    adTimeout: "Waktu tunggu habis setelah perubahan dikirim",
    adUnavailable: "Direktori tidak dapat dihubungi",
    verifyFailed: "Hasil tidak cocok saat dibaca ulang",
    unknown: "Kesalahan tidak dikenal",
    viewRunning: "Lihat pengajuan yang sedang berjalan",
    activityDescription:
      "Setiap perubahan pada direktori, siapa yang melakukannya, dan jam berapa.",
    activityNoMatch: "Tidak ada aktivitas yang cocok dengan saringan ini.",
    subjectLocked:
      "Karyawan tidak bisa diganti lewat revisi. Batalkan dan buat pengajuan baru bila salah orang.",
    subjectInFlight: "Karyawan yang sedang memiliki pengajuan berjalan tidak muncul di sini.",
    timelineTitle: "Eksekusi ke direktori",
    sectionWhoMoves: "Karyawan yang dipindahkan",
    sectionBeforeAfter: "Sebelum dan sesudah",
    sectionTargetPosition: "Posisi tujuan dan manager",
    toManagerNote:
      "Persetujuan tahap pertama diminta ke manager divisi tujuan — merekalah yang menerima karyawan ini.",
    notCreatedYet: "Akun belum dibuat. Pengajuan dikirim ke manager, lalu CISO.",
    notMovedYet:
      "Posisi belum berubah. Direktori tetap menampilkan posisi sekarang sampai perubahan dijalankan.",
    notRevokedYet: "Akses belum dicabut. Pengajuan dikirim ke manager, lalu CISO.",
    profileLockedNote:
      "Karyawan ini sedang punya pengajuan yang berjalan, jadi profilnya dikunci sampai pengajuan itu selesai atau dibatalkan. Untuk mengubah isinya, revisi pengajuan tersebut dari halaman detailnya.",
    sectionWhoLeaves: "Karyawan yang dinonaktifkan",
    sectionAffected: "Akun yang terdampak",
    sectionReasonSchedule: "Jadwal penonaktifan",
    quarantineStrong: "menonaktifkan dan mengarantina",
    quarantineBefore: "Tindakan default adalah ",
    quarantineAfter: " akun, bukan menghapusnya. Penghapusan permanen memerlukan proses terpisah.",
    sessionsNote:
      "Sesi yang sudah berjalan (Kerberos, VPN, Microsoft 365) tidak otomatis terputus.",
    /** {name} is the current manager, asked first. */
    firstApproverIs: "Persetujuan tahap pertama diminta ke {name}, manager saat ini.",
    hcNoteLabel: "Catatan HC:",
    requestInProgress: "Pengajuan berjalan",
    pendingNotAppliedYet:
      "Status akun di atas belum berubah. Direktori baru mengikuti setelah perubahan benar-benar dijalankan dan diverifikasi.",
    noRequestRunning: "Tidak ada pengajuan yang sedang berjalan untuk karyawan ini.",
    printProfile: "Cetak profil karyawan",
    raiseMovement: "Ajukan Movement",
    raiseTermination: "Ajukan Termination",
    closePanel: "Tutup panel",
    auditHistory: "Riwayat Audit",
    division: "Divisi",
    managerEmail: "Email manager",
  },

  adStatus: {
    metaTitle: "Koneksi AD · HC User Management",
    eyebrow: "Diagnostik Active Directory",
    title: "Koneksi AD",
    description: "Pemeriksaan hanya-baca untuk koneksi Active Directory dan konfigurasi worker.",
    refresh: "Periksa ulang",
    summary: "Ringkasan",
    overall: "Status keseluruhan",
    driver: "Driver",
    writeMode: "Mode tulis",
    enabled: "Aktif",
    readOnly: "Baca saja",
    checkedAt: "Diperiksa",
    checks: "Pemeriksaan",
    statusOk: "OK",
    statusWarn: "Perlu perhatian",
    statusFail: "Gagal",
    statusSkip: "Dilewati",
    overallOk: "Terhubung",
    overallWarn: "Terhubung, dengan catatan",
    overallFail: "Gagal",
    overallSkip: "Belum diperiksa",
    checkNames: {
      "login-url": "URL login",
      "role-groups": "Group peran",
      driver: "Driver",
      config: "Konfigurasi LDAP",
      ca: "Sertifikat CA",
      bind: "Bind akun layanan",
      "base-dn": "Base DN",
      "managed-ous": "OU yang dikelola",
      "quarantine-ou": "OU karantina",
      "ciso-group": "Group CISO",
      write: "Mode tulis",
    },
  },

  lifecycle: {
    statusDraft: "Draf",
    statusPendingManager: "Menunggu manager",
    statusPendingCiso: "Menunggu CISO",
    statusApproved: "Disetujui",
    statusScheduled: "Terjadwal",
    statusQueued: "Antre eksekusi",
    statusExecuting: "Sedang dijalankan",
    statusCompleted: "Selesai",
    statusFailed: "Gagal",
    statusRejected: "Ditolak",
    statusCancelled: "Dibatalkan",
    statusExpired: "Kedaluwarsa",

    typeOnboarding: "Onboarding",
    typeMovement: "Movement",
    typeTermination: "Termination",
    typeProfileUpdate: "Perubahan Profil",
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
