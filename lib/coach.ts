export type Platform = { id: string; name: string; short: string; color: string; url: string; note: string; status: string };
export type Studio = { name: string; coach: string; city: string; audience: string; offer: string };
export type Answer = { title: string; text: string };
export type Source = { title: string; url: string };
export type Result = { answers: Answer[]; sources: Source[]; mode: string; question: string; platformIds: string[] };
export const platforms: Platform[] = [
  { id: 'red', name: '小红书', short: '红', color: '#e95161', url: 'https://www.xiaohongshu.com/hina/basic-criterion', note: '留意真人出镜、真实分享及商业推广场景；具体要求请在直播后台核对。', status: '已定位规范入口，全文待核对' },
  { id: 'douyin', name: '抖音', short: '抖', color: '#282c32', url: 'https://sf3-cdn-tos.douyinstatic.com/obj/ies-hotsoon-draft/webcast_all_anchor/webcast_ban_protocol.html', note: '留意直播行为、营销表述及账号类目权限；具体要求请在直播后台核对。', status: '已定位规范入口，全文待核对' },
  { id: 'wechat', name: '视频号', short: '视', color: '#dc9133', url: 'https://weixin.qq.com/cgi-bin/readtemplate?t=finder_live_up_privacy', note: '留意服装镜头、健康科普准入及引流场景；具体要求请在直播后台核对。', status: '已定位规范入口，全文待核对' },
];
export const emptyStudio: Studio = { name: '', coach: '', city: '', audience: '刚开始健身的成年人', offer: '' };
export const topics = ['新手第一次到店', '一周练几次', '认识工作室', '训练前先沟通', '体验课介绍', '温柔收尾'];
export const quickQuestions = ['新手一周练几次？', '第一次去工作室会不会尴尬？', '你们的体验课怎么安排？', '膝盖疼还能练吗？'];
export const checkItems = ['镜头与视线接近，动作能完整入镜', '衣着得体，运动时无走光风险', '光线和收音清楚，背景不暴露客户隐私', '价格、资质和优惠已核实', '已核对所选平台的直播类目和当前规则'];
export const reminders = ['看一眼镜头，像和一位朋友聊天。', '一句话说完，停一停，给观众回应的时间。', '放松肩膀，语速慢一点，不用急着填满每一秒。', '需要时喝口水，回来再接着聊。', '演示动作前，确认完整入镜，别让观众勉强跟练。'];
export function safeUrl(value: string) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }
export function medicalQuestion(text: string) { return /疼|痛|受伤|康复|术后|孕|产后|疾病|高血压|糖尿病|心脏|胸闷|眩晕|晕倒|呼吸困难|药|诊断/.test(text); }
export function offlineAnswer(question: string, studio: Studio): Result {
  let texts: string[];
  let sources: Source[] = [];
  if (medicalQuestion(question)) texts = [
    '这个问题涉及身体不适，单靠直播里的一句话，我没法判断原因，也不能直接给你安排动作。先不要勉强跟练，请让有资质的医疗专业人员评估。',
    '训练建议需要了解完整情况。直播不能完成检查，也不能代替诊断或康复评估。我们不在这里判断病因，不建议你靠忍痛训练来试效果。',
    '谢谢你的信任。身体不适的问题不要急着照着别人练，也不需要在公开评论区发病历或其他隐私。先把专业评估做好，我们再讨论适合你的训练服务。',
  ];
  else if (/几次|频率|几天/.test(question)) {
    texts = ['不用一上来就要求自己天天练。先从能坚持的安排开始，再结合自己的基础和恢复情况调整。', '一般成年人活动指南包含每周至少两天的肌肉强化活动，但这不等于每个人都适合直接照搬同一张课表。新手还需要结合实际能力循序渐进。', '咱们先不急着定次数。你现在是刚开始，还是已经有运动习惯？一周通常能留出几段不赶时间的空闲？'];
    sources = [{ title: 'WHO · 身体活动指南（内置参考，非本次联网）', url: 'https://www.who.int/europe/news-room/fact-sheets/item/physical-activity' }];
  } else if (/价格|多少钱|体验|课程|怎么安排/.test(question)) texts = studio.offer ? [`关于课程，我先把已经确认的信息说清楚：${studio.offer}`, `目前确认的课程信息是：${studio.offer}。其他费用、时间和服务范围，以实际确认的信息为准，不给你口头加码承诺。`, '你更想先了解课程内容、时间安排，还是服务范围？我按你的问题一项一项说明，不着急做决定。'] : ['课程信息我先核对清楚再告诉你，不在直播里临时编价格或优惠。', '选择课程可以先了解服务内容、时间安排、费用和适用条件。我们会把实际信息说明白，再由你判断是否合适。', '你现在更想了解课程内容还是时间安排？我先记下问题，把准确的信息核对好再回复。'];
  else if (/尴尬|第一次|不敢|新手/.test(question)) texts = ['第一次来不熟悉环境很正常，不需要先练得很好才来了解。你可以先说说自己的目标和顾虑，我们从你关心的地方聊。', '初次沟通不应该是一场体能考试。先把目标、过往运动经历、时间安排和服务边界说清楚，比马上追求大重量更重要。', '如果你第一次来，最担心哪件事：不知道器械怎么用、怕跟不上，还是不知道怎么选课？可以挑一个说说。'];
  else texts = ['这个问题我想先确认一下具体情境，避免给你一个听起来很肯定、实际不适合你的答案。', '这类问题需要更多信息。我先记下来，核对可靠资料后再解释，不在直播里把不确定的内容说成结论。', '你最想弄清楚的是哪一部分？我们可以把问题拆小一点，一次聊清一件事。'];
  return { answers: texts.map((text, i) => ({ title: ['简短接话', '展开解释', '互动追问'][i], text })), sources, mode: '内置话术 · 非 AI 联网回答', question, platformIds: [] };
}
export function warmup(topic: string, studio: Studio, long: boolean, variant: number): string {
  const hello = variant % 2 ? '刚进来的朋友，欢迎你。我们慢慢聊，不用有压力。' : '欢迎来到直播间。今天不着急聊成绩，先聊聊怎么开始。';
  const blocks: Record<string, string> = {
    '新手第一次到店': '第一次接触健身工作室，大家常常不是不想练，而是不知道从哪里开始。你不需要先练得很好才来了解，也不用急着证明自己。先想一想，你最希望运动给生活带来什么变化？',
    '一周练几次': '一周练几次，是新朋友经常问的问题。先别着急抄别人的安排，想想自己能留出多少时间、现在是什么基础。能持续执行、能根据实际情况调整，比把日程填得满满的更重要。',
    '认识工作室': studio.name ? `这里是${studio.name}${studio.city ? `，在${studio.city}` : ''}。${studio.coach ? `我是${studio.coach}。` : ''}今天想用直播让大家先了解我们，也让你有机会把关心的问题问清楚。` : '今天我们先用直播聊聊，选择一家工作室时，你最想了解什么？环境、课程安排，还是沟通方式？你可以先了解，再决定，不需要着急。',
    '训练前先沟通': '开始之前，先把目标、运动经历和实际时间聊清楚。有什么顾虑也可以说出来，涉及个人健康隐私的内容不用发在评论区。身体不适的情况应先做专业评估，而不是硬跟一套动作。',
    '体验课介绍': studio.offer ? `关于课程，先把已经确认的信息告诉大家：${studio.offer}。如果有哪一点不清楚，可以提出来，我一项一项说明。` : '如果你正在了解体验课，先问清课程内容、时间安排、费用以及服务范围。具体课程信息我会核对清楚再介绍，不临时许诺优惠或训练效果。',
    '温柔收尾': '今天先聊到这里，谢谢你愿意停下来听一会儿。希望你带走的不是焦虑，而是一个更清楚的问题、一个更适合自己的开始。没来得及回答的问题，我会核实后再聊。',
  };
  return `${hello}\n\n${blocks[topic] ?? blocks['新手第一次到店']}${long ? '\n\n你是刚开始了解健身，还是已经有自己的运动习惯？有想问的可以留在评论区。如果暂时没问题也没关系，先听一听，按照自己的节奏来。\n\n每个人的起点不同，我们不靠比较身材给自己压力。讲到不确定的地方，我会先核对，不为了接话就随口给出结论。' : ''}`;
}
export type Risk = { phrase: string; reason: string; suggestion: string };
export function scanRisk(text: string, customWords: string[] = []): Risk[] {
  const rules = [
    { pattern: /保证瘦|包瘦|必瘦|百分百|100%|永不反弹|七天瘦\S{0,4}|一周瘦\S{0,4}/g, reason: '效果保证或过度确定的表述', suggestion: '不要承诺固定减重结果，改为说明实际服务与个体差异。' },
    { pattern: /治愈|根治|包治|治疗\S{0,5}|替代药物/g, reason: '可能涉及诊疗或医疗效果承诺', suggestion: '不要作诊疗承诺；涉及病症时建议专业评估。' },
    { pattern: /全网最低|全市第一|最有效|国家级教练|绝对安全/g, reason: '绝对化或需要证据的资质、比较表述', suggestion: '改用可以核实的具体信息；未核实的排名与头衔不说。' },
    { pattern: /加我微信|加微|私下转账|扫码付款/g, reason: '引流或交易方式需要核对平台规则', suggestion: '仅使用账号当前获准的平台内咨询或交易功能。' },
    { pattern: /胖子|死胖子|身材太差|懒才胖/g, reason: '可能使观众感到身体羞辱', suggestion: '尊重个体差异，围绕目标和习惯沟通。' },
  ];
  const results: Risk[] = [];
  for (const rule of rules) for (const phrase of new Set(text.match(rule.pattern) ?? [])) results.push({ phrase, reason: rule.reason, suggestion: rule.suggestion });
  for (const word of new Set(customWords.filter(Boolean))) if (text.includes(word)) results.push({ phrase: word, reason: '命中自定义关注词（非官方禁词认定）', suggestion: '核对上下文与官方原文，再决定是否修改。' });
  return results;
}
