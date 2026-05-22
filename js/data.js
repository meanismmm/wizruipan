// ---------------------------------------------------------
// SYSTEM DATABASES (700 Spells, NPCs, Enemies, Items)
// ---------------------------------------------------------

const ATTRIBUTES = ["불", "번개", "바람", "중력", "물", "독", "어둠"];

const SPELL_NAMES_MASTER = {
    "불": ["불꽃씨앗", "화염구", "작열의손", "폭렬산", "용암해일", "홍련의춤", "항성폭발", "피닉스", "겁화", "태초의불꽃"],
    "번개": ["정전기", "뇌격", "낙뢰", "번개사슬", "뇌신", "방전파", "플라즈마", "심판", "천벌", "전자기의종말"],
    "바람": ["산들바람", "돌풍", "진공파", "회오리", "사이클론", "태풍의눈", "대기압착", "차원참", "무풍지대", "절대영도폭풍"],
    "중력": ["척력", "인력", "중력구", "대지압박", "궤도조작", "뒤틀림", "사건의지평선", "특이점", "블랙홀", "우주의공백"],
    "물": ["물방울", "빙결", "해일", "수룡", "빙벽", "심해", "절대영도", "망각의강", "생명근원", "망령의바다"],
    "독": ["산성분사", "마비독", "부식안개", "맹독늪", "신경독", "역병", "영혼부식", "균사지옥", "사멸의종소리", "정적의독"],
    "어둠": ["그림자", "공포환영", "악몽", "심연의손", "장막", "갈구", "파멸", "황혼의빛", "영원한밤", "허무의정점"]
};

// Generate exactly 700 spells
const SPELLS_DB = {};
ATTRIBUTES.forEach(a => {
    SPELLS_DB[a] = {};
    for(let c=1; c<=10; c++) {
        SPELLS_DB[a][c] = [];
        for(let i=1; i<=10; i++) {
            SPELLS_DB[a][c].push({ 
                name: `${c}서클 [${SPELL_NAMES_MASTER[a][c-1]}] 제${i}장`, 
                attr: a, circle: c, power: (c*35)+(i*5), manaCost: (c*6)+i 
            });
        }
    }
});

const RARITIES = {
    "일반": { opts: 0, color: "#333", chance: 0.6 },
    "매직": { opts: 1, color: "var(--rarity-magic)", chance: 0.25 },
    "유니크": { opts: 2, color: "var(--rarity-unique)", chance: 0.12 },
    "신화": { opts: 3, color: "var(--rarity-mythic)", chance: 0.03 }
};

const STATUS_INFO = {
    "피로": { desc: "기력 소모 1.5배", effect: p => p.staminaMod = 1.5 },
    "마나중독": { desc: "매 턴 마나 -3", effect: p => p.manaRegenMod = -3 }
};

const NPCS = [
    { name: "궁정마법사", intro: "자네의 눈에 갈망이 서려 있군.", diag: "마법은 머리가 아닌 영혼으로 하는 것이라네.", type: "exp" },
    { name: "연금술사", intro: "허허, 길 위에서 귀한 인연을 만났소.", diag: "젊은 마법사에겐 투자가 필요하지.", type: "item" },
    { name: "광대", intro: "히히히! 오늘은 운이 좋으니 이걸 줄게!", diag: "이건 내 선물이야!", type: "gold" }
];

const ENEMIES = [
    { name: "그림자 늑대", intro: "크르르...!", atk: "날카로운 발톱이 공기를 가릅니다.", exp: 50, hp: 100, pwr: 8 },
    { name: "타락한 마법병", intro: "죽음을 각오해라!", atk: "오염된 마력을 쏩니다.", exp: 100, hp: 200, pwr: 12 },
    { name: "심연의 가고일", intro: "영혼을 내놔라.", atk: "바위 주먹이 날아옵니다.", exp: 200, hp: 350, pwr: 18 }
];

// Provide variables globally
window.GAME_DATA = {
    ATTRIBUTES, SPELLS_DB, RARITIES, STATUS_INFO, NPCS, ENEMIES
};
