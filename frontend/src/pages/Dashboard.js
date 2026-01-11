import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from '../utils/api';

function Dashboard() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWebhooks();
    
    // Check for OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const googleConnected = urlParams.get('google_connected');
    const oauthError = urlParams.get('error');
    
    if (googleConnected === 'true') {
      alert('✅ Google account connected successfully! You can now add Google Sheets destinations.');
      // Clean up URL
      window.history.replaceState({}, document.title, '/dashboard');
    } else if (oauthError) {
      alert(`❌ Google OAuth failed: ${oauthError}`);
      // Clean up URL
      window.history.replaceState({}, document.title, '/dashboard');
    }
  }, []);

  const fetchWebhooks = async () => {
    try {
      const response = await axios.get('/webhooks');
      setWebhooks(response.data);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    
    if (!newWebhookName || newWebhookName.trim() === '') {
      alert('Please enter a webhook name');
      return;
    }

    try {
      console.log('🔄 Creating webhook:', newWebhookName);
      const response = await axios.post('/webhooks', { name: newWebhookName.trim() });
      console.log('✅ Webhook created:', response.data);
      
      setWebhooks([response.data, ...webhooks]);
      setNewWebhookName('');
      setShowCreateForm(false);
      navigate(`/webhook/${response.data.id}`);
    } catch (error) {
      console.error('❌ Create webhook error:', error);
      console.error('   Response:', error.response?.data);
      console.error('   Status:', error.response?.status);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create webhook';
      alert(`Failed to create webhook: ${errorMessage}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return;

    try {
      await axios.delete(`/webhooks/${id}`);
      setWebhooks(webhooks.filter(w => w.id !== id));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete webhook');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Webhook Router</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className="border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Webhooks
                </Link>
                <Link
                  to="/logs"
                  className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                >
                  Logs
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 mr-4">{user?.email}</span>
              <button
                onClick={logout}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Webhooks</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              {showCreateForm ? 'Cancel' : '+ New Webhook'}
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateWebhook} className="mb-6 bg-white p-4 rounded-lg shadow">
              <input
                type="text"
                placeholder="Webhook name"
                value={newWebhookName}
                onChange={(e) => setNewWebhookName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <button
                type="submit"
                className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Create
              </button>
            </form>
          )}

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No webhooks yet. Create one to get started!</p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {webhooks.map((webhook) => (
                  <li key={webhook.id}>
                    <Link
                      to={`/webhook/${webhook.id}`}
                      className="block hover:bg-gray-50"
                    >
                      <div className="px-4 py-4 sm:px-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <p className="text-sm font-medium text-blue-600 truncate">
                              {webhook.name}
                            </p>
                          </div>
                          <div className="ml-2 flex-shrink-0 flex">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleDelete(webhook.id);
                              }}
                              className="text-red-600 hover:text-red-900 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex">
                            <p className="flex items-center text-sm text-gray-500">
                              ID: {webhook.webhook_id}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                            Created: {new Date(webhook.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
