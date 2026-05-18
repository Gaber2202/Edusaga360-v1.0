import { callApi } from './supabaseClient';

export async function createJournalEntry(payload) {
  const data = await callApi('/api/functions/createJournalEntry', payload);
  if (!data || data.error) {
    const err = new Error(data?.error || 'Failed to create journal entry');
    err.details = data?.details;
    throw err;
  }
  return data.entry;
}
