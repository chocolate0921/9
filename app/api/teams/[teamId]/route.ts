import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  hasSupabaseServiceRoleConfig,
  supabasePublishableKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/config";
import { TEAM_FILES_BUCKET } from "@/lib/supabase/files";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY가 없습니다. 팀 삭제를 위해 서버 환경변수를 설정해 주세요.",
      },
      { status: 500 },
    );
  }

  const { teamId } = await params;
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!accessToken) {
    return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: userError?.message ?? "사용자를 확인할 수 없습니다." },
      { status: 401 },
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: leaderRow, error: leaderError } = await adminClient
    .from("team_members")
    .select("id,is_leader,profile_id,team_id")
    .eq("team_id", teamId)
    .eq("profile_id", userData.user.id)
    .maybeSingle();

  if (leaderError) {
    return NextResponse.json({ error: leaderError.message }, { status: 500 });
  }

  if (!leaderRow?.is_leader) {
    return NextResponse.json(
      { error: "팀장만 팀을 삭제할 수 있습니다." },
      { status: 403 },
    );
  }

  const { data: sharedFiles, error: sharedFilesError } = await adminClient
    .from("shared_files")
    .select("id")
    .eq("team_id", teamId);

  if (sharedFilesError) {
    return NextResponse.json(
      { error: sharedFilesError.message },
      { status: 500 },
    );
  }

  const sharedFileIds = (sharedFiles ?? []).map((row) => row.id);
  const { data: versions, error: versionsError } = await adminClient
    .from("file_versions")
    .select("storage_path")
    .in("shared_file_id", sharedFileIds.length > 0 ? sharedFileIds : [""]);

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  const storagePaths = (versions ?? [])
    .map((row) => row.storage_path)
    .filter((value): value is string => Boolean(value))
    .filter((value) => /^https?:\/\//i.test(value) === false);

  if (storagePaths.length > 0) {
    const { error: storageError } = await adminClient.storage
      .from(TEAM_FILES_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      return NextResponse.json(
        { error: `Storage 삭제에 실패했습니다: ${storageError.message}` },
        { status: 500 },
      );
    }
  }

  const { error: deleteError } = await adminClient.from("teams").delete().eq("id", teamId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "팀이 삭제되었습니다.",
  });
}
