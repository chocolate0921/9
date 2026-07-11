import {
  hasSupabaseConfig,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/config";

export type TeamMemberRow = {
  id: string;
  team_id: string;
  profile_id: string | null;
  name: string;
  role: string;
  skill_tag: string;
  is_leader: boolean;
  status: string;
  joined_at: string;
};

export type CreateTeamMemberInput = {
  teamId: string;
  profileId?: string | null;
  name: string;
  role: string;
  skillTag: string;
  isLeader: boolean;
  status: string;
};

export type UpdateTeamMemberInput = {
  profileId?: string | null;
  name?: string;
  role?: string;
  skillTag?: string;
  isLeader?: boolean;
  status?: string;
};

type SupabaseErrorPayload = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type TeamMemberQueryResult<T> = {
  ok: boolean;
  data?: T;
  message: string;
};

const SKILL_TAG_POOL = ["정리형", "리서치형", "비주얼형", "문서형"] as const;

async function parseErrorMessage(response: Response) {
  const fallbackMessage = await response.text();
  let detail = fallbackMessage;

  try {
    const parsed = JSON.parse(fallbackMessage) as SupabaseErrorPayload;
    detail = parsed.message ?? parsed.details ?? fallbackMessage;
  } catch {
    // The response body is not always JSON.
  }

  return detail;
}

function ensureSupabaseConfig() {
  if (!hasSupabaseConfig()) {
    return {
      ok: false as const,
      message:
        "Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 넣어주세요.",
    };
  }

  return null;
}

function getHeaders() {
  return {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${supabasePublishableKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export async function getTeamMembersByTeam(
  teamId: string,
): Promise<TeamMemberQueryResult<TeamMemberRow[]>> {
  const configError = ensureSupabaseConfig();
  if (configError) {
    return configError;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/team_members?team_id=eq.${encodeURIComponent(teamId)}&select=*&order=joined_at.asc`,
    {
      method: "GET",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`,
      },
    },
  );

  if (!response.ok) {
    const detail = await parseErrorMessage(response);
    return {
      ok: false,
      message: `Supabase team_members 조회 실패: ${detail}`,
    };
  }

  const rows = (await response.json()) as TeamMemberRow[];
  return {
    ok: true,
    data: rows,
    message: "team_members 조회 성공",
  };
}

export async function createTeamMembers(
  teamId: string,
  memberNames: string[],
): Promise<TeamMemberQueryResult<TeamMemberRow[]>> {
  const configError = ensureSupabaseConfig();
  if (configError) {
    return configError;
  }

  const normalizedNames = memberNames.map((name) => name.trim()).filter(Boolean);
  const payload: CreateTeamMemberInput[] = normalizedNames.map((name, index) => ({
    teamId,
    profileId: null,
    name,
    role: index === 0 ? "팀장 / 발표 정리" : "팀원",
    skillTag: SKILL_TAG_POOL[index % SKILL_TAG_POOL.length],
    isLeader: index === 0,
    status: "active",
  }));

  const response = await fetch(`${supabaseUrl}/rest/v1/team_members?select=*`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(
      payload.map((member) => ({
        team_id: member.teamId,
        profile_id: member.profileId ?? null,
        name: member.name,
        role: member.role,
        skill_tag: member.skillTag,
        is_leader: member.isLeader,
        status: member.status,
      })),
    ),
  });

  if (!response.ok) {
    const detail = await parseErrorMessage(response);
    return {
      ok: false,
      message: `Supabase team_members 생성 실패: ${detail}`,
    };
  }

  const rows = (await response.json()) as TeamMemberRow[];
  return {
    ok: true,
    data: rows,
    message: "team_members 생성 성공",
  };
}

export async function updateTeamMember(
  memberId: string,
  updates: UpdateTeamMemberInput,
): Promise<TeamMemberQueryResult<TeamMemberRow>> {
  const configError = ensureSupabaseConfig();
  if (configError) {
    return configError;
  }

  const payload: Partial<TeamMemberRow> = {};

  if (updates.profileId !== undefined) {
    payload.profile_id = updates.profileId;
  }
  if (updates.name !== undefined) {
    payload.name = updates.name;
  }
  if (updates.role !== undefined) {
    payload.role = updates.role;
  }
  if (updates.skillTag !== undefined) {
    payload.skill_tag = updates.skillTag;
  }
  if (updates.isLeader !== undefined) {
    payload.is_leader = updates.isLeader;
  }
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/team_members?id=eq.${encodeURIComponent(memberId)}&select=*`,
    {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const detail = await parseErrorMessage(response);
    return {
      ok: false,
      message: `Supabase team_member 수정 실패: ${detail}`,
    };
  }

  const rows = (await response.json()) as TeamMemberRow[];
  return {
    ok: true,
    data: rows[0],
    message: "team_member 수정 성공",
  };
}

export async function deleteTeamMember(
  memberId: string,
): Promise<TeamMemberQueryResult<null>> {
  const configError = ensureSupabaseConfig();
  if (configError) {
    return configError;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/team_members?id=eq.${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`,
      },
    },
  );

  if (!response.ok) {
    const detail = await parseErrorMessage(response);
    return {
      ok: false,
      message: `Supabase team_member 삭제 실패: ${detail}`,
    };
  }

  return {
    ok: true,
    data: null,
    message: "team_member 삭제 성공",
  };
}
