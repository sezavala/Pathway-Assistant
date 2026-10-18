import "server-only";
import { createClient } from "@supabase/supabase-js";

export type SecretKind = "anthropic_api_key" | "google_refresh_token";

// Service-role client. Bypasses row-level security, so it is only used for the
// encrypted-secret functions and never for general queries.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function setUserSecret(userId: string, kind: SecretKind, value: string) {
  const { error } = await admin().rpc("set_user_secret", {
    p_user_id: userId,
    p_kind: kind,
    p_value: value,
  });
  if (error) throw new Error(`Could not store secret: ${error.message}`);
}

export async function getUserSecret(userId: string, kind: SecretKind): Promise<string | null> {
  const { data, error } = await admin().rpc("get_user_secret", {
    p_user_id: userId,
    p_kind: kind,
  });
  if (error) throw new Error(`Could not read secret: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function deleteUserSecret(userId: string, kind: SecretKind) {
  const { error } = await admin().rpc("delete_user_secret", {
    p_user_id: userId,
    p_kind: kind,
  });
  if (error) throw new Error(`Could not delete secret: ${error.message}`);
}

/** Last 4 characters of a stored secret, for display only. */
export async function getSecretLast4(userId: string, kind: SecretKind): Promise<string | null> {
  const { data } = await admin()
    .from("user_secrets")
    .select("last4")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  return data?.last4 ?? null;
}
