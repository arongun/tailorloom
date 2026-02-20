import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const DEV_EMAIL = "dev@tailorloom.local";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!process.env.DEV_PASSWORD || password !== process.env.DEV_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Use service role to create/manage the dev user
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if dev user exists, create if not
  const { data: users } = await admin.auth.admin.listUsers();
  let devUser = users?.users?.find((u) => u.email === DEV_EMAIL);

  if (!devUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEV_EMAIL,
      password: "dev-internal-password",
      email_confirm: true,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    devUser = data.user;
  }

  // Generate a magic link to sign the user in
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: DEV_EMAIL,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkError?.message ?? "Failed to generate session" },
      { status: 500 }
    );
  }

  // Exchange the token for a session via OTP verify
  const response = NextResponse.json({ success: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  return response;
}
