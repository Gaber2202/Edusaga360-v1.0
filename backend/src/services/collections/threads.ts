import type { SupabaseClient } from '@supabase/supabase-js';

export interface ThreadMessageInput {
  thread_id: string;
  body_ar?: string;
  body_en?: string;
  sender_type: 'staff' | 'guardian' | 'yamen' | 'system';
  user_id?: string;
  guardian_id?: string;
  reply_to_message_id?: string;
}

export interface CreateThreadInput {
  subject?: string;
  guardian_id?: string;
  user_ids?: string[];
  profile_id?: string;
}

export class CollectionThreadService {
  constructor(private supabase: SupabaseClient) {}

  async createThread(tenantId: string, input: CreateThreadInput, creatorUserId?: string): Promise<{ thread_id: string }> {
    const { data: thread, error } = await this.supabase
      .from('message_threads')
      .insert({
        tenant_id: tenantId,
        subject: input.subject ?? 'Collection follow-up',
        type: input.guardian_id ? 'staff_parent' : 'staff_staff',
        linked_profile_id: input.profile_id,
      })
      .select('id')
      .single();
    if (error) throw error;
    const threadId = (thread as { id: string }).id;

    const participants: Record<string, unknown>[] = [];
    if (creatorUserId) {
      participants.push({ tenant_id: tenantId, thread_id: threadId, user_id: creatorUserId, role: 'owner' });
    }
    if (input.guardian_id) {
      participants.push({ tenant_id: tenantId, thread_id: threadId, guardian_id: input.guardian_id, role: 'participant' });
    }
    for (const uid of input.user_ids ?? []) {
      if (uid === creatorUserId) continue;
      participants.push({ tenant_id: tenantId, thread_id: threadId, user_id: uid, role: 'participant' });
    }

    if (participants.length) {
      const { error: pErr } = await this.supabase.from('thread_participants').insert(participants);
      if (pErr) console.error('[threads] failed to add participants:', pErr);
    }

    return { thread_id: threadId };
  }

  async getOrCreateProfileThread(tenantId: string, profileId: string): Promise<string> {
    const { data: existing } = await this.supabase
      .from('message_threads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('linked_profile_id', profileId)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const { data: profile } = await this.supabase
      .from('collection_profiles')
      .select('guardian_id')
      .eq('id', profileId)
      .eq('tenant_id', tenantId)
      .single();
    const result = await this.createThread(tenantId, { subject: 'YAMEN collection thread', profile_id: profileId, guardian_id: (profile as { guardian_id?: string })?.guardian_id });
    return result.thread_id;
  }

  async addMessage(tenantId: string, input: ThreadMessageInput): Promise<void> {
    const { error } = await this.supabase.from('thread_messages').insert({
      tenant_id: tenantId,
      thread_id: input.thread_id,
      sender_type: input.sender_type,
      user_id: input.user_id,
      guardian_id: input.guardian_id,
      body_ar: input.body_ar,
      body_en: input.body_en,
      reply_to_message_id: input.reply_to_message_id,
    });
    if (error) throw error;

    await this.supabase.from('message_threads').update({ last_message_at: new Date().toISOString() }).eq('id', input.thread_id).eq('tenant_id', tenantId);
  }

  async mirrorYamenMessage(
    tenantId: string,
    profileId: string,
    bodyAr: string,
    bodyEn: string,
    _externalMessageId?: string,
    userId?: string,
  ): Promise<void> {
    const threadId = await this.getOrCreateProfileThread(tenantId, profileId);
    await this.addMessage(tenantId, {
      thread_id: threadId,
      sender_type: 'yamen',
      user_id: userId,
      body_ar: bodyAr,
      body_en: bodyEn,
    });
  }

  async listThreads(tenantId: string, userId?: string, guardianId?: string, limit = 50): Promise<unknown[]> {
    const query = this.supabase
      .from('message_threads')
      .select('*, thread_participants(user_id, guardian_id, role)')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false })
      .limit(limit);
    if (userId) query.eq('thread_participants.user_id', userId);
    if (guardianId) query.eq('thread_participants.guardian_id', guardianId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async listMessages(tenantId: string, threadId: string, limit = 100): Promise<unknown[]> {
    const { data, error } = await this.supabase
      .from('thread_messages')
      .select('*, users(email), guardians(name_en, name_ar)')
      .eq('tenant_id', tenantId)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
}
