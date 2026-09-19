import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeIndianPhone } from "@/lib/phone";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.phone;
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }

  const phone = normalizeIndianPhone(raw);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit Indian mobile number." },
      { status: 400 },
    );
  }

  try {
    const serviceClient = createServiceClient();
    const { error } = await serviceClient.auth.admin.updateUserById(user.id, { phone });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("duplicate") || msg.includes("unique")) {
        return NextResponse.json(
          { error: "That phone number is already associated with another account." },
          { status: 409 },
        );
      }
      console.error("[account/phone] Update failed:", error.message);
      return NextResponse.json(
        { error: "Could not update phone number." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, phone });
  } catch (err) {
    console.error("[account/phone] Unexpected error:", err);
    return NextResponse.json(
      { error: "Could not update phone number." },
      { status: 500 },
    );
  }
}
