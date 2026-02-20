"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceType, SavedMapping } from "@/lib/types";

/**
 * Save a column mapping template for future reuse.
 */
export async function saveMappingTemplate(
  source: SourceType,
  name: string,
  mapping: Record<string, string>,
  headers: string[]
): Promise<SavedMapping> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("saved_mappings")
    .insert({
      source,
      name,
      mapping,
      sample_headers: headers,
      is_default: false,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save mapping: ${error.message}`);
  return data as SavedMapping;
}

/**
 * Get all saved mappings for a source.
 */
export async function getSavedMappings(
  source: SourceType
): Promise<SavedMapping[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("saved_mappings")
    .select("*")
    .eq("source", source)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch mappings: ${error.message}`);
  return (data ?? []) as SavedMapping[];
}

/**
 * Find a saved mapping that matches the given CSV headers (>70% overlap).
 * Uses admin client so it can be called from server actions without user context.
 */
export async function findMatchingSavedMapping(
  admin: SupabaseClient,
  source: SourceType,
  headers: string[]
): Promise<SavedMapping | null> {
  const { data: mappings } = await admin
    .from("saved_mappings")
    .select("*")
    .eq("source", source)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (!mappings || mappings.length === 0) return null;

  // Normalize headers for comparison
  const normalizedHeaders = new Set(
    headers.map((h) => h.toLowerCase().trim())
  );

  for (const mapping of mappings) {
    const sampleHeaders = mapping.sample_headers as string[] | null;
    if (!sampleHeaders) continue;

    const normalizedSample = sampleHeaders.map((h: string) =>
      h.toLowerCase().trim()
    );
    const overlap = normalizedSample.filter((h: string) =>
      normalizedHeaders.has(h)
    ).length;
    const overlapRatio = overlap / Math.max(normalizedSample.length, 1);

    if (overlapRatio >= 0.7) {
      return mapping as SavedMapping;
    }
  }

  return null;
}

/**
 * Delete a saved mapping.
 */
export async function deleteSavedMapping(mappingId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();

  const { error } = await admin
    .from("saved_mappings")
    .delete()
    .eq("id", mappingId);

  if (error) throw new Error(`Failed to delete mapping: ${error.message}`);
}
