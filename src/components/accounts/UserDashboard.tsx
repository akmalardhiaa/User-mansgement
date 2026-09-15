"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import { CreateAccountCard } from "@/components/accounts/CreateAccountCard";
import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { Card, Field, SelectField } from "@/components/ui/Field";
import { IconSearch, IconUser } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { ROLES, type PublicUser, type Role } from "@/lib/auth/types";
import { deleteJson, getJson, putJson } from "@/lib/client/accountsApi";
import { TRANSITION_FAST } from "@/lib/motion";

/**
 * Admin view of every login account.
 *
 * Deliberately a thin console rather than a second employee directory: this
 * lists who can sign in, which is a different question from who works here.
 * The HC roster on the home page answers the other one.
 */
export function UserDashboard({ currentUserId }: { currentUserId: string }) {
  const { toast } = useToast();

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (roleFilter) params.set("role", roleFilter);

    const result = await getJson<{ users: PublicUser[]; total: number }>(
      `/api/accounts?${params.toString()}`,
    );

    if (result.ok) {
      setUsers(result.data.users);
      setTotal(result.data.total);
    } else {
      setError(result.failure.message);
    }

    setLoading(false);
  }, [query, roleFilter]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per
    // keystroke; the role select goes through the same path for one code path
    // rather than two.
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function changeRole(user: PublicUser, role: Role) {
    setBusyId(user.id);

    const result = await putJson<{ user: PublicUser }>(`/api/accounts/${user.id}`, { role });

    if (result.ok) {
      setUsers((current) => current.map((u) => (u.id === user.id ? result.data.user : u)));
      toast(`Peran ${user.fullName} diubah menjadi ${role}.`, "success");
    } else {
      toast(result.failure.message, "error");
    }

    setBusyId(null);
  }

  async function remove(user: PublicUser) {
    setBusyId(user.id);

    const result = await deleteJson<{ deleted: boolean }>(`/api/accounts/${user.id}`);

    if (result.ok) {
      setUsers((current) => current.filter((u) => u.id !== user.id));
      setTotal((current) => Math.max(0, current - 1));
      toast(`Akun ${user.fullName} dihapus.`, "success");
    } else {
      toast(result.failure.message, "error");
    }

    setBusyId(null);
    setConfirmingId(null);
  }

  return (
    <div className="space-y-5">
      <CreateAccountCard
        onCreated={(user) => {
          setUsers((current) => [user, ...current]);
          setTotal((current) => current + 1);
        }}
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field
            label="Cari akun"
            name="q"
            icon={<IconSearch className="size-4" />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nama atau email…"
            type="search"
          />
          <SelectField
            label="Peran"
            name="role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as "" | Role)}
            className="sm:w-44"
          >
            <option value="">Semua peran</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <FormAlert tone="error">{error}</FormAlert>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">
            {loading ? "Memuat…" : `${users.length} dari ${total} akun`}
          </h2>
        </div>

        {/* The table is allowed to overflow horizontally inside its own
            container; the page itself must never scroll sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs tracking-wide text-ink-muted uppercase">
                <th className="px-5 py-3 font-semibold">Nama</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Peran</th>
                <th className="px-5 py-3 text-right font-semibold">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {users.map((user) => (
                  <motion.tr
                    key={user.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={TRANSITION_FAST}
                    className="border-b border-hairline/60 last:border-0 hover:bg-elevated/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-canvas/60 text-ink-faint">
                          <IconUser className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{user.fullName}</p>
                          {user.id === currentUserId ? (
                            <p className="text-xs text-accent">Anda</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-ink-muted">{user.email}</span>
                    </td>
                    <td className="px-5 py-3">
                      {user.emailVerified ? (
                        <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok">
                          Terkonfirmasi
                        </span>
                      ) : (
                        <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-xs font-medium text-warn">
                          Belum
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        aria-label={`Peran untuk ${user.fullName}`}
                        value={user.role}
                        disabled={busyId === user.id}
                        onChange={(event) => void changeRole(user, event.target.value as Role)}
                        className="rounded-lg border border-hairline-strong bg-canvas/60 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none disabled:opacity-50"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {confirmingId === user.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="danger"
                              loading={busyId === user.id}
                              onClick={() => void remove(user)}
                            >
                              Yakin hapus
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmingId(null)}
                            >
                              Batal
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === user.id}
                            onClick={() => setConfirmingId(user.id)}
                          >
                            Hapus
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {!loading && users.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            Tidak ada akun yang cocok dengan pencarian ini.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
