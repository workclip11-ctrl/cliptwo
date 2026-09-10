import { Suspense } from "react";
import AuthCompleteClient from "./client";

export default function AuthCompletePage() {
  return (
    <Suspense>
      <AuthCompleteClient />
    </Suspense>
  );
}
