export function poApprovalCycle(po) {
  const history = po.approvals ?? []
  const rejected = history.filter(row => row.action === 'reject')
  const hasRejection = po.approval_status === 'rejected' || rejected.length > 0
  const validId = row => /^\d+$/.test(String(row.id ?? ''))
  let approvals = history
  if (hasRejection) {
    // IDs preserve decision order even when several decisions share a timestamp.
    const boundary = rejected.every(validId) && rejected.length
      ? rejected.reduce((max, row) => BigInt(row.id) > max ? BigInt(row.id) : max, 0n)
      : null
    approvals = po.approval_status === 'rejected' || boundary === null
      ? []
      : history.filter(row => validId(row) && BigInt(row.id) > boundary)
  }
  return {
    hasRejection,
    isDraft: hasRejection && po.approval_status !== 'approved',
    approval: stage => approvals.find(row => row.stage === stage && row.action === 'approve'),
  }
}
