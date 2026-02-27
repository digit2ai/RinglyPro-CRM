import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Database, X } from 'lucide-react';
import { knowledgeBaseApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const KB_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'csv', label: 'CSV' },
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
];

const emptyForm = {
  name: '',
  type: 'text',
  content: '',
  config: {},
};

export function KnowledgeBasePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-base'],
    queryFn: () => knowledgeBaseApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => knowledgeBaseApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => knowledgeBaseApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => knowledgeBaseApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    },
  });

  const kbItems = data?.data || [];

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (item) => {
    setFormData({
      name: item.name || '',
      type: item.type || 'text',
      content: item.content || '',
      config: item.config || {},
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this knowledge base?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleConfigChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  const getStatusVariant = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'syncing': return 'warning';
      case 'error': return 'danger';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Manage the data sources your AI agent uses to answer calls.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Knowledge Base
        </Button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {editingId ? 'Edit Knowledge Base' : 'Add New Knowledge Base'}
              </CardTitle>
              <button onClick={resetForm}>
                <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Product FAQ"
                  required
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {KB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Content - shown for text type */}
              {formData.type === 'text' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Content</label>
                  <textarea
                    name="content"
                    value={formData.content}
                    onChange={handleChange}
                    placeholder="Enter your knowledge base content here..."
                    rows={8}
                    className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                  />
                </div>
              )}

              {/* CSV config */}
              {formData.type === 'csv' && (
                <div>
                  <label className="block text-sm font-medium mb-1">CSV URL or Content</label>
                  <textarea
                    name="content"
                    value={formData.content}
                    onChange={handleChange}
                    placeholder="Paste CSV content or enter a URL to a CSV file..."
                    rows={6}
                    className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                  />
                </div>
              )}

              {/* API config */}
              {formData.type === 'api' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">API Endpoint URL</label>
                    <input
                      type="url"
                      value={formData.config.url || ''}
                      onChange={(e) => handleConfigChange('url', e.target.value)}
                      placeholder="https://api.example.com/data"
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key (optional)</label>
                    <input
                      type="password"
                      value={formData.config.api_key || ''}
                      onChange={(e) => handleConfigChange('api_key', e.target.value)}
                      placeholder="Enter API key"
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Sync Interval (minutes)</label>
                    <input
                      type="number"
                      value={formData.config.sync_interval || 60}
                      onChange={(e) => handleConfigChange('sync_interval', parseInt(e.target.value))}
                      min={5}
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              )}

              {/* Database config */}
              {formData.type === 'database' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Connection String</label>
                    <input
                      type="text"
                      value={formData.config.connection_string || ''}
                      onChange={(e) => handleConfigChange('connection_string', e.target.value)}
                      placeholder="postgresql://user:pass@host:5432/db"
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Query</label>
                    <textarea
                      value={formData.config.query || ''}
                      onChange={(e) => handleConfigChange('query', e.target.value)}
                      placeholder="SELECT * FROM knowledge_table"
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Knowledge base list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Knowledge Bases</CardTitle>
          <CardDescription>
            {kbItems.length} knowledge base{kbItems.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading knowledge bases...</div>
          ) : kbItems.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No knowledge bases yet.</p>
              <p className="text-sm text-muted-foreground">
                Add a knowledge base to help your AI agent answer questions.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Last Synced</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {kbItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{item.name}</td>
                      <td className="py-3 px-2 capitalize">{item.type}</td>
                      <td className="py-3 px-2">
                        <Badge variant={getStatusVariant(item.status)}>
                          {item.status || 'unknown'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground">
                        {item.last_synced
                          ? new Date(item.last_synced).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Never'}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(item)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(item.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
