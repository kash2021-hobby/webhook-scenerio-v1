import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../utils/api';

function WebhookDetail() {
  const { id } = useParams();
  const [webhook, setWebhook] = useState(null);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDestinationForm, setShowDestinationForm] = useState(false);
  const [destinationType, setDestinationType] = useState('google_sheets');
  const [destinationConfig, setDestinationConfig] = useState({});
  const [googleSpreadsheets, setGoogleSpreadsheets] = useState([]);
  const [googleWorksheets, setGoogleWorksheets] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [showMapping, setShowMapping] = useState(false);
  const [mappings, setMappings] = useState([]);
  const [availableFields, setAvailableFields] = useState([]);
  const [supabaseVerified, setSupabaseVerified] = useState(false);
  const [supabaseVerifying, setSupabaseVerifying] = useState(false);
  const [supabaseColumns, setSupabaseColumns] = useState([]);
  const [supabaseTables, setSupabaseTables] = useState([]);

  useEffect(() => {
    fetchWebhook();
    fetchDestinations();
    
    // Check if Google OAuth just completed
    const urlParams = new URLSearchParams(window.location.search);
    const googleConnected = urlParams.get('google_connected');
    
    if (googleConnected === 'true') {
      alert('✅ Google account connected! You can now select a spreadsheet.');
      // Clean up URL
      window.history.replaceState({}, document.title, `/webhook/${id}`);
      // Refresh spreadsheets list
      if (destinationType === 'google_sheets') {
        handleFetchSpreadsheets();
      }
    }
  }, [id]);

  // Auto-refresh webhook data every 5 seconds to see new payloads in real-time
  useEffect(() => {
    if (!webhook) return;
    
    const interval = setInterval(() => {
      fetchWebhook();
    }, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id]);

  const fetchWebhook = useCallback(async () => {
    try {
      console.log('🔄 Fetching webhook:', id);
      const response = await axios.get(`/webhooks/${id}`);
      console.log('📥 Webhook data received:', response.data);
      setWebhook(response.data);
      
      // Parse latest payload to get available fields
      if (response.data.latest_payload) {
        try {
          const payload = JSON.parse(response.data.latest_payload);
          console.log('📦 Parsed payload:', payload);
          const fields = flattenPayload(payload);
          const fieldKeys = Object.keys(fields);
          setAvailableFields(fieldKeys);
          console.log('✅ Available webhook fields:', fieldKeys);
        } catch (parseError) {
          console.error('❌ Error parsing payload:', parseError);
          console.error('Raw payload:', response.data.latest_payload);
        }
      } else {
        // If no payload yet, set some example fields for testing
        setAvailableFields([]);
        console.log('⚠️ No webhook payload received yet. Send a test webhook to see available fields.');
      }
    } catch (error) {
      console.error('❌ Error fetching webhook:', error);
      console.error('Error details:', error.response?.data);
      
      // Only show error message, don't redirect or logout
      // The error is already logged, user can see it in console
      if (error.response?.status === 401) {
        console.warn('⚠️ Authentication error - but not logging out. Check if token is valid.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchDestinations = async () => {
    try {
      const response = await axios.get(`/destinations/webhook/${id}`);
      setDestinations(response.data);
    } catch (error) {
      console.error('Error fetching destinations:', error);
    }
  };

  const flattenPayload = (obj, prefix = '', result = {}) => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          flattenPayload(obj[key], newKey, result);
        } else {
          result[newKey] = obj[key];
        }
      }
    }
    return result;
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await axios.get('/auth/google/url');
      // Add return URL so we come back to this webhook page after OAuth
      const returnUrl = encodeURIComponent(`${window.location.origin}/webhook/${id}?google_connected=true`);
      const oauthUrl = `${response.data.url}&return_url=${returnUrl}`;
      window.location.href = oauthUrl;
    } catch (error) {
      alert('Failed to connect Google account: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleFetchSpreadsheets = async () => {
    try {
      const response = await axios.get('/auth/google/spreadsheets');
      setGoogleSpreadsheets(response.data.spreadsheets);
    } catch (error) {
      if (error.response?.status === 401) {
        handleConnectGoogle();
      } else {
        alert(error.response?.data?.error || 'Failed to fetch spreadsheets');
      }
    }
  };

  const handleFetchWorksheets = async (spreadsheetId) => {
    try {
      const response = await axios.get(`/auth/google/spreadsheets/${spreadsheetId}/worksheets`);
      setGoogleWorksheets(response.data.worksheets);
      setDestinationConfig({ ...destinationConfig, spreadsheetId });
    } catch (error) {
      alert('Failed to fetch worksheets');
    }
  };

  const handleVerifySupabase = async () => {
    if (!destinationConfig.supabaseUrl || !destinationConfig.serviceRoleKey) {
      alert('Please enter Supabase URL and Service Role Key first');
      return;
    }

    setSupabaseVerifying(true);
    try {
      // First verify connection
      const verifyResponse = await axios.post('/destinations/verify/supabase', {
        supabaseUrl: destinationConfig.supabaseUrl,
        serviceRoleKey: destinationConfig.serviceRoleKey
      });
      
      if (verifyResponse.data.verified) {
        setSupabaseVerified(true);
        
        // Then fetch tables
        try {
          const tablesResponse = await axios.post('/destinations/supabase/tables', {
            supabaseUrl: destinationConfig.supabaseUrl,
            serviceRoleKey: destinationConfig.serviceRoleKey
          });
          
          if (tablesResponse.data.tables && tablesResponse.data.tables.length > 0) {
            setSupabaseTables(tablesResponse.data.tables);
            alert(`✅ Supabase connection verified! Found ${tablesResponse.data.tables.length} table(s).`);
          } else {
            setSupabaseTables([]);
            alert('✅ Supabase connection verified! However, could not fetch table list automatically. Please enter table name manually.');
          }
        } catch (tablesError) {
          console.warn('Could not fetch tables:', tablesError);
          setSupabaseTables([]);
          alert('✅ Supabase connection verified! However, could not fetch table list. Please enter table name manually.');
        }
      }
    } catch (error) {
      setSupabaseVerified(false);
      setSupabaseTables([]);
      alert('❌ Verification failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setSupabaseVerifying(false);
    }
  };

  const handleFetchSupabaseColumns = async () => {
    if (!destinationConfig.supabaseUrl || !destinationConfig.serviceRoleKey || !destinationConfig.tableName) {
      alert('Please enter Supabase URL, Service Role Key, and Table Name');
      return;
    }

    try {
      const response = await axios.post('/destinations/supabase/columns', {
        supabaseUrl: destinationConfig.supabaseUrl,
        serviceRoleKey: destinationConfig.serviceRoleKey,
        tableName: destinationConfig.tableName
      });
      
      setSupabaseColumns(response.data.columns);
      alert(`✅ Found ${response.data.columns.length} column(s): ${response.data.columns.map(c => c.name).join(', ')}`);
    } catch (error) {
      setSupabaseColumns([]);
      alert('❌ Failed to fetch columns: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleCreateDestination = async (e) => {
    e.preventDefault();
    try {
      // For Supabase, verify connection first if not already verified
      if (destinationType === 'supabase' && !supabaseVerified) {
        const verify = window.confirm('Supabase connection not verified. Do you want to verify it now?');
        if (verify) {
          await handleVerifySupabase();
          if (!supabaseVerified) {
            return; // Don't create if verification failed
          }
        }
      }

      await axios.post('/destinations', {
        webhookId: id,
        type: destinationType,
        config: destinationConfig
      });
      fetchDestinations();
      setShowDestinationForm(false);
      setDestinationConfig({});
      setSupabaseVerified(false);
      setSupabaseColumns([]);
      setSupabaseTables([]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create destination');
    }
  };

  const handleToggleDestination = async (destinationId, enabled) => {
    try {
      await axios.put(`/destinations/${destinationId}`, { enabled: !enabled });
      fetchDestinations();
    } catch (error) {
      alert('Failed to update destination');
    }
  };

  const handleDeleteDestination = async (destinationId) => {
    if (!window.confirm('Are you sure you want to delete this destination?')) return;
    try {
      await axios.delete(`/destinations/${destinationId}`);
      fetchDestinations();
    } catch (error) {
      alert('Failed to delete destination');
    }
  };

  const handleConfigureMapping = async (destination) => {
    setSelectedDestination(destination);
    try {
      console.log('Fetching columns for destination:', destination.id);
      
      // Fetch columns
      const columnsResponse = await axios.get(`/destinations/${destination.id}/columns`);
      const columns = columnsResponse.data.columns;
      
      console.log('Fetched columns:', columns);

      if (!columns || columns.length === 0) {
        alert('No columns found in the destination. Make sure your Google Sheet has headers in the first row.');
        return;
      }

      // Fetch existing mappings
      const mappingsResponse = await axios.get(`/mappings/destination/${destination.id}`);
      const existingMappings = mappingsResponse.data;

      // Create mapping entries for each column
      const newMappings = columns.map(col => {
        const existing = existingMappings.find(m => m.destination_field === col.name);
        return {
          destinationField: col.name,
          webhookField: existing ? existing.webhook_field : ''
        };
      });

      console.log('Created mappings:', newMappings);
      console.log('Available webhook fields:', availableFields);

      setMappings(newMappings);
      setShowMapping(true);
    } catch (error) {
      console.error('Error loading mapping:', error);
      alert(error.response?.data?.error || 'Failed to load mapping configuration. Check console for details.');
    }
  };

  const handleSaveMapping = async () => {
    try {
      const mappingData = mappings
        .filter(m => m.webhookField && m.webhookField.trim() !== '')
        .map(m => ({
          webhookField: m.webhookField,
          destinationField: m.destinationField
        }));

      console.log('Saving mappings:', mappingData);

      if (mappingData.length === 0) {
        alert('Please map at least one field before saving.');
        return;
      }

      const response = await axios.post(`/mappings/destination/${selectedDestination.id}`, {
        mappings: mappingData
      });

      console.log('Mappings saved successfully:', response.data);
      setShowMapping(false);
      alert(`✅ Mapping saved successfully! ${mappingData.length} field(s) mapped.`);
    } catch (error) {
      console.error('Save mapping error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save mapping';
      alert(`Failed to save mapping: ${errorMessage}`);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!webhook) {
    return <div className="text-center py-12">Webhook not found</div>;
  }

  // Get API base URL - use ngrok URL for public webhooks
  // You can set REACT_APP_NGROK_URL in .env or use this default
  const ngrokUrl = process.env.REACT_APP_NGROK_URL || 'https://unreciprocated-rebekah-proverbially.ngrok-free.dev';
  const apiBaseUrl = process.env.REACT_APP_API_URL || ngrokUrl;
  
  // Remove /api from base URL if present (webhook URL needs full path)
  const baseUrl = apiBaseUrl.replace('/api', '');
  const webhookUrl = `${baseUrl}/api/webhook/receive/${webhook.user_id}/${webhook.webhook_id}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/dashboard" className="flex items-center text-gray-500 hover:text-gray-700">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">{webhook.name}</h1>

          {/* Webhook URL */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-2">Webhook URL</h2>
            <div className="flex items-center space-x-2 mb-3">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  alert('URL copied to clipboard!');
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Latest Payload */}
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Latest Payload</h2>
              <button
                onClick={fetchWebhook}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                🔄 Refresh
              </button>
            </div>
            {webhook.latest_payload ? (
              <>
                <pre className="bg-gray-50 p-4 rounded overflow-auto text-sm mb-2">
                  {JSON.stringify(JSON.parse(webhook.latest_payload), null, 2)}
                </pre>
                <div className="text-sm text-gray-600">
                  <strong>Available fields for mapping:</strong>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {availableFields.length > 0 ? (
                      availableFields.map(field => (
                        <span key={field} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          {field}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500">No fields detected. Send a webhook to see available fields.</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <p className="text-sm text-yellow-800">
                  No webhook data received yet. Send a POST request to your webhook URL to see the payload here.
                </p>
                <p className="text-xs text-yellow-700 mt-2">
                  Webhook URL: <code className="bg-yellow-100 px-1 rounded">{webhookUrl}</code>
                </p>
              </div>
            )}
          </div>

          {/* Destinations */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Destinations</h2>
              <button
                onClick={() => setShowDestinationForm(!showDestinationForm)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                + Add Destination
              </button>
            </div>

            {showDestinationForm && (
              <form onSubmit={handleCreateDestination} className="mb-6 p-4 border rounded-lg">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Destination Type
                  </label>
                  <select
                    value={destinationType}
                    onChange={(e) => {
                      setDestinationType(e.target.value);
                      setDestinationConfig({});
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="google_sheets">Google Sheets</option>
                    <option value="supabase">Supabase</option>
                  </select>
                </div>

                {destinationType === 'google_sheets' && (
                  <>
                    {googleSpreadsheets.length === 0 ? (
                      <button
                        type="button"
                        onClick={handleFetchSpreadsheets}
                        className="mb-4 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                      >
                        Connect Google Account
                      </button>
                    ) : (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Spreadsheet
                          </label>
                          <select
                            onChange={(e) => {
                              const spreadsheetId = e.target.value;
                              setDestinationConfig({ ...destinationConfig, spreadsheetId });
                              handleFetchWorksheets(spreadsheetId);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            required
                          >
                            <option value="">Select spreadsheet</option>
                            {googleSpreadsheets.map((spreadsheet) => (
                              <option key={spreadsheet.id} value={spreadsheet.id}>
                                {spreadsheet.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Worksheet
                          </label>
                          <select
                            onChange={(e) => {
                              setDestinationConfig({
                                ...destinationConfig,
                                worksheetName: e.target.value
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            required
                          >
                            <option value="">Select worksheet</option>
                            {googleWorksheets.map((worksheet) => (
                              <option key={worksheet.sheetId} value={worksheet.title}>
                                {worksheet.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </>
                )}

                {destinationType === 'supabase' && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Supabase URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://your-project.supabase.co"
                        value={destinationConfig.supabaseUrl || ''}
                        onChange={(e) => {
                          setDestinationConfig({ ...destinationConfig, supabaseUrl: e.target.value });
                          setSupabaseVerified(false); // Reset verification when URL changes
                          setSupabaseTables([]); // Reset tables when URL changes
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Service Role Key
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="password"
                          placeholder="Your service role key"
                          value={destinationConfig.serviceRoleKey || ''}
                          onChange={(e) => {
                            setDestinationConfig({
                              ...destinationConfig,
                              serviceRoleKey: e.target.value
                            });
                            setSupabaseVerified(false); // Reset verification when key changes
                            setSupabaseTables([]); // Reset tables when key changes
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                        <button
                          type="button"
                          onClick={handleVerifySupabase}
                          disabled={supabaseVerifying || !destinationConfig.supabaseUrl || !destinationConfig.serviceRoleKey}
                          className={`px-4 py-2 rounded-md text-sm font-medium ${
                            supabaseVerified
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400'
                          }`}
                        >
                          {supabaseVerifying ? 'Verifying...' : supabaseVerified ? '✅ Verified' : 'Verify'}
                        </button>
                      </div>
                      {supabaseVerified && (
                        <p className="mt-1 text-sm text-green-600">✅ Connection verified</p>
                      )}
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Table Name
                      </label>
                      <div className="flex space-x-2">
                        {supabaseTables.length > 0 ? (
                          <select
                            value={destinationConfig.tableName || ''}
                            onChange={async (e) => {
                              const tableName = e.target.value;
                              setDestinationConfig({ ...destinationConfig, tableName });
                              // Auto-fetch columns when table is selected
                              if (tableName && supabaseVerified) {
                                await handleFetchSupabaseColumns();
                              }
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                            required
                          >
                            <option value="">Select a table</option>
                            {supabaseTables.map((table) => (
                              <option key={table.name} value={table.name}>
                                {table.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="table_name"
                            value={destinationConfig.tableName || ''}
                            onChange={(e) =>
                              setDestinationConfig({ ...destinationConfig, tableName: e.target.value })
                            }
                            onBlur={() => {
                              // Auto-fetch columns when table name is entered and connection is verified
                              if (destinationConfig.tableName && supabaseVerified) {
                                handleFetchSupabaseColumns();
                              }
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                            required
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleFetchSupabaseColumns}
                          disabled={!supabaseVerified || !destinationConfig.tableName}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                        >
                          Fetch Columns
                        </button>
                      </div>
                      {supabaseTables.length === 0 && supabaseVerified && (
                        <p className="mt-1 text-sm text-gray-500">
                          Could not fetch table list automatically. Please enter table name manually.
                        </p>
                      )}
                      {supabaseColumns.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-600 mb-1">
                            <strong>Found {supabaseColumns.length} column(s):</strong>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {supabaseColumns.map((col) => (
                              <span
                                key={col.name}
                                className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                              >
                                {col.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Conflict Key (optional, for upserts)
                      </label>
                      <input
                        type="text"
                        placeholder="id"
                        value={destinationConfig.conflictKey || ''}
                        onChange={(e) =>
                          setDestinationConfig({ ...destinationConfig, conflictKey: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </>
                )}

                <div className="flex space-x-2">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDestinationForm(false);
                      setDestinationConfig({});
                    }}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {destinations.length === 0 ? (
              <p className="text-gray-500">No destinations configured yet.</p>
            ) : (
              <div className="space-y-4">
                {destinations.map((destination) => {
                  const config = JSON.parse(destination.config);
                  return (
                    <div key={destination.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold capitalize">
                            {destination.type.replace('_', ' ')}
                          </h3>
                          {destination.type === 'google_sheets' && (
                            <p className="text-sm text-gray-600">
                              {config.spreadsheetId} / {config.worksheetName}
                            </p>
                          )}
                          {destination.type === 'supabase' && (
                            <p className="text-sm text-gray-600">
                              {config.tableName} @ {config.supabaseUrl}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={destination.enabled === 1}
                              onChange={() =>
                                handleToggleDestination(destination.id, destination.enabled)
                              }
                              className="mr-2"
                            />
                            <span className="text-sm">Enabled</span>
                          </label>
                          <button
                            onClick={() => handleConfigureMapping(destination)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Map Fields
                          </button>
                          <button
                            onClick={() => handleDeleteDestination(destination.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mapping Modal */}
      {showMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Field Mapping</h2>
            <p className="text-sm text-gray-600 mb-4">
              Map webhook fields to your Google Sheet columns. 
              {availableFields.length === 0 && (
                <span className="text-yellow-600 font-semibold"> 
                  ⚠️ No webhook fields available. Send a test webhook first to see available fields.
                </span>
              )}
            </p>
            
            {mappings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No columns found in the destination. Make sure your Google Sheet has headers in the first row.
              </div>
            ) : (
              <div className="space-y-3">
                {mappings.map((mapping, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sheet Column: <span className="font-semibold text-blue-600">{mapping.destinationField}</span>
                        </label>
                        <select
                          value={mapping.webhookField}
                          onChange={(e) => {
                            const newMappings = [...mappings];
                            newMappings[index].webhookField = e.target.value;
                            setMappings(newMappings);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Select webhook field --</option>
                          {availableFields.length > 0 ? (
                            availableFields.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))
                          ) : (
                            <option value="" disabled>No webhook fields available</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                {mappings.filter(m => m.webhookField).length} of {mappings.length} fields mapped
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowMapping(false)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={mappings.filter(m => m.webhookField).length === 0}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Mapping
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WebhookDetail;
