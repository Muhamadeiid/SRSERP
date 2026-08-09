export function notificationRequestTarget(notification) {
  if (notification?.data?.resignation_request_id) {
    return {
      path: '/human-resources/resignations',
      query: `ticket=${notification.data.resignation_request_id}`,
    }
  }

  const requestId = notification?.data?.leave_request_id
  if (!requestId) return null

  const eventName = String(notification?.event || notification?.type || '').toLowerCase()
  const explicitType = String(notification?.data?.request_type || '').toLowerCase()
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
