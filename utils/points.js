import { pointsApi } from '~/api/index';
import { AppEvents } from '~/utils/eventBus';

/** 与后端 PointBizTypeEnum 对齐 */
export const POINT_BIZ_TYPE_LABELS = {
  QUESTION_PUBLISH: '题目过审发布',
  QUESTION_UPDATE: '题目高质量更新',
  LIKE_RECEIVED: '收到点赞',
  COLLECT_RECEIVED: '收到收藏',
  COMMENT_LIKE_RECEIVED: '评论被赞',
  FEATURED_QUESTION: '精选题目',
  REPORT_FIX_ACCEPTED: '纠错被采纳',
  INVITE_CREATOR: '邀请创作者首题过审',
  SELF_QUIZ_COMPLETE: '完成自建题自测',
  AI_CITE_MILESTONE: 'AI检索引用达标',
  REDEEM: '积分兑换',
  ADMIN_ADJUST: '运营调账',
  REVOKE: '积分追回',
};

const LEDGER_STATUS_LABELS = {
  0: '待结算',
  1: '已到账',
  2: '已追回',
  3: '已过期',
};

const REDEEM_ORDER_STATUS_LABELS = {
  0: '处理中',
  1: '已发放',
  2: '失败',
  3: '已退款',
};

const APPEAL_STATUS_LABELS = {
  0: '待审核',
  1: '已通过',
  2: '已驳回',
};

const AI_QUOTA_LABELS = {
  AI_QA: 'AI 问答额外次数',
  AI_INTERVIEW: 'AI 模拟面试额外次数',
};

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data !== undefined && res.data !== null) return res.data;
  return res;
}

function pickRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return payload.rows || payload.list || payload.records || [];
}

function pickList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return pickRows(payload);
}

function pickTotal(payload, listLen) {
  if (!payload || typeof payload !== 'object') return listLen;
  const t = payload.total ?? payload.count;
  return typeof t === 'number' ? t : listLen;
}

export function formatPointCount(n) {
  const num = Number(n) || 0;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return `${num}`;
}

export function formatLedgerTime(value) {
  if (value === undefined || value === null || value === '') return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (m) {
    const mo = `${m[2]}`.padStart(2, '0');
    const d = `${m[3]}`.padStart(2, '0');
    if (m[4] != null) {
      const h = `${m[4]}`.padStart(2, '0');
      const min = `${m[5] || '0'}`.padStart(2, '0');
      return `${m[1]}-${mo}-${d} ${h}:${min}`;
    }
    return `${m[1]}-${mo}-${d}`;
  }
  const ts = typeof value === 'number' ? value : Date.parse(s.replace(/-/g, '/'));
  if (Number.isNaN(ts)) return s.slice(0, 16);
  const dt = new Date(ts);
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(
    dt.getHours(),
  )}:${pad(dt.getMinutes())}`;
}

export function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      availablePoints: 0,
      pendingPoints: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      reputationLevel: 0,
    };
  }
  return {
    availablePoints: Number(raw.availablePoints ?? raw.available_points ?? 0) || 0,
    pendingPoints: Number(raw.pendingPoints ?? raw.pending_points ?? 0) || 0,
    lifetimeEarned: Number(raw.lifetimeEarned ?? raw.lifetime_earned ?? 0) || 0,
    lifetimeSpent: Number(raw.lifetimeSpent ?? raw.lifetime_spent ?? 0) || 0,
    reputationLevel: Number(raw.reputationLevel ?? raw.reputation_level ?? 0) || 0,
  };
}

export function normalizeLedgerRow(row, index) {
  const direction = Number(row.direction ?? 0);
  const amount = Math.abs(Number(row.amount ?? 0) || 0);
  const bizType = row.bizType ?? row.biz_type ?? '';
  const status = Number(row.status ?? 1);
  let amountPrefix = '+';
  let amountClass = 'earn';
  if (direction === -1) {
    amountPrefix = '-';
    amountClass = 'spend';
  } else if (direction === 0 && Number(row.amount) < 0) {
    amountPrefix = '-';
    amountClass = 'spend';
  } else if (direction === 0 && Number(row.amount) > 0) {
    amountPrefix = '+';
    amountClass = 'earn';
  }

  const ledgerId = row.id ?? row.ledgerId ?? row.ledger_id;
  const id = ledgerId ?? `ledger-${index}`;
  return {
    ...row,
    ledgerId: ledgerId != null ? String(ledgerId) : '',
    id: String(id),
    bizType,
    bizLabel: POINT_BIZ_TYPE_LABELS[bizType] || bizType || '积分变动',
    amount,
    amountText: `${amountPrefix}${amount}`,
    amountClass,
    status,
    statusLabel: LEDGER_STATUS_LABELS[status] || '未知',
    statusTheme: status === 1 ? 'success' : status === 0 ? 'warning' : 'default',
    canAppeal: status === 2,
    timeText: formatLedgerTime(row.createdAt ?? row.created_at),
    settleText: formatLedgerTime(row.settleAt ?? row.settle_at),
  };
}

export function normalizeRuleRow(row) {
  const ruleCode = row.ruleCode ?? row.rule_code ?? '';
  return {
    ...row,
    ruleCode,
    ruleName: row.ruleName ?? row.rule_name ?? POINT_BIZ_TYPE_LABELS[ruleCode] ?? ruleCode,
    basePoints: Number(row.basePoints ?? row.base_points ?? 0) || 0,
    dailyCap: row.dailyCap ?? row.daily_cap,
    weeklyCap: row.weeklyCap ?? row.weekly_cap,
    monthlyCap: row.monthlyCap ?? row.monthly_cap,
    cooldownHours: Number(row.cooldownHours ?? row.cooldown_hours ?? 0) || 0,
  };
}

export function normalizeRedeemItem(row) {
  const itemCode = row.itemCode ?? row.item_code ?? '';
  return {
    ...row,
    id: String(row.id ?? itemCode),
    itemCode,
    itemName: row.itemName ?? row.item_name ?? itemCode,
    costPoints: Number(row.costPoints ?? row.cost_points ?? 0) || 0,
    stock: row.stock,
    itemType: row.itemType ?? row.item_type ?? '',
    dailyLimitPerUser: row.dailyLimitPerUser ?? row.daily_limit_per_user,
    totalLimitPerUser: row.totalLimitPerUser ?? row.total_limit_per_user,
  };
}

export function normalizeRedeemOrder(row, index) {
  const status = Number(row.status ?? 0);
  return {
    ...row,
    id: String(row.orderNo ?? row.order_no ?? `order-${index}`),
    orderNo: row.orderNo ?? row.order_no ?? '',
    itemName: row.itemName ?? row.item_name ?? row.itemCode ?? row.item_code ?? '兑换商品',
    costPoints: Number(row.costPoints ?? row.cost_points ?? 0) || 0,
    status,
    statusLabel: REDEEM_ORDER_STATUS_LABELS[status] || '未知',
    statusTheme:
      status === 1 ? 'success' : status === 3 ? 'warning' : status === 2 ? 'danger' : 'primary',
    timeText: formatLedgerTime(row.createdAt ?? row.created_at),
  };
}

export function normalizeAppealRow(row, index) {
  const status = Number(row.status ?? 0);
  return {
    ...row,
    id: String(row.id ?? `appeal-${index}`),
    ledgerId: String(row.ledgerId ?? row.ledger_id ?? ''),
    reason: row.reason ?? '',
    adminRemark: row.adminRemark ?? row.admin_remark ?? '',
    status,
    statusLabel: APPEAL_STATUS_LABELS[status] || '未知',
    statusTheme: status === 1 ? 'success' : status === 2 ? 'danger' : 'warning',
    timeText: formatLedgerTime(row.createdAt ?? row.created_at),
    resolvedText: formatLedgerTime(row.resolvedAt ?? row.resolved_at),
  };
}

export function normalizeAiQuotaRow(row) {
  const quotaType = row.quotaType ?? row.quota_type ?? '';
  return {
    ...row,
    quotaType,
    label: AI_QUOTA_LABELS[quotaType] || quotaType,
    remaining: Number(row.remaining ?? 0) || 0,
  };
}

/** 通知「我的」页等刷新积分展示 */
export function notifyPointsChanged() {
  try {
    const app = getApp();
    if (app && app.eventBus && typeof app.eventBus.emit === 'function') {
      app.eventBus.emit(AppEvents.POINTS_CHANGED);
    }
  } catch (e) {
    // ignore
  }
}

export async function fetchPointAccount() {
  const res = await pointsApi.getAccount();
  return normalizeAccount(pickPayload(res));
}

export async function fetchPointLedger(page = 1, pageSize = 20) {
  const res = await pointsApi.getLedger({ page, size: pageSize });
  const payload = pickPayload(res) || {};
  const raw = pickRows(payload);
  const total = pickTotal(payload, raw.length);
  const startIdx = (page - 1) * pageSize;
  const list = raw.map((r, i) => normalizeLedgerRow(r, startIdx + i));
  return { list, total, page };
}

export async function fetchPointRules() {
  const res = await pointsApi.getRules();
  const payload = pickPayload(res);
  const raw = pickList(payload);
  return raw.map(normalizeRuleRow);
}

export async function fetchRedeemItems() {
  const res = await pointsApi.getRedeemItems();
  const payload = pickPayload(res);
  return pickList(payload).map(normalizeRedeemItem);
}

export async function redeemPointItem(itemCode) {
  const idempotencyKey = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const res = await pointsApi.redeem({
    toRequestData: () => ({ itemCode, idempotencyKey }),
  });
  notifyPointsChanged();
  return normalizeRedeemOrder(pickPayload(res) || {}, 0);
}

export async function fetchRedeemOrders() {
  const res = await pointsApi.getRedeemOrders();
  const payload = pickPayload(res);
  return pickList(payload).map((r, i) => normalizeRedeemOrder(r, i));
}

export async function fetchAiQuota() {
  const res = await pointsApi.getAiQuota();
  const payload = pickPayload(res);
  return pickList(payload).map(normalizeAiQuotaRow);
}

export async function submitPointAppeal(ledgerId, reason) {
  const res = await pointsApi.submitAppeal({
    toRequestData: () => ({ ledgerId: Number(ledgerId), reason }),
  });
  return normalizeAppealRow(pickPayload(res) || {}, 0);
}

export async function fetchPointAppeals(page = 1, pageSize = 20) {
  const res = await pointsApi.getAppeals({ page, size: pageSize });
  const payload = pickPayload(res) || {};
  const raw = pickRows(payload);
  const total = pickTotal(payload, raw.length);
  const startIdx = (page - 1) * pageSize;
  const list = raw.map((r, i) => normalizeAppealRow(r, startIdx + i));
  return { list, total, page };
}

export async function fetchMyInviteCode() {
  const res = await pointsApi.getInviteCode();
  const payload = pickPayload(res);
  if (typeof payload === 'string') return payload;
  return payload?.inviteCode ?? payload?.code ?? '';
}

export async function bindInviteCode(inviteCode) {
  const res = await pointsApi.bindInviteCode({
    toRequestData: () => ({ inviteCode: String(inviteCode || '').trim() }),
  });
  return pickPayload(res);
}

export async function completeSelfQuiz(questionId) {
  const res = await pointsApi.completeSelfQuiz({
    toRequestData: () => ({ questionId: Number(questionId) }),
  });
  notifyPointsChanged();
  return pickPayload(res);
}
