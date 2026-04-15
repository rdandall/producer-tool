import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.search", 60, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q           = (searchParams.get("q") ?? "").trim().slice(0, 200);
    const filterType  = searchParams.get("type")   || null;
    const filterStatus = searchParams.get("status") || null;

    const supabase = await createClient();

    // ── No query: return all notes (with optional type/status filters) ──────
    if (!q) {
      let query = supabase
        .from("notes")
        .select("*, projects(id, title, client, color)")
        .order("updated_at", { ascending: false });

      if (filterType)   query = query.eq("type",   filterType);
      if (filterStatus) query = query.eq("status", filterStatus);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return NextResponse.json({
        notes: (data ?? []).map(normalizeNote),
      });
    }

    // ── Full-text search via RPC ──────────────────────────────────────────
    const { data: rpcData, error: rpcError } = await supabase.rpc("search_notes", {
      q,
      filter_type:   filterType,
      filter_status: filterStatus,
    });

    if (rpcError) {
      // Fall back to simple ilike search if RPC fails (e.g. migration not yet run)
      console.warn("search_notes RPC failed, falling back:", rpcError.message);

      let fallback = supabase
        .from("notes")
        .select("*, projects(id, title, client, color)")
        .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (filterType)   fallback = fallback.eq("type",   filterType);
      if (filterStatus) fallback = fallback.eq("status", filterStatus);

      const { data: fallbackData } = await fallback;

      // Fetch project data for fallback results (RPC returns flat rows)
      return NextResponse.json({
        notes: (fallbackData ?? []).map(normalizeNote),
      });
    }

    // RPC returns flat rows without the projects join — re-fetch projects for matched IDs
    const matchedIds: string[] = (rpcData ?? []).map((r: { id: string }) => r.id);

    if (matchedIds.length === 0) {
      return NextResponse.json({ notes: [] });
    }

    const { data: fullNotes, error: fullError } = await supabase
      .from("notes")
      .select("*, projects(id, title, client, color)")
      .in("id", matchedIds);

    if (fullError) throw new Error(fullError.message);

    // Sort to preserve relevance ranking from RPC
    const rankMap = new Map<string, number>(
      (rpcData ?? []).map((r: { id: string; rank: number }) => [r.id, r.rank])
    );

    const sorted = (fullNotes ?? [])
      .map(normalizeNote)
      .sort((a, b) => (rankMap.get(b.id) ?? 0) - (rankMap.get(a.id) ?? 0));

    return NextResponse.json({ notes: sorted });
  } catch (err) {
    console.error("notes/search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeNote(n: any) {
  return {
    ...n,
    status: n.status ?? "draft",
    last_output_type: n.last_output_type ?? null,
    links: Array.isArray(n.links) ? n.links : [],
    extracted_tasks: Array.isArray(n.extracted_tasks) ? n.extracted_tasks : [],
  };
}
