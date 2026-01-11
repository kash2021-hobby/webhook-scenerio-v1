import { google } from 'googleapis';
import axios from 'axios';
import db from '../database/db.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Get Google OAuth client for a user
export async function getGoogleAuthClient(userId) {
  const tokens = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(userId);
  
  if (!tokens) {
    throw new Error('Google not connected');
  }

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });

  // Refresh token if expired
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      
      // Update stored tokens
      db.prepare(`
        UPDATE google_tokens
        SET access_token = ?, refresh_token = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        credentials.access_token,
        credentials.refresh_token || tokens.refresh_token,
        credentials.expiry_date || null,
        userId
      );
    } catch (error) {
      throw new Error('Failed to refresh Google token');
    }
  }

  return oauth2Client;
}

export async function getGoogleSheetsColumns(userId, spreadsheetId, worksheetName) {
  try {
    console.log(`Fetching columns for spreadsheet: ${spreadsheetId}, worksheet: ${worksheetName}`);
    const auth = await getGoogleAuthClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get first row (headers)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${worksheetName}!1:1`
    });

    const headers = response.data.values?.[0] || [];
    console.log(`Found ${headers.length} columns:`, headers);
    
    if (headers.length === 0) {
      console.warn('No headers found in first row. Make sure your sheet has headers.');
    }
    
    const columns = headers.map((header, index) => ({
      name: header || `Column ${index + 1}`,
      index: index
    }));
    
    return columns;
  } catch (error) {
    console.error('Get Google Sheets columns error:', error);
    console.error('Error details:', error.message);
    throw new Error(`Failed to fetch Google Sheets columns: ${error.message}`);
  }
}

// Verify Supabase connection
export async function verifySupabaseConnection(supabaseUrl, serviceRoleKey) {
  try {
    console.log('Verifying Supabase connection...');
    
    // Test connection by making a simple request to the REST API
    const response = await axios.get(
      `${supabaseUrl}/rest/v1/`,
      {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        }
      }
    );
    
    console.log('✅ Supabase connection verified');
    return { verified: true };
  } catch (error) {
    console.error('❌ Supabase verification failed:', error.message);
    if (error.response?.status === 401) {
      throw new Error('Invalid service role key');
    } else if (error.response?.status === 404) {
      throw new Error('Invalid Supabase URL');
    }
    throw new Error(`Connection failed: ${error.message}`);
  }
}

// Get all tables from Supabase
export async function getSupabaseTables(supabaseUrl, serviceRoleKey) {
  try {
    console.log('Fetching Supabase tables...');
    
    // Query information_schema to get all user tables
    // We'll use Supabase's REST API with a SQL query via RPC (Remote Procedure Call)
    // Or we can query information_schema.tables directly
    
    // Method 1: Try to query information_schema via REST API
    // Supabase exposes information_schema as a table we can query
    try {
      const response = await axios.get(
        `${supabaseUrl}/rest/v1/rpc/get_tables`,
        {
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && Array.isArray(response.data)) {
        const tables = response.data.map(table => ({
          name: table.table_name || table.name,
          schema: table.table_schema || 'public'
        }));
        console.log(`✅ Found ${tables.length} table(s):`, tables.map(t => t.name).join(', '));
        return { verified: true, tables };
      }
    } catch (rpcError) {
      console.log('RPC method failed, trying alternative method...');
    }
    
    // Method 2: Query information_schema.tables directly via REST API
    try {
      const response = await axios.get(
        `${supabaseUrl}/rest/v1/information_schema.tables?table_schema=eq.public&table_type=eq.BASE TABLE&select=table_name`,
        {
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && Array.isArray(response.data)) {
        const tables = response.data
          .map(item => item.table_name)
          .filter(name => name && !name.startsWith('_')) // Filter out system tables
          .map(name => ({
            name: name,
            schema: 'public'
          }));
        console.log(`✅ Found ${tables.length} table(s):`, tables.map(t => t.name).join(', '));
        return { verified: true, tables };
      }
    } catch (schemaError) {
      console.log('Information schema query failed, trying SQL approach...');
    }
    
    // Method 3: Use Supabase's SQL endpoint (if available)
    // Some Supabase instances allow direct SQL queries
    try {
      const sqlQuery = {
        query: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `
      };
      
      const response = await axios.post(
        `${supabaseUrl}/rest/v1/rpc/exec_sql`,
        sqlQuery,
        {
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && Array.isArray(response.data)) {
        const tables = response.data
          .map(item => item.table_name || item.name)
          .filter(name => name && !name.startsWith('_'))
          .map(name => ({
            name: name,
            schema: 'public'
          }));
        console.log(`✅ Found ${tables.length} table(s):`, tables.map(t => t.name).join(', '));
        return { verified: true, tables };
      }
    } catch (sqlError) {
      console.log('SQL method failed, using fallback...');
    }
    
    // Fallback: Return empty array - user will need to enter table name manually
    console.warn('⚠️ Could not fetch table list automatically. User will need to enter table name manually.');
    return { verified: true, tables: [] };
  } catch (error) {
    console.error('Get Supabase tables error:', error);
    // Even if we can't get tables, connection might be valid
    // Return verified but empty tables list
    return { verified: true, tables: [] };
  }
}

// Get columns for a specific Supabase table
export async function getSupabaseColumns(supabaseUrl, serviceRoleKey, tableName) {
  try {
    console.log(`Fetching columns for table: ${tableName}`);
    
    // Method 1: Query information_schema.columns to get column information
    // This works even if the table is empty
    try {
      // For table names with spaces, we need to use quotes in the query
      // Try with and without quotes
      const tableNameVariations = [
        tableName, // Original name
        `"${tableName}"`, // Quoted (for spaces)
        tableName.toLowerCase(), // Lowercase
        tableName.replace(/\s+/g, '_') // Replace spaces with underscores
      ];
      
      for (const tableNameVar of tableNameVariations) {
        try {
          // URL encode the table name for the query parameter
          // For PostgREST, we need to use the exact table name as stored
          const encodedTableName = encodeURIComponent(tableNameVar);
          
          console.log(`Trying to fetch columns for table: "${tableNameVar}" (encoded: ${encodedTableName})`);
          
          // Try exact match first
          let schemaResponse = await axios.get(
            `${supabaseUrl}/rest/v1/information_schema.columns?table_name=eq.${encodedTableName}&table_schema=eq.public&select=column_name,data_type,is_nullable`,
            {
              headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json'
              }
            }
          );

          // If no results, try with ilike (case-insensitive) - but PostgREST might not support this
          if (!schemaResponse.data || !Array.isArray(schemaResponse.data) || schemaResponse.data.length === 0) {
            // Try without encoding (for simple names)
            schemaResponse = await axios.get(
              `${supabaseUrl}/rest/v1/information_schema.columns?table_name=eq.${tableNameVar}&table_schema=eq.public&select=column_name,data_type,is_nullable`,
              {
                headers: {
                  'apikey': serviceRoleKey,
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json'
                }
              }
            );
          }

          if (schemaResponse.data && Array.isArray(schemaResponse.data) && schemaResponse.data.length > 0) {
            const columns = schemaResponse.data.map(col => ({
              name: col.column_name,
              type: col.data_type || 'unknown'
            }));
            console.log(`✅ Found ${columns.length} columns from information_schema:`, columns.map(c => c.name).join(', '));
            return columns;
          }
        } catch (variationError) {
          console.log(`Variation "${tableNameVar}" failed:`, variationError.message);
          // Don't continue if it's a 404 - table doesn't exist
          if (variationError.response?.status === 404) {
            continue;
          }
        }
      }
    } catch (schemaError) {
      console.log('Information schema query failed, trying alternative method...', schemaError.message);
    }
    
    // Method 2: Try to get column info from PostgREST OPTIONS request
    try {
      const encodedTableName = encodeURIComponent(tableName);
      const optionsResponse = await axios.options(
        `${supabaseUrl}/rest/v1/${encodedTableName}`,
        {
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Accept': 'application/vnd.pgjson.object+json'
          }
        }
      );
      
      // Check if response headers contain column info
      const contentType = optionsResponse.headers['content-type'] || '';
      if (contentType.includes('json')) {
        // Try to parse response if it contains schema info
        console.log('OPTIONS response received');
      }
    } catch (e) {
      console.log('OPTIONS request failed, trying sample data method...');
    }
    
    // Method 3: Fetch one row to infer columns (only works if table has data)
    // Try different table name formats for tables with spaces
    try {
      const tableNameVariations = [
        tableName, // Original
        `"${tableName}"`, // Quoted
        tableName.replace(/\s+/g, '_'), // Underscores
        encodeURIComponent(tableName) // URL encoded
      ];
      
      for (const tableNameVar of tableNameVariations) {
        try {
          const sampleResponse = await axios.get(
            `${supabaseUrl}/rest/v1/${tableNameVar}?limit=1`,
            {
              headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Accept': 'application/json'
              }
            }
          );

          if (sampleResponse.data && Array.isArray(sampleResponse.data) && sampleResponse.data.length > 0) {
            const columns = Object.keys(sampleResponse.data[0]).map(key => ({
              name: key,
              type: typeof sampleResponse.data[0][key]
            }));
            console.log(`✅ Found ${columns.length} columns from sample data:`, columns.map(c => c.name).join(', '));
            return columns;
          } else if (sampleResponse.data && typeof sampleResponse.data === 'object' && !Array.isArray(sampleResponse.data)) {
            // Single object response
            const columns = Object.keys(sampleResponse.data).map(key => ({
              name: key,
              type: typeof sampleResponse.data[key]
            }));
            console.log(`✅ Found ${columns.length} columns from single object:`, columns.map(c => c.name).join(', '));
            return columns;
          }
        } catch (variationError) {
          // Try next variation
          continue;
        }
      }
      
      // If all variations failed and table appears empty
      // Table exists but is empty - try information_schema again with different approach
      console.log('Table is empty or all variations failed, trying RPC method...');
      
      // Try querying pg_catalog instead
      try {
        const pgResponse = await axios.post(
          `${supabaseUrl}/rest/v1/rpc/get_table_columns`,
          { table_name: tableName },
          {
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            }
          }
        );
        
        if (pgResponse.data && Array.isArray(pgResponse.data)) {
          const columns = pgResponse.data.map(col => ({
            name: col.column_name || col.name,
            type: col.data_type || col.type || 'unknown'
          }));
          console.log(`✅ Found ${columns.length} columns from RPC:`, columns.map(c => c.name).join(', '));
          return columns;
        }
      } catch (rpcError) {
        console.log('RPC method failed:', rpcError.message);
      }
      
      // If all methods fail and table is empty, throw helpful error
      console.warn('⚠️ Table exists but is empty and cannot fetch schema automatically.');
      throw new Error('Table is empty and schema cannot be fetched automatically. Please ensure the table has at least one row, or check table name.');
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`Table "${tableName}" not found. Please check the table name. Make sure it exists in the "public" schema.`);
      } else if (error.response?.status === 401) {
        throw new Error('Invalid service role key. Please check your credentials.');
      } else if (error.message.includes('empty')) {
        throw error;
      }
      
      // Last resort: Try a different information_schema query format
      try {
        const lastTryResponse = await axios.get(
          `${supabaseUrl}/rest/v1/information_schema.columns?table_name=eq.${tableName}&select=column_name`,
          {
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`
            }
          }
        );
        
        if (lastTryResponse.data && Array.isArray(lastTryResponse.data) && lastTryResponse.data.length > 0) {
          const columns = lastTryResponse.data.map(col => ({
            name: col.column_name,
            type: 'unknown'
          }));
          console.log(`✅ Found ${columns.length} columns (last try):`, columns.map(c => c.name).join(', '));
          return columns;
        }
      } catch (lastError) {
        console.error('All methods failed:', lastError.message);
      }
      
      throw new Error(`Failed to fetch columns: ${error.message}. Table may be empty or table name may be incorrect.`);
    }
  } catch (error) {
    console.error('Get Supabase columns error:', error);
    throw error;
  }
}
