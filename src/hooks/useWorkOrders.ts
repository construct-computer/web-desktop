import { useCallback, useEffect, useState } from 'react';
import * as api from '@/services/api';
import { WORK_ORDER_UPDATED_EVENT, type WorkOrderUpdatedDetail } from '@/lib/agentUiEvents';
import { ACTIVE_WORK_ORDER_STATUSES } from '@/lib/workStatusFormat';

export type WorkOrderRow = api.AutopilotWorkOrderSnapshot & { activityHint: string; stalled: boolean };

function mergeTaskFromEvent(prev: WorkOrderRow[], wo: WorkOrderUpdatedDetail): WorkOrderRow[] {
  const merged = {
    ...(prev.find((item) => item.id === wo.id) || {
      id: wo.id,
      sessionKey: wo.sessionKey,
      sourceType: 'user_message' as const,
      sourceId: null,
      requesterRole: 'owner' as const,
      objective: wo.objective,
      riskLevel: 'low' as const,
      blockerReason: wo.blockerReason,
      stepCount: 0,
      artifactCount: 0,
      deliveryCount: 0,
      verificationCount: 0,
      latestStepTitle: null,
      latestStepStatus: null,
      latestArtifactPath: null,
      latestDeliveryChannel: null,
      latestDeliveryStatus: null,
      latestVerificationStatus: null,
      createdAt: wo.updatedAt,
      updatedAt: wo.updatedAt,
      completedAt: wo.completedAt,
      activityHint: wo.activityHint,
      stalled: wo.stalled,
    }),
    ...wo,
    activityHint: wo.activityHint,
    stalled: wo.stalled,
    status: wo.status,
    blockerReason: wo.blockerReason,
    updatedAt: wo.updatedAt,
    completedAt: wo.completedAt,
  } as WorkOrderRow;
  const without = prev.filter((item) => item.id !== wo.id);
  if (['completed', 'failed', 'cancelled'].includes(wo.status)) {
    return [merged, ...without].slice(0, 15);
  }
  return [merged, ...without.filter((item) => ACTIVE_WORK_ORDER_STATUSES.has(item.status))].slice(0, 15);
}

export function useWorkOrders() {
  const [tasks, setTasks] = useState<WorkOrderRow[]>([]);
  const [scheduledWork, setScheduledWork] = useState<api.AutopilotScheduledWorkSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [tasksResult, autopilotResult] = await Promise.all([
      api.listAgentTasks('all'),
      api.getAutopilotStatus(),
    ]);
    if (tasksResult.success) setTasks(tasksResult.data.tasks);
    if (autopilotResult.success) setScheduledWork(autopilotResult.data.scheduledWork || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const wo = (event as CustomEvent<WorkOrderUpdatedDetail>).detail;
      if (!wo?.id) return;
      setTasks((prev) => mergeTaskFromEvent(prev, wo));
    };
    window.addEventListener(WORK_ORDER_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(WORK_ORDER_UPDATED_EVENT, onUpdate);
  }, []);

  const blockedCount = tasks.filter((t) => t.status === 'blocked').length;
  const activeCount = tasks.filter((t) => ACTIVE_WORK_ORDER_STATUSES.has(t.status)).length;

  return { tasks, scheduledWork, loading, refresh, blockedCount, activeCount };
}
