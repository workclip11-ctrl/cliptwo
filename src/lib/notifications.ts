import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  related_id?: string;
  read: boolean;
  created_at: string;
}

export async function getNotifications(userId: string) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Notification[];
}

export async function markRead(id: string, userId: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function createNotification({
  title,
  message,
  type,
  relatedId,
  userId,
}: {
  title: string;
  message: string;
  type: string;
  relatedId?: string;
  userId: string;
}) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("notifications")
    .insert({ title, message, type, related_id: relatedId, user_id: userId });
  if (error) throw error;
}
