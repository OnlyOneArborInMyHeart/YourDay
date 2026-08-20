export interface Quote {
  text: string;
  author: string;
}

/** 名人名言与唐诗宋词精选 */
export const QUOTES: Quote[] = [
  { text: '床前明月光，疑是地上霜。举头望明月，低头思故乡。', author: '李白《静夜思》' },
  { text: '明月几时有？把酒问青天。', author: '苏轼《水调歌头》' },
  { text: '人生自古谁无死？留取丹心照汗青。', author: '文天祥《过零丁洋》' },
  { text: '会当凌绝顶，一览众山小。', author: '杜甫《望岳》' },
  { text: '长风破浪会有时，直挂云帆济沧海。', author: '李白《行路难》' },
  { text: '先天下之忧而忧，后天下之乐而乐。', author: '范仲淹《岳阳楼记》' },
  { text: '但愿人长久，千里共婵娟。', author: '苏轼《水调歌头》' },
  { text: '大漠孤烟直，长河落日圆。', author: '王维《使至塞上》' },
  { text: '两岸猿声啼不住，轻舟已过万重山。', author: '李白《早发白帝城》' },
  { text: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。', author: '孟浩然《春晓》' },
  { text: '千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。', author: '柳宗元《江雪》' },
  { text: '海内存知己，天涯若比邻。', author: '王勃《送杜少府之任蜀州》' },
  { text: '落霞与孤鹜齐飞，秋水共长天一色。', author: '王勃《滕王阁序》' },
  { text: '欲穷千里目，更上一层楼。', author: '王之涣《登鹳雀楼》' },
  { text: '随风潜入夜，润物细无声。', author: '杜甫《春夜喜雨》' },
  { text: '采菊东篱下，悠然见南山。', author: '陶渊明《饮酒·其五》' },
  { text: '山重水复疑无路，柳暗花明又一村。', author: '陆游《游山西村》' },
  { text: '人生得意须尽欢，莫使金樽空对月。', author: '李白《将进酒》' },
  { text: '天生我材必有用，千金散尽还复来。', author: '李白《将进酒》' },
  { text: '苟利国家生死以，岂因祸福避趋之？', author: '林则徐' },
  { text: '为中华之崛起而读书。', author: '周恩来' },
  { text: '横眉冷对千夫指，俯首甘为孺子牛。', author: '鲁迅' },
  { text: '我辈岂是蓬蒿人，仰天大笑出门去。', author: '李白' },
  { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游《冬夜读书示子聿》' },
  { text: '问渠那得清如许？为有源头活水来。', author: '朱熹《观书有感》' },
  { text: '少年强则国强，少年智则国智。', author: '梁启超《少年中国说》' },
  { text: '亦余心之所善兮，虽九死其犹未悔。', author: '屈原《离骚》' },
  { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原《离骚》' },
  { text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子《劝学》' },
  { text: '天行健，君子以自强不息。', author: '《周易》' },
  { text: '地势坤，君子以厚德载物。', author: '《周易》' },
];

/** 根据日期获取当天的名言（每天固定，不随刷新变化） */
export function getDailyQuote(): Quote {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return QUOTES[seed % QUOTES.length];
}
