import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { callsApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDuration } from '@/lib/utils';

export function CallsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['calls', page, search],
    queryFn: () => callsApi.list({ page, limit, search: search || undefined }),
  });

  const calls = data?.data?.calls || [];
  const totalPages = data?.data?.totalPages || 1;
  const totalCount = data?.data?.total || 0;

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const getStatusVariant = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'in_progress': return 'warning';
      default: return 'outline';
    }
  };

  const getDirectionLabel = (direction) => {
    return direction === 'inbound' ? 'Inbound' : 'Outbound';
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Call Log</h1>
        <p className="text-muted-foreground">
          View and search all call records.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search calls..."
          value={search}
          onChange={handleSearch}
          className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Calls table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Calls {totalCount > 0 && <span className="text-muted-foreground font-normal">({totalCount})</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading calls...</div>
          ) : calls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? 'No calls match your search.' : 'No calls recorded yet.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground w-8"></th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Date/Time</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Duration</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Direction</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Summary</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => (
                      <React.Fragment key={call.id}>
                        <tr
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleExpand(call.id)}
                        >
                          <td className="py-3 px-2">
                            {expandedRow === call.id ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            {new Date(call.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            {formatDuration(call.duration)}
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            {getDirectionLabel(call.direction)}
                          </td>
                          <td className="py-3 px-2 text-muted-foreground truncate max-w-xs">
                            {call.summary || 'No summary'}
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={getStatusVariant(call.status)}>
                              {call.status || 'unknown'}
                            </Badge>
                          </td>
                        </tr>

                        {/* Expanded transcript row */}
                        {expandedRow === call.id && (
                          <tr className="bg-muted/30">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium">Transcript</h4>
                                <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-background rounded-lg p-4 border max-h-64 overflow-y-auto">
                                  {call.transcript || 'No transcript available for this call.'}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
