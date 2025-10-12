const EventEmitter = require('events');

class WorkflowEngine extends EventEmitter {
  constructor() {
    super();
    this.workflows = new Map();
    this.executionHistory = [];
    this.running = new Map();
  }

  createWorkflow(workflow) {
    const id = workflow.id || `wf_${Date.now()}`;

    const workflowObj = {
      id,
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      steps: workflow.steps || [],
      createdAt: new Date(),
      enabled: true,
      executionCount: 0
    };

    this.workflows.set(id, workflowObj);
    this.emit('workflow-created', workflowObj);
    return workflowObj;
  }

  async executeWorkflow(workflowId, initialData = {}) {
    const workflow = this.workflows.get(workflowId);

    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (!workflow.enabled) throw new Error(`Workflow ${workflowId} is disabled`);

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const execution = {
      id: executionId,
      workflowId,
      startTime: new Date(),
      status: 'running',
      data: initialData,
      steps: [],
      context: {}
    };

    this.running.set(executionId, execution);
    this.emit('execution-started', execution);

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const stepResult = await this.executeStep(step, execution);

        execution.steps.push(stepResult);

        if (!stepResult.success && !step.continueOnError) {
          throw new Error(`Step ${step.name} failed: ${stepResult.error}`);
        }

        execution.context[step.id] = stepResult.output;
      }

      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = execution.endTime - execution.startTime;

      this.emit('execution-completed', execution);
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = new Date();

      this.emit('execution-failed', { execution, error });
    } finally {
      this.running.delete(executionId);
      this.executionHistory.push(execution);
      workflow.executionCount++;
    }

    return execution;
  }

  async executeStep(step, execution) {
    const stepExecution = {
      stepId: step.id,
      stepName: step.name,
      startTime: new Date(),
      success: false,
      output: null,
      error: null
    };

    try {
      stepExecution.output = await this.executeAction(step, execution);
      stepExecution.success = true;
    } catch (error) {
      stepExecution.error = error.message;
      stepExecution.success = false;
    }

    stepExecution.endTime = new Date();
    stepExecution.duration = stepExecution.endTime - stepExecution.startTime;

    this.emit('step-executed', stepExecution);
    return stepExecution;
  }

  async executeAction(step, execution) {
    const { type, config } = step;

    switch (type) {
      case 'crm_action':
        console.log(`Executing CRM action: ${config.action}`);
        return { action: config.action, result: 'success' };

      case 'send_notification':
        console.log(`Sending notification: ${config.message}`);
        return { sent: true, message: config.message };

      case 'delay':
        await new Promise(resolve => setTimeout(resolve, config.milliseconds || 1000));
        return { delayed: true };

      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  listWorkflows() {
    return Array.from(this.workflows.values());
  }

  getExecutionHistory(workflowId = null, limit = 50) {
    let history = this.executionHistory;

    if (workflowId) {
      history = history.filter(e => e.workflowId === workflowId);
    }

    return history.slice(-limit);
  }
}

module.exports = WorkflowEngine;
