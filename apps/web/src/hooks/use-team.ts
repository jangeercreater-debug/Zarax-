"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  joinedAt: string;
}

const KEY = ["team", "members"];

export function useTeamMembers() {
  return useQuery({ queryKey: KEY, queryFn: () => clientRequest<TeamMember[]>("/team/members") });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      clientRequest<{ success: boolean }>("/team/members/" + id + "/role", { method: "POST", body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientRequest<{ success: boolean }>("/team/members/" + id, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
