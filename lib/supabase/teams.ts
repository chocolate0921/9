import { hasSupabaseConfig, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export type CreateTeamInput = {
  teamName: string;
  courseName: string;
  deadlineLabel: string;
  memberNames: string[];
};

type SupabaseInsertError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export async function saveTeamToSupabase(input: CreateTeamInput): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!hasSupabaseConfig()) {
    return {
      ok: false,
      message:
        "Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 넣어주세요.",
    };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/teams`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${supabasePublishableKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      team_name: input.teamName,
      course_name: input.courseName,
      deadline_label: input.deadlineLabel,
      member_names: input.memberNames,
    }),
  });

  if (!response.ok) {
    const fallbackMessage = await response.text();
    let detail = fallbackMessage;

    try {
      const parsed = JSON.parse(fallbackMessage) as SupabaseInsertError;
      detail = parsed.message ?? parsed.details ?? fallbackMessage;
    } catch {
      // 응답이 JSON이 아닐 수 있으므로 원문을 그대로 사용한다.
    }

    return {
      ok: false,
      message: `Supabase 저장 실패: ${detail}`,
    };
  }

  return {
    ok: true,
    message: "Supabase 연동 완료 · 팀이 저장되었습니다",
  };
}
