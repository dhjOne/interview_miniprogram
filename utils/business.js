import { businessApi } from '~/api/request/api_business';

const OTHER_TYPE = '其他';

const DEFAULT_COOPERATION = {
  title: '商务合作',
  desc: '欢迎品牌、机构、个人创作者就内容合作、广告投放与联合运营与我们联系',
  email: 'business@example.com',
  wechat: 'interview_biz',
  qrcodeUrl: '',
  types: ['内容合作', '广告投放', '机构合作', '校园推广', '其他']
};

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data !== undefined && res.data !== null && typeof res.data === 'object') {
    return res.data;
  }
  return res;
}

function normalizeTypes(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw.map((item) => String(item || '').trim()).filter(Boolean);
  } else if (typeof raw === 'string' && raw.trim()) {
    list = raw
      .split(/[,，;；|、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  } else {
    list = [...DEFAULT_COOPERATION.types];
  }
  if (!list.includes(OTHER_TYPE)) {
    list = [...list, OTHER_TYPE];
  }
  return list;
}

export function normalizeBusinessCooperation(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    title: source.title || DEFAULT_COOPERATION.title,
    desc: source.desc || source.description || DEFAULT_COOPERATION.desc,
    email: source.email || DEFAULT_COOPERATION.email,
    wechat: source.wechat || source.wechatId || DEFAULT_COOPERATION.wechat,
    qrcodeUrl: source.qrcodeUrl || source.qrcode || source.qrCodeUrl || '',
    types: normalizeTypes(source.types || source.typeList)
  };
}

export function getDefaultBusinessCooperation() {
  return { ...DEFAULT_COOPERATION, types: [...DEFAULT_COOPERATION.types] };
}

/** 拉取商务合作配置；失败时回落本地默认，保证页面可用 */
export async function fetchBusinessCooperation() {
  try {
    const res = await businessApi.getCooperation();
    return normalizeBusinessCooperation(pickPayload(res));
  } catch (e) {
    console.warn('[business] fetch cooperation failed', e);
    return getDefaultBusinessCooperation();
  }
}

export function validateBusinessLeadForm(form) {
  const data = form || {};
  const partnerType = String(data.partnerType || '').trim() || 'ENTERPRISE';
  const cooperationType = String(data.cooperationType || '').trim();
  const cooperationTypeCustom = String(data.cooperationTypeCustom || '').trim();
  const companyName = String(data.companyName || '').trim();
  const contactName = String(data.contactName || '').trim();
  const phone = String(data.phone || '').trim();
  const wechat = String(data.wechat || '').trim();
  const email = String(data.email || '').trim();
  const requirement = String(data.requirement || '').trim();

  if (!['ENTERPRISE', 'INDIVIDUAL'].includes(partnerType)) {
    return { ok: false, message: '请选择合作方类型' };
  }
  if (!cooperationType) return { ok: false, message: '请选择合作方向' };
  if (cooperationType === OTHER_TYPE) {
    if (!cooperationTypeCustom) return { ok: false, message: '请填写具体合作方向' };
    if (cooperationTypeCustom.length > 64) return { ok: false, message: '自定义方向过长' };
  }
  if (partnerType === 'ENTERPRISE' && !companyName) {
    return { ok: false, message: '请填写公司/机构名称' };
  }
  if (!contactName) {
    return {
      ok: false,
      message: partnerType === 'INDIVIDUAL' ? '请填写您的姓名' : '请填写联系人'
    };
  }
  if (!/^1\d{10}$/.test(phone)) return { ok: false, message: '请填写正确的手机号' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: '邮箱格式不正确' };
  }
  if (requirement.length < 10) return { ok: false, message: '需求说明至少 10 个字' };
  if (requirement.length > 500) return { ok: false, message: '需求说明请控制在 500 字内' };

  return {
    ok: true,
    payload: {
      partnerType,
      cooperationType,
      cooperationTypeCustom:
        cooperationType === OTHER_TYPE ? cooperationTypeCustom : undefined,
      companyName: companyName || undefined,
      contactName,
      phone,
      wechat: wechat || undefined,
      email: email || undefined,
      requirement
    }
  };
}

export async function submitBusinessLead(form) {
  const checked = validateBusinessLeadForm(form);
  if (!checked.ok) {
    const err = new Error(checked.message);
    err.code = 'VALIDATE';
    throw err;
  }
  await businessApi.submitLead(checked.payload);
  return checked.payload;
}

export { OTHER_TYPE };
