import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { taskApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/Loading';
import { ErrorMessage } from '@/components/ErrorMessage';
import { CheckSquare, Check, Filter } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { Link } from 'react-router-dom';

export function TasksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Fetch tasks with filters
  const {
    data: tasks,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tasks', statusFilter, priorityFilter],
    queryFn: () =>
      taskApi.getAll({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        limit: 50,
      }),
  });

  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: ({ id, completed_by, outcome }) =>
      taskApi.complete(id, completed_by, outcome),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => taskApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleComplete = (taskId) => {
    const outcome = prompt('Enter completion notes (optional):');
    completeMutation.mutate({
      id: taskId,
      completed_by: 'Dashboard User',
      outcome: outcome || 'Task completed via dashboard',
    });
  };

  const handleUpdateStatus = (taskId, status) => {
    updateStatusMutation.mutate({ id: taskId, status });
  };

  if (isLoading) {
    return <Loading message="Loading tasks..." />;
  }

  if (error) {
    return <ErrorMessage error={error} retry={refetch} />;
  }

  const taskData = tasks?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Task Management</h1>
        <p className="text-muted-foreground mt-1">
          Track and manage store tasks
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <div className="flex gap-2">
                {['all', 'pending', 'in_progress', 'completed'].map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={statusFilter === status ? 'default' : 'outline'}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Priority:</span>
              <div className="flex gap-2">
                {['all', '1', '2', '3', '4', '5'].map((priority) => (
                  <Button
                    key={priority}
                    size="sm"
                    variant={priorityFilter === priority ? 'default' : 'outline'}
                    onClick={() => setPriorityFilter(priority)}
                  >
                    {priority === 'all' ? 'All' : `P${priority}`}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <div className="space-y-4">
        {taskData.length > 0 ? (
          taskData.map((task) => {
            const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'completed';

            return (
              <Card
                key={task.id}
                className={`${
                  isOverdue ? 'border-l-4 border-l-danger' :
                  task.priority <= 2 ? 'border-l-4 border-l-warning' : ''
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Task Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <Badge
                          variant={
                            task.priority === 1 ? 'danger' :
                            task.priority <= 3 ? 'warning' : 'default'
                          }
                        >
                          Priority {task.priority}
                        </Badge>
                        <StatusBadge status={task.status}>
                          {task.status.replace('_', ' ')}
                        </StatusBadge>
                        {isOverdue && (
                          <Badge variant="danger">
                            Overdue
                          </Badge>
                        )}
                      </div>

                      {/* Task Title */}
                      <h3 className="text-lg font-semibold mb-2">
                        {task.title}
                      </h3>

                      {/* Task Description */}
                      <p className="text-sm text-muted-foreground mb-4">
                        {task.description}
                      </p>

                      {/* Store Info */}
                      {task.store && (
                        <Link
                          to={`/stores/${task.store.id}`}
                          className="inline-flex items-center text-sm text-primary hover:underline mb-4"
                        >
                          {task.store.store_code} - {task.store.name}
                        </Link>
                      )}

                      {/* Metadata */}
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>Assigned to: {task.assigned_to_role || 'Unassigned'}</span>
                        {task.due_date && (
                          <span className={isOverdue ? 'text-danger font-semibold' : ''}>
                            Due: {format(parseISO(task.due_date), 'MMM dd, yyyy')}
                          </span>
                        )}
                        {task.completed_at && (
                          <span>
                            Completed: {format(parseISO(task.completed_at), 'MMM dd, HH:mm')}
                            {task.completed_by && ` by ${task.completed_by}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {task.status !== 'completed' && (
                      <div className="flex flex-col gap-2">
                        {task.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(task.id, 'in_progress')}
                            disabled={updateStatusMutation.isPending}
                          >
                            Start
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleComplete(task.id)}
                          disabled={completeMutation.isPending}
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Complete
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No tasks found matching the selected filters
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
