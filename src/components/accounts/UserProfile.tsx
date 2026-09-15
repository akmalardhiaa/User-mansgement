"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormAlert } from "@/components/accounts/FormAlert";
import { Button } from "@/components/ui/Button";
import { Card, Field } from "@/components/ui/Field";
import { IconLock, IconMail, IconUser } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import type { PublicUser } from "@/lib/auth/types";
import { putJson } from "@/lib/client/accountsApi";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/accountInput";

/**
 * The signed-in person's own account.
 *
 * Profile and password are two forms, not one. They have different failure
 * modes and different consequences — changing an email costs you your verified
 * status, changing a password costs you your session — and a single Save that
 * did both would make it unclear which of those just happened.
 */
export function UserProfile({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState({ fullName: user.fullName, email: user.email });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ password: "", confirmPassword: "" });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const emailChanged = profile.email.trim().toLowerCase() !== user.email;
  const profileDirty = emailChanged || profile.fullName.trim() !== user.fullName;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileErrors({});

    const result = await putJson<{ user: PublicUser; message: string }>(
      `/api/accounts/${user.id}`,
      profile,
    );

    if (result.ok) {
      toast(result.data.message, "success");
      // The name in the chrome comes from the token, which still holds the old
      // one until it is reissued, so re-render from the server.
      router.refresh();
    } else {
      setProfileErrors(result.failure.fieldErrors ?? {});
      setProfileError(result.failure.fieldErrors ? null : result.failure.message);
    }

    setSavingProfile(false);
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordErrors({});

    if (passwords.password !== passwords.confirmPassword) {
      setPasswordErrors({ confirmPassword: "Konfirmasi kata sandi tidak cocok." });
      setSavingPassword(false);
      return;
    }

    const result = await putJson<{ user: PublicUser }>(`/api/accounts/${user.id}`, {
      password: passwords.password,
    });

    if (result.ok) {
      toast("Kata sandi diperbarui.", "success");
      setPasswords({ password: "", confirmPassword: "" });
    } else {
      setPasswordErrors(result.failure.fieldErrors ?? {});
      setPasswordError(result.failure.fieldErrors ? null : result.failure.message);
    }

    setSavingPassword(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <form onSubmit={saveProfile} noValidate className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Profil</h2>
            <p className="mt-1 text-sm text-ink-muted">Nama dan alamat email akun Anda.</p>
          </div>

          <FormAlert tone="error">{profileError}</FormAlert>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Status email:</span>
            {user.emailVerified ? (
              <span className="rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok">
                Terkonfirmasi
              </span>
            ) : (
              <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-xs font-medium text-warn">
                Belum dikonfirmasi
              </span>
            )}
          </div>

          <Field
            label="Nama lengkap"
            name="fullName"
            icon={<IconUser className="size-4" />}
            value={profile.fullName}
            onChange={(event) => setProfile((p) => ({ ...p, fullName: event.target.value }))}
            error={profileErrors.fullName}
            autoComplete="name"
            required
          />
          <Field
            label="Email"
            name="email"
            type="email"
            icon={<IconMail className="size-4" />}
            value={profile.email}
            onChange={(event) => setProfile((p) => ({ ...p, email: event.target.value }))}
            error={profileErrors.email}
            hint={
              emailChanged
                ? "Mengubah email akan mencabut status terkonfirmasi sampai alamat baru dikonfirmasi."
                : undefined
            }
            autoComplete="email"
            required
          />

          <Button type="submit" loading={savingProfile} disabled={!profileDirty}>
            {savingProfile ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <form onSubmit={savePassword} noValidate className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Kata sandi</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Pilih kata sandi baru untuk akun ini.
            </p>
          </div>

          <FormAlert tone="error">{passwordError}</FormAlert>

          <Field
            label="Kata sandi baru"
            name="newPassword"
            type="password"
            icon={<IconLock className="size-4" />}
            value={passwords.password}
            onChange={(event) => setPasswords((p) => ({ ...p, password: event.target.value }))}
            error={passwordErrors.password}
            hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter.`}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
          <Field
            label="Konfirmasi kata sandi baru"
            name="confirmNewPassword"
            type="password"
            icon={<IconLock className="size-4" />}
            value={passwords.confirmPassword}
            onChange={(event) =>
              setPasswords((p) => ({ ...p, confirmPassword: event.target.value }))
            }
            error={passwordErrors.confirmPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />

          <Button
            type="submit"
            variant="secondary"
            loading={savingPassword}
            disabled={!passwords.password}
          >
            {savingPassword ? "Menyimpan…" : "Ganti kata sandi"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
