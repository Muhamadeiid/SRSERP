export function notificationRequestTarget(notification) {
  const data = notification?.data ?? {}

  if (data.maintenance_task_id) {
    return {
      path: '/maintenance',
      query: `task=${data.maintenance_task_id}`,
    }
  }

  if (data.calendar_event_id) {
    return {
      path: '/work-calendar',
      query: `event=${data.calendar_event_id}`,
    }
  }

  if (data.resignation_request_id) {
    return {
      path: '/human-resources/resignations',
      query: `ticket=${data.resignation_request_id}`,
    }
  }

  if (data.prf_id) {
    return { path: `/procurement/${data.prf_id}`, query: '' }
  }

  if (data.incident_report_id) {
    return { path: '/incident-reports', query: `report=${data.incident_report_id}` }
  }

  const requestId = data.leave_request_id
  if (!requestId) {
    const rawLink = notification?.link || data.path
    if (!rawLink) return null
    const normalized = String(rawLink)
      .replace(/^\/human-resources\/leave-requests(?=\?|$)/, '/human-resources/leave')
      .replace(/^\/calendar(?=\?|$)/, '/work-calendar')
      .replace(/([?&])request=/, '$1req=')
    const [path, query = ''] = normalized.split('?')
    return { path, query }
  }

  const eventName = String(notification?.event || notification?.type || '').toLowerCase()
  const explicitType = String(data.request_type || '').toLowerCase()
  const searchableText = [
    eventName,
    notification?.title,
    notification?.body,
  ].filter(Boolean).join(' ').toLowerCase()

  const isOvertime = explicitType === 'otr'
    || /(^|_)otr(_|$)/i.test(eventName)
    || searchableText.includes('overtime')
  const isReschedule = eventName === 'lrf_rescheduled'
    || eventName === 'otr_rescheduled'

  return {
    path: isOvertime ? '/human-resources/overtime' : '/human-resources/leave',
    query: `${isReschedule ? 'resubmit' : 'req'}=${requestId}${isReschedule ? '' : '&focus=approval'}`,
  }
}
