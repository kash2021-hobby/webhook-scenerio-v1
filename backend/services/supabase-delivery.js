import axios from 'axios';

export async function deliverToSupabase(destination, mappedData, config) {
  const { supabaseUrl, serviceRoleKey, tableName, primaryKey, conflictKey } = config;

  if (!supabaseUrl || !serviceRoleKey || !tableName) {
    throw new Error('Missing Supabase configuration');
  }

  const url = `${supabaseUrl}/rest/v1/${tableName}`;

  const headers = {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Prefer': conflictKey ? 'resolution=merge-duplicates' : 'return=representation'
  };

  // If conflict key is specified, use upsert
  if (conflictKey && mappedData[conflictKey]) {
    headers['Prefer'] = 'resolution=merge-duplicates';
    
    await axios.patch(
      `${url}?${conflictKey}=eq.${mappedData[conflictKey]}`,
      mappedData,
      { headers }
    );
  } else {
    // Regular insert
    await axios.post(url, mappedData, { headers });
  }
}
