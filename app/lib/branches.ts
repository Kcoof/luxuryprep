import { Branch } from "../types";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import seedBranches from "../../supabase/seed_branches.json";

export async function loadBranches(): Promise<Branch[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, city")
        .order("id");
      if (!error && data && data.length > 0) {
        return data as Branch[];
      }
    } catch {
      // Fall through to seed
    }
  }
  return seedBranches as Branch[];
}
