import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordClient from "./client";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] text-center">
          <img
            src="/cliptwo-logo.png"
            alt="ClipTwo"
            className="mx-auto mb-6 h-7 w-7 rounded-md object-contain"
          />
          <div className="rounded-[10px] border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-red">
            Invalid or expired reset link. Please request a new one.
          </div>
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground px-6 text-[14px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  return <ResetPasswordClient session={session} />;
}
