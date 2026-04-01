const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// 確保路徑與 server.js 一致 (MBP path)
const dbPath = path.join(process.env.HOME, 'db/buddhist-footprints/buddhist.db');
const db = new DatabaseSync(dbPath);

const pool = [
  { s:'《金剛般若波羅蜜經》第十品', se:'The Diamond Prajñāpāramitā Sūtra · Chapter 10', te:'Abide nowhere, and thus give rise to the mind.', re:'All attachments are fetters. To observe without clinging is true freedom. Today, try facing all situations with a mind that "abides nowhere"—letting all things arise without being bound by them.' },
  { s:'《般若波羅蜜多心經》', se:'The Heart of the Prajñāpāramitā Sūtra', te:'Form is not other than emptiness; emptiness is not other than form. Form is emptiness; emptiness is form.', re:'All phenomena are transient and ever-changing, yet emptiness is not nothingness—it is the field of infinite possibility. Seeing emptiness allows us to remain unclouded by appearances or temporary gains and losses.' },
  { s:'《六祖壇經》行由品第一', se:'The Platform Sutra of the Sixth Patriarch · Chapter 1', te:'Originally there is not a single thing; where could any dust alight?', re:'Master Huineng attained enlightenment through this verse. A pure mind is not about continuous cleaning, but about realizing that our fundamental nature was never defiled to begin with.' },
  { s:'《維摩詰所說經》佛國品第一', se:'The Vimalakīrti Nirdeśa Sūtra · Chapter 1', te:'If a Bodhisattva wishes to attain the Pure Land, they should first purify their mind. As the mind is purified, the Buddha-land is purified.', re:'The purity of our environment stems from the purity of our inner state. The world we see is often a projection of our mind. Today, ask yourself: is my mind clear or clouded in this moment?' },
  { s:'《臨濟錄》示眾', se:'The Record of Linji · Sermons', te:'At all times and in all places, be the master; then wherever you stand is the truth.', re:'Regardless of your circumstances, if you can remain master of yourself, every place becomes a place of practice. Every present moment today is an opportunity for cultivation.' },
  { s:'《妙法蓮華經》方便品第二', se:'The Lotus Sūtra · Chapter 2: Expedient Means', te:'All phenomena, from their very origin, are constantly characterized by the mark of quiet extinction.', re:'Beneath the surface of change and noise, all things are inherently at peace. Today, try to find that stillness amidst the bustle—it has always been there, never leaving.' },
  { s:'《趙州錄》公案', se:'The Record of Zhao Zhou · Gōng\'àn', te:'Go drink some tea.', re:'Zhao Zhou guided many students with these four words. The "ordinary mind" is the Way; the simple act of drinking tea contains the entirety of practice.' },
  { s:'《大佛頂首楞嚴經》卷一', se:'The Śūraṅgama Sūtra · Volume 1', te:'All drifting dust and illusory appearances arise where they are and vanish right there.', re:'Every phenomenon is like a phantom—appearing and disappearing within the same space of awareness. Understanding this, one is neither elated by temporary peaks nor despaired by troughs.' },
  { s:'黃檗希運禪師《傳心法要》', se:'Zen Master Huangbo Xiyun: Essentials of Transmitting the Mind', te:'Non-mind is the Way.', re:'"Non-mind" is not numbness, but a state free from discriminatory attachment. Only by observing the world with a mind free of fabrications can we see the true face of reality.' },
  { s:'《六祖壇經》般若品第二', se:'The Platform Sutra of the Sixth Patriarch · Chapter 2: Prajna', te:'The nature of Bodhi is originally pure; simply use this mind to directly attain Buddhahood.', re:'Pure wisdom is our inherent nature, not something to be sought externally. Today, trust the natural clarity that resides within you.' },
  { s:'《阿彌陀經》（姚秦鳩摩羅什譯）', se:'The Amitābha Sūtra (Translated by Kumārajīva)', te:'One cannot be born in that land with few good roots, blessings, virtues, and causal conditions.', re:'The law of cause and effect is the fundamental language of the universe. Every result is a convergence of many conditions; it is not achieved by a single effort at a single moment.' },
  { s:'《永嘉證道歌》玄覺禪師', se:'Song of Enlightenment by Chan Master Yongjia Xuanjue', te:'In a dream, the six realms are clearly seen; after awakening, the great universe is empty.', re:'The joys and sorrows of a dream are empty upon waking. Yet, while in the dream, one must still live earnestly. The emptiness after awakening is a "Great Emptiness" that encompasses everything.' },
  { s:'《普賢行願品》', se:'The Vows of Samantabhadra', te:'When the realm of space is exhausted, my vows will be exhausted; but because the realm of space is inexhaustible, my great vows have no end.', re:'The ten great vows of Samantabhadra are as vast as infinite space. With such a great resolve, our actions find a support that transcends personal gain or loss.' },
  { s:'雲門文偃禪師語錄', se:'The Record of Zen Master Yunmen Wenyan', te:'It covers heaven and earth; it cuts off all flows; it follows the waves and surges with the tide.', re:'Yunmen\'s three phrases: embrace all with a holistic view; decisively cut off discriminatory thoughts; and flexibly follow the flow of conditions. Combined, they are harmonious and unobstructed.' },
  { s:'《圓覺經》', se:'The Sūtra of Perfect Enlightenment', te:'Recognizing illusion, one is instantly free, without needing expedient means; free from illusion, one is enlightened, without gradual stages.', re:'To recognize the illusory is to be free of it; enlightenment is found in the very moment of recognition. Today, try to recognize one illusion you have long believed in.' },
  { s:'洞山良价禪師《寶鏡三昧》', se:'Song of the Precious Mirror Samādhi by Chan Master Dongshan Liangjie', te:'This teaching has been transmitted in secret by all Buddhas and patriarchs. Now that you have received it, guard it well.', re:'The phrase "guard it well" means that after receiving insight, one must carefully protect it in daily life, ensuring it is not washed away by worldly currents.' }
];

const upsert = db.prepare(`
  INSERT INTO dharma_en (source, source_en, text_en, reflection_en)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(source) DO UPDATE SET
    source_en = excluded.source_en,
    text_en = excluded.text_en,
    reflection_en = excluded.reflection_en
`);

let count = 0;
pool.forEach(row => {
  upsert.run(row.s, row.se, row.te, row.re);
  count++;
});

console.log(`Successfully updated ${count} high-quality translations in MBP production DB.`);
