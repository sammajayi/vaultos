"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Landing } from "@/components/Landing";
import { Onboarding } from "@/components/Onboarding";
import { useTreasuries } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";

export default function Home() {
  const { signedIn } = useWallet();
  const list = useTreasuries();
  const router = useRouter();

  useEffect(() => {
    if (signedIn && list.data && list.data.length > 0) router.replace("/dashboard");
  }, [signedIn, list.data, router]);

  if (!signedIn) return <Landing />;
  if (list.isLoading || (list.data && list.data.length > 0)) return <div className="grid min-h-dvh place-items-center text-steel">Loading your treasury…</div>;
  return <Onboarding />;
}
