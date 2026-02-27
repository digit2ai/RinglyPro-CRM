import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Code, Settings } from 'lucide-react';
import { widgetApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function WidgetPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    agent_name: '',
    greeting_message: '',
    primary_color: '#6C63FF',
    position: 'bottom-right',
    domain_whitelist: '',
    enabled: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['widget-config'],
    queryFn: () => widgetApi.get(),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => widgetApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widget-config'] });
    },
  });

  useEffect(() => {
    if (data?.data) {
      const config = data.data;
      setFormData({
        agent_name: config.agent_name || '',
        greeting_message: config.greeting_message || '',
        primary_color: config.primary_color || '#6C63FF',
        position: config.position || 'bottom-right',
        domain_whitelist: (config.domain_whitelist || []).join(', '),
        enabled: config.enabled !== false,
      });
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSave = () => {
    const payload = {
      ...formData,
      domain_whitelist: formData.domain_whitelist
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
    };
    updateMutation.mutate(payload);
  };

  const widgetId = data?.data?.widget_id || 'YOUR_WIDGET_ID';
  const embedCode = `<script src="https://aiagent.ringlypro.com/webcallcenter/widget.js" data-widget-id="${widgetId}"></script>`;

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading widget configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Widget Configuration</h1>
        <p className="text-muted-foreground">
          Configure and embed the voice call widget on your website.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Widget Settings</CardTitle>
            </div>
            <CardDescription>Customize the appearance and behavior of your call widget.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Agent Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Agent Name</label>
                <input
                  type="text"
                  name="agent_name"
                  value={formData.agent_name}
                  onChange={handleChange}
                  placeholder="e.g., Support Agent"
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Greeting Message */}
              <div>
                <label className="block text-sm font-medium mb-1">Greeting Message</label>
                <textarea
                  name="greeting_message"
                  value={formData.greeting_message}
                  onChange={handleChange}
                  placeholder="Hello! How can I help you today?"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-sm font-medium mb-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    name="primary_color"
                    value={formData.primary_color}
                    onChange={handleChange}
                    placeholder="#6C63FF"
                    className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div
                    className="w-10 h-10 rounded-lg border"
                    style={{ backgroundColor: formData.primary_color }}
                  />
                </div>
              </div>

              {/* Position */}
              <div>
                <label className="block text-sm font-medium mb-1">Position</label>
                <select
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="top-left">Top Left</option>
                </select>
              </div>

              {/* Domain Whitelist */}
              <div>
                <label className="block text-sm font-medium mb-1">Domain Whitelist</label>
                <textarea
                  name="domain_whitelist"
                  value={formData.domain_whitelist}
                  onChange={handleChange}
                  placeholder="example.com, app.example.com"
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated list of allowed domains. Leave empty to allow all.
                </p>
              </div>

              {/* Enable toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <label className="text-sm font-medium">Enable Widget</label>
                  <p className="text-xs text-muted-foreground">
                    Turn the widget on or off for all domains.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={formData.enabled}
                    onChange={handleChange}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>

              {/* Save button */}
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="w-full"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>

              {updateMutation.isSuccess && (
                <p className="text-sm text-green-600 text-center">Configuration saved successfully!</p>
              )}
              {updateMutation.isError && (
                <p className="text-sm text-red-600 text-center">Failed to save. Please try again.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Embed code */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Embed Code</CardTitle>
            </div>
            <CardDescription>
              Copy this code and paste it into your website's HTML, just before the closing &lt;/body&gt; tag.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm overflow-x-auto">
                  <code>{embedCode}</code>
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyEmbedCode}
                  className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-1">Installation Instructions</h4>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Copy the embed code above.</li>
                  <li>Open your website's HTML file or template.</li>
                  <li>Paste the code just before the closing <code className="bg-blue-100 px-1 rounded">&lt;/body&gt;</code> tag.</li>
                  <li>Save and deploy your changes.</li>
                  <li>The call widget will appear on your website.</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
