"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { IconSync } from "@/components/ui/Icons";

export function AdStatusRefresh({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button variant="secondary" size="sm" icon={<IconSync className="size-4" />} onClick={() => router.refresh()}>
      {label}
    </Button>
  );
}
