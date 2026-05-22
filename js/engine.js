// ============================================================
// 마법사 키우기 v4.1 - 엔진
// ============================================================

let player = {
    day: 1, stamina: 100, maxStamina: 100,
    hp: 60, maxHp: 60, mana: 30, maxMana: 30,
    level: 1, exp: 0, maxExp: 100,
    circle: 0, attribute: null,
    researchPoints: 10, gold: 200,
    learnedSpells: [],
    inventory: [],
    equipped: { "무기": null, "방어구": null },
    location: "Home", currentTab: 'spells', inCombat: false,
    edmond: { events: [], sacrificed: false },
    clearedStages: [],
    currentStage: null,
    townExploreCount: 0,
    dailyQuests: [],
    questsDay: -1,
    questProgress: { kill: 0, research: 0, explore: 0, spell: 0, dungeon: 0, earn_gold: 0, npc: 0 },
    synthesizedSpells: [],
    karma: 0
};

// 속성별 상태이상 정의 (dc = d20 성공 기준값. roll >= dc → 성공)
const STATUS_MAP = {
    "불":   { id: "burn",   name: "화상",  dc: 14, turns: 3, tick: 8 },
    "번개": { id: "stun",   name: "감전",  dc: 16, turns: 2, atkMult: 0.65 },
    "물":   { id: "freeze", name: "빙결",  dc: 17, turns: 2, skipDC: 14 },
    "독":   { id: "poison", name: "맹독",  dc: 12, turns: 4, tick: 6 },
    "어둠": { id: "fear",   name: "공포",  dc: 17, turns: 2, atkMult: 0.60 },
    "바람": { id: "bleed",  name: "출혈",  dc: 15, turns: 3, tick: 6 },
    "중력": { id: "crush",  name: "압쇄",  dc: 16, turns: 2, defMult: 0.50 },
};

// ---- 유틸리티 ----

function safeExec(fn, ...args) {
    try { if (fn) fn(...args); }
    catch (e) { console.error(e); addLog("에러", "오류 발생: " + e.message, "log-err"); }
}

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// d20 주사위: 1=대실패, 20=대성공, roll>=dc → 성공
function d20() { return rng(1, 20); }
function d20Check(dc) {
    const roll = d20();
    return { roll, success: roll >= dc, crit: roll === 20, fumble: roll === 1 };
}

function addLog(title, text, type = '') {
    const win = document.getElementById('log-area');
    if (!win) return;
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerHTML = `<span class="log-name">${title}</span>${text}`;
    win.appendChild(div);
    win.scrollTop = win.scrollHeight;
}

function useStamina(amt) {
    if (player.stamina < amt) { addLog("경고", "기력(ST)이 부족합니다."); return false; }
    player.stamina -= amt;
    return true;
}

function getEquippedWeapon() { return player.equipped["무기"]; }
function getEquippedArmor()  { return player.equipped["방어구"]; }
function getAtkBonus() { const w = getEquippedWeapon(); return w ? (w.atkBonus || 0) : 0; }
function getDefBonus() { const a = getEquippedArmor();  return a ? (a.defBonus || 0) : 0; }

function addBtn(panel, label, fn, style = '') {
    const b = document.createElement('button');
    b.className = 'excel-btn';
    b.innerHTML = label;
    if (style) b.style.cssText = style;
    b.onclick = () => safeExec(fn);
    panel.appendChild(b);
    return b;
}

function checkLevelUp() {
    while (player.exp >= player.maxExp) {
        player.exp -= player.maxExp;
        player.level++;
        player.maxExp = Math.floor(player.maxExp * 1.5);
        player.maxHp += 10; player.hp = Math.min(player.hp + 10, player.maxHp);
        player.maxStamina += 5;
        player.maxMana += 5;
        addLog("레벨 업!", `Lv.${player.level} 달성! 최대 HP+10, ST+5, MP+5`, "log-attain");
    }
    updateUI();
}

function getLearnedCountInCircle(attr, circle) {
    return player.learnedSpells.filter(s => s.attr === attr && s.circle === circle).length;
}

// ---- 초기화 ----

window.onload = () => {
    if (localStorage.getItem('mage_save_v4')) document.getElementById('load-btn').style.display = 'block';
    switchTab('spells');
};

function startGame() {
    document.getElementById('start-overlay').style.display = 'none';
    addLog("프롤로그", "흑마법의 불길이 대륙을 뒤덮은 날, 당신은 스승 에드먼드에게 구조되었습니다.", "log-attain");
    addLog("에드먼드", "'살아남았구나. 이제 어떤 마력을 선택해 운명을 개척하겠느냐?'", "log-attain");
    generateDailyQuests();
    renderScene("Home");
}

// ---- 씬 렌더링 ----

function renderScene(key) {
    player.location = key;
    const panel = document.getElementById('action-grid');
    if (!panel) return;
    panel.innerHTML = '';
    if (key !== "NPC" && key !== "Dungeon" && key !== "DungeonStage") {
        addLog("이동", `[${key}] 에 도착했습니다.`, "log-sys");
    }
    const scenes = {
        "Home":    buildHomeScene,
        "Lab":     buildLabScene,
        "Town":    buildTownScene,
        "Dungeon": buildDungeonHubScene,
        "Edmond":  buildEdmondScene
    };
    const builder = scenes[key];
    if (builder) builder(panel);
    updateUI();
}

// ---- 홈 씬 ----

function buildHomeScene(panel) {
    if (player.circle === 0) {
        addLog("에드먼드", "'속성을 선택하게. 한번 선택하면 바꿀 수 없으니 신중히.'", "log-attain");
        (window.ATTRIBUTES || []).forEach(attr => {
            addBtn(panel, `[${attr}] 속성 입문`, () => chooseAttribute(attr));
        });
        return;
    }

    const canAdvance = checkCircleAdvance();
    addBtn(panel, "휴식하기 (기력 완전 회복)", restAction);
    addBtn(panel, "연구실 →", () => renderScene("Lab"));
    addBtn(panel, "흑마법사의 탑 →", () => renderScene("Dungeon"));
    addBtn(panel, "마을 →", () => renderScene("Town"));
    if (!player.edmond.sacrificed) {
        addBtn(panel, "에드먼드 스승 찾기", () => renderScene("Edmond"));
    }
    if (canAdvance) {
        addBtn(panel, `★ ${player.circle + 1}서클 승급 의식`, circleAdvance, "border-color:#ff8c00;color:#ff8c00;font-weight:bold;");
    }
}

// ---- 연구실 씬 ----

function buildLabScene(panel) {
    addBtn(panel, "마법 연구 (ST-20, MP-10)", researchAction);
    addBtn(panel, "마법 제련 — 이종 속성 습득 (ST-30, 연구P-15)", craftSpell);
    addBtn(panel, "마법 합성 — 2속성 결합 신마법 창조 (연구P-25)", openSynthesisScene, "border-color:#8e44ad;color:#8e44ad;");
    addBtn(panel, "← 오두막으로", () => renderScene("Home"));
}

// ---- 마을 씬 ----

function buildTownScene(panel) {
    const limit = 2;
    const remaining = limit - (player.townExploreCount || 0);
    const exploreLabel = remaining > 0
        ? `마을 탐색 (ST-15, 오늘 ${remaining}회 가능)`
        : `마을 탐색 — 오늘 횟수 소진 (휴식 후 초기화)`;

    const exploreBtn = addBtn(panel, exploreLabel, () => {
        if (remaining <= 0) { addLog("마을", "오늘은 더 이상 탐색할 기력이 없습니다. 휴식 후 다시 오세요.", "log-sys"); return; }
        if (!useStamina(15)) return;
        player.townExploreCount = (player.townExploreCount || 0) + 1;
        trackQuest('explore', 1);
        doTownExplore();
    });
    if (remaining <= 0) exploreBtn.style.opacity = '0.5';

    // 완료된 의뢰 있으면 강조 표시
    const pendingReward = (player.dailyQuests || []).some(q => q.done && !q.claimed);
    const guildLabel = pendingReward ? "의뢰 보드 — 수령 대기중!" : "의뢰 보드 (일일 퀘스트)";
    addBtn(panel, guildLabel, () => buildGuildScene(document.getElementById('action-grid')),
        pendingReward ? "border-color:#ff8c00;color:#ff8c00;font-weight:bold;" : "");
    addBtn(panel, "상점 (아이템 구매)", openShop);
    addBtn(panel, "소지품 관리 (장착/사용)", openInventoryUse);
    addBtn(panel, "NPC 만나기 (ST-10)", () => {
        if (useStamina(10)) triggerNPCEncounter();
    });
    addBtn(panel, "← 오두막으로", () => renderScene("Home"));
}

function doTownExplore() {
    // EXP 대신 다양한 랜덤 보상
    const roll = Math.random();
    if (roll < 0.30) {
        // 골드 획득
        const g = rng(20, 60) + player.circle * 5;
        player.gold += g;
        addLog("마을 탐색", `시장을 돌아다니다 거래를 성사시켰습니다. Gold +${g}G`, "log-sys");
    } else if (roll < 0.55) {
        // 아이템 발견
        const item = getRandomItem();
        player.inventory.push(item);
        addLog("마을 탐색", `골목 어귀에서 뭔가를 발견했습니다. [${item.rarity}] ${item.name} 획득!`, "log-attain");
    } else if (roll < 0.75) {
        // 연구 포인트 (주민에게 정보 수집)
        const rp = rng(5, 15) + player.circle;
        player.researchPoints += rp;
        addLog("마을 탐색", `현지인에게 마법에 관한 이야기를 들었습니다. 연구P +${rp}`, "log-sys");
    } else if (roll < 0.88) {
        // 소량 EXP (의미 있는 경험)
        const exp = rng(15, 35);
        player.exp += exp;
        addLog("마을 탐색", `마을에서 뜻밖의 상황에 대처하며 성장했습니다. EXP +${exp}`, "log-sys");
        checkLevelUp();
    } else if (roll < 0.92) {
        // NPC 우연 조우
        addLog("마을 탐색", "탐색 중 누군가와 마주쳤습니다.", "log-sys");
        triggerNPCEncounter();
        return;
    } else if (roll < 0.97) {
        // 5% 분기 이벤트 (마을)
        triggerBranchEvent(null);
        return;
    } else {
        // 3% 기연
        triggerFortuneEvent(false);
    }
    updateUI();
    renderScene("Town");
}

// ---- 던전 허브 씬 ----

function buildDungeonHubScene(panel) {
    addLog("흑마법사의 탑", "어둠이 깔린 탑이 저 멀리 보입니다. 어느 구역으로 향하겠습니까?", "log-sys");

    const stages = window.DUNGEON_STAGES || [];
    stages.forEach((stage, idx) => {
        const circleOk    = player.circle >= stage.minCircle;
        const prevCleared = idx === 0 || player.clearedStages.includes(stages[idx - 1].id);
        const unlocked    = circleOk && prevCleared;
        const cleared     = player.clearedStages.includes(stage.id);

        let label = stage.name;
        if (cleared)          label = `✓ ${stage.name}`;
        else if (!prevCleared) label = `[이전 구역 클리어 필요] ${stage.name}`;
        else if (!circleOk)   label = `[${stage.minCircle}서클 필요] ${stage.name}`;

        const style = cleared   ? "color:#666;border-color:#aaa;"
                    : unlocked  ? "color:#217346;border-color:#217346;font-weight:bold;"
                    : "opacity:0.5;";
        addBtn(panel, label, () => {
            if (!prevCleared) { addLog("경고", "이전 구역의 보스를 클리어해야 진입할 수 있습니다.", "log-err"); return; }
            if (!circleOk)    { addLog("경고", `${stage.minCircle}서클 이상이어야 진입할 수 있습니다.`, "log-err"); return; }
            enterDungeonStage(stage);
        }, style);
    });

    addBtn(panel, "← 오두막으로", () => renderScene("Home"));
}

// ---- 던전 스테이지 진입 ----

function enterDungeonStage(stage) {
    player.currentStage = stage.id;
    if (!useStamina(stage.staminaCost)) return;

    addLog(stage.name, stage.desc, "log-sys");
    renderDungeonStageActions(stage);
    updateUI();
}

function renderDungeonStageActions(stage) {
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    const cleared = player.clearedStages.includes(stage.id);

    addBtn(panel, "전투 탐색 (적 조우)", () => {
        startDungeonCombat(stage);
    });
    addBtn(panel, "보물 탐색 (ST-10)", () => {
        if (!useStamina(10)) return;
        // 20% 분기 이벤트 (TRPG 선택지)
        if (Math.random() < 0.20) { triggerBranchEvent(stage); return; }
        // 0.1% 히든피스
        if (Math.random() < 0.001) {
            const hp = stage.hiddenPiece;
            const piece = { ...hp };
            player.inventory.push(piece);
            addLog("히든피스 발견!!", `[${hp.rarity}] ★ ${hp.name} ★ 을 발견했습니다! (확률 0.1%)`, "log-attain");
        } else if (Math.random() < 0.35) {
            const item = getRandomItem();
            player.inventory.push(item);
            addLog("보물 발견", `[${item.rarity}] ${item.name} 획득!`, "log-attain");
        } else {
            addLog("탐색", "아무것도 찾지 못했습니다.", "log-sys");
        }
        // 1% 기연 (탑 내)
        if (Math.random() < 0.01) triggerFortuneEvent(true);
        updateUI();
    });
    if (!cleared) {
        const bossData = stage.bossId ? (window.ENEMIES_DB || []).find(e => e.id === stage.bossId) : null;
        const bossFn   = bossData ? () => startBossCombat(stage) : () => clearStage(stage);
        const bossLabel = bossData ? `⚔ 보스 토벌: ${bossData.name}` : "구역 제압";
        addBtn(panel, bossLabel, bossFn, "border-color:#d32f2f;color:#d32f2f;font-weight:bold;");
    }
    addBtn(panel, "← 탑 목록으로", () => renderScene("Dungeon"));
}

function startDungeonCombat(stage) {
    const db = window.ENEMIES_DB || [];
    const tiers = stage.enemyTiers || [1];
    const tier = tiers[rng(0, tiers.length - 1)];
    const candidates = db.filter(e => e.tier === tier && e.tier < 5);
    if (!candidates.length) return;
    const base = candidates[rng(0, candidates.length - 1)];
    const scale = 1 + (player.circle - 1) * 0.25;
    const enemy = { ...base, hp: Math.floor(base.maxHp * scale), maxHp: Math.floor(base.maxHp * scale), pwr: Math.floor(base.pwr * scale) };
    combat = { enemy, playerRevived: false, stage, statusEffects: {} };
    player.inCombat = true;
    addLog("조우", `[${enemy.name}] 출현! "${enemy.intro}"`, "log-err");
    addLog("적 정보", `HP: ${enemy.hp} / 공격력: ${enemy.pwr}`, "log-sys");
    renderCombat();
}

function startBossCombat(stage) {
    const db = window.ENEMIES_DB || [];
    const boss = db.find(e => e.id === stage.bossId);
    if (!boss) { clearStage(stage); return; }
    const scale = 1 + (player.circle - 1) * 0.2;
    const enemy = { ...boss, hp: Math.floor(boss.maxHp * scale), maxHp: Math.floor(boss.maxHp * scale), pwr: Math.floor(boss.pwr * scale) };
    combat = { enemy, playerRevived: false, stage, isBoss: true, statusEffects: {} };
    player.inCombat = true;
    addLog("보스 등장", `[${enemy.name}]이 나타납니다!`, "log-err");
    addLog(enemy.name, `"${enemy.intro}"`, "log-err");
    addLog("경고", `HP: ${enemy.hp} / 공격력: ${enemy.pwr} — 전력으로 싸우십시오!`, "log-err");
    renderCombat();
}

function clearStage(stage) {
    if (!player.clearedStages.includes(stage.id)) {
        player.clearedStages.push(stage.id);
        addLog("구역 클리어!", stage.clearLog, "log-attain");
        player.exp += 200 + stage.minCircle * 50;
        player.gold += 100 + stage.minCircle * 30;
        addLog("보상", `EXP +${200 + stage.minCircle * 50}, Gold +${100 + stage.minCircle * 30}G`, "log-attain");
        checkLevelUp();
    }
    renderScene("Dungeon");
}

// ---- 에드먼드 씬 ----

function buildEdmondScene(panel) {
    const npc = (window.NPCS_DB || []).find(n => n.id === "edmond");
    const dialogues = [
        "마법은 지식이 아닌 의지로 다루는 것이라네.",
        "서두르지 말게. 깊이가 있어야 높이도 생기는 법이야.",
        "기억하게. 진정한 마법사는 힘보다 지혜를 앞세운다네.",
        "이 연구소에서 나는 많은 것을 발견했지... 자네도 곧 알게 될 거야.",
        "흑마법의 어둠이 다시 짙어지고 있어. 조심하게.",
        "두려움을 느끼는 것은 당연해. 하지만 두려움이 자네를 조종하게 해선 안 돼.",
        "오늘은 어떤가? 몸은 괜찮은가?",
        "잘 먹고 잘 자는 것도 마법사의 덕목이야. 휴식을 게을리 하지 말게."
    ];
    const diag = dialogues[rng(0, dialogues.length - 1)];
    addLog("에드먼드", `'${diag}'`, "log-attain");

    addBtn(panel, "마나 보충 부탁하기", () => {
        const heal = 30 + player.circle * 5;
        player.mana = Math.min(player.mana + heal, player.maxMana);
        addLog("에드먼드", `'조금이나마 도움이 되길 바라네.' 마나가 ${heal} 회복되었습니다.`, "log-attain");
        updateUI();
    });
    addBtn(panel, "스승의 조언 듣기", () => {
        const d = dialogues[rng(0, dialogues.length - 1)];
        addLog("에드먼드", `'${d}'`, "log-attain");
    });
    addBtn(panel, "← 오두막으로", () => renderScene("Home"));
}

// ---- 속성 선택 ----

function chooseAttribute(attr) {
    player.circle = 1;
    player.attribute = attr;
    player.maxMana = 80; player.mana = 80;
    const db = window.SPELLS_DB;
    if (db && db[attr] && db[attr][1] && db[attr][1][0]) {
        const s = db[attr][1][0];
        player.learnedSpells.push({ ...s, mastery: 10 });
        addLog("입문", `[${attr}] 속성의 길을 선택했습니다!`, "log-attain");
        addLog("마법 습득", `기초 마법 [${s.name}] 자동 습득! (MP ${s.manaCost})`, "log-attain");
    }
    triggerEdmondEvent(1);
    renderScene("Home");
}

// ---- 에드먼드 서사 ----

function triggerEdmondEvent(circle) {
    const events = window.EDMOND_EVENTS || {};
    const ev = events[circle];
    if (!ev || player.edmond.events.includes(circle)) return;
    player.edmond.events.push(circle);
    setTimeout(() => {
        addLog(`에드먼드 — ${ev.title}`, ev.text, "log-attain");
        if (ev.manaGain)        player.mana = Math.min(player.mana + ev.manaGain, player.maxMana);
        if (ev.expGain)         { player.exp += ev.expGain; checkLevelUp(); }
        if (ev.researchGain)    player.researchPoints += ev.researchGain;
        if (ev.maxStaminaGain)  { player.maxStamina += ev.maxStaminaGain; player.stamina = Math.min(player.stamina + ev.maxStaminaGain, player.maxStamina); }
        if (ev.itemGain) {
            const all = [...(window.ITEMS_DB?.weapon || []), ...(window.ITEMS_DB?.armor || []), ...(window.ITEMS_DB?.consumable || [])];
            const item = all.find(i => i.id === ev.itemGain);
            if (item) { player.inventory.push({ ...item }); addLog("아이템", `스승에게 [${item.name}]를 받았습니다.`, "log-attain"); }
        }
        if (ev.sacrifice) {
            player.edmond.sacrificed = true;
            const legacy = (window.ITEMS_DB?.weapon || []).find(w => w.id === "w_edmond_legacy");
            if (legacy) {
                player.equipped["무기"] = { ...legacy };
                addLog("에드먼드의 유산", "[에드먼드의 유산] 지팡이가 당신의 손에 들려있습니다. 스승의 혼이 함께합니다.", "log-attain");
            }
        }
        updateUI();
    }, 600);
}

// ---- 연구 ----

function researchAction() {
    if (player.mana < 10) { addLog("경고", "마나 부족 (필요: 10)."); return; }
    if (!useStamina(20)) return;
    player.mana -= 10;

    const attr = player.attribute || (window.ATTRIBUTES || [])[0];
    const learnedCount = getLearnedCountInCircle(attr, player.circle);
    if (learnedCount >= 10) {
        addLog("연구", `[${attr}] ${player.circle}서클 마법을 모두 습득했습니다.`, "log-sys");
        player.researchPoints += 2;
        updateUI(); return;
    }

    const chance = Math.min(0.05 + player.researchPoints * 0.001, 0.65);
    if (Math.random() < chance) {
        const spell = (window.SPELLS_DB?.[attr]?.[player.circle] || [])[learnedCount];
        if (spell) {
            player.learnedSpells.push({ ...spell, mastery: 0 });
            addLog("연구 성공", `[${spell.name}] 습득! (확률: ${Math.floor(chance * 100)}%)`, "log-attain");
        }
    } else {
        addLog("연구 실패", `지식의 조각을 놓쳤습니다. 연구P +1 (확률: ${Math.floor(chance * 100)}%)`, "log-sys");
        player.researchPoints++;
    }
    trackQuest('research', 1);
    updateUI();
}

function craftSpell() {
    if (player.researchPoints < 15) { addLog("경고", "연구P 부족 (필요: 15)."); return; }
    if (!useStamina(30)) return;
    player.researchPoints -= 15;

    const attrs = (window.ATTRIBUTES || []).filter(a => a !== player.attribute);
    const targetAttr = attrs[rng(0, attrs.length - 1)];
    const circle = Math.max(1, Math.min(player.circle, 10));
    const pool = (window.SPELLS_DB?.[targetAttr]?.[circle] || []).filter(s => !player.learnedSpells.some(l => l.name === s.name));

    if (pool.length > 0) {
        const spell = pool[rng(0, pool.length - 1)];
        player.learnedSpells.push({ ...spell, mastery: 0 });
        addLog("제련 성공", `이종 속성 [${spell.name}] (${targetAttr}) 획득!`, "log-attain");
    } else {
        addLog("제련", `[${targetAttr}] 속성 마법이 이미 완료되었습니다.`, "log-sys");
        player.researchPoints += 5;
    }
    updateUI();
}

// ---- 서클 승급 ----

function checkCircleAdvance() {
    if (player.circle === 0 || player.circle >= 10) return false;
    const next = player.circle + 1;
    return player.level >= next * 5 && player.researchPoints >= next * 15 && getLearnedCountInCircle(player.attribute, player.circle) >= 10;
}

function circleAdvance() {
    const next = player.circle + 1;
    if (!checkCircleAdvance()) {
        addLog("승급 실패", `조건: Lv.${next * 5} / 연구P ${next * 15} / 주속성 ${player.circle}서클 마법 10/10`, "log-err");
        return;
    }
    player.researchPoints -= next * 15;
    player.circle = next;
    player.maxMana += 30; player.mana = player.maxMana;
    addLog(`${player.circle}서클 승급!`, `${player.circle}서클 마법사가 되었습니다! 최대 마나 +30`, "log-attain");
    triggerEdmondEvent(player.circle);
    renderScene("Home");
}

// ---- 전투 ----

let combat = { enemy: null, playerRevived: false, stage: null, isBoss: false, statusEffects: {} };

function startCombat() {
    const db = window.ENEMIES_DB || [];
    const tierMap = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 4, 10: 4 };
    const tier = tierMap[player.circle] || 1;
    const candidates = db.filter(e => e.tier <= tier && e.id !== "black_dragon");
    const base = candidates[rng(0, candidates.length - 1)];
    const scale = 1 + (player.circle - 1) * 0.3;
    const enemy = { ...base, hp: Math.floor(base.maxHp * scale), maxHp: Math.floor(base.maxHp * scale), pwr: Math.floor(base.pwr * scale) };
    combat = { enemy, playerRevived: false, stage: null, statusEffects: {} };
    player.inCombat = true;
    addLog("전투 시작", `[${enemy.name}] 출현! "${enemy.intro}"`, "log-err");
    renderCombat();
}

function renderCombat() {
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    const enemy = combat.enemy;
    if (!enemy) return;

    const hpPct = Math.max(0, Math.floor(enemy.hp / enemy.maxHp * 100));
    const eff = combat.statusEffects || {};

    // ── 비주얼 적 상태 패널 ──
    const hpColor = hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ff9800' : '#f44336';
    const effColors = { burn:'#ff5722', stun:'#ffc107', freeze:'#2196f3', poison:'#4caf50', fear:'#9c27b0', bleed:'#e91e63', crush:'#795548' };
    const attrColors = { "불":"#e74c3c","번개":"#f39c12","바람":"#27ae60","중력":"#8e44ad","물":"#2980b9","독":"#16a085","어둠":"#2c3e50" };
    const weakBadges   = (enemy.weak||[]).map(a  => `<span style="background:${attrColors[a]||'#4caf50'};color:white;padding:0 5px;border-radius:8px;font-size:9px;">${a}</span>`).join(' ');
    const resistBadges = (enemy.resist||[]).map(a => `<span style="background:#777;color:white;padding:0 5px;border-radius:8px;font-size:9px;">${a}</span>`).join(' ');
    const effBadges = Object.entries(eff).map(([id, turns]) => {
        const def = Object.values(STATUS_MAP).find(s => s.id === id);
        return `<span style="background:${effColors[id]||'#888'};color:white;padding:0 5px;border-radius:8px;font-size:9px;">${def?.name||id} ${turns}</span>`;
    }).join(' ');

    const statusBar = document.createElement('div');
    statusBar.style.cssText = 'padding:7px 10px;background:#fff5f5;border:1px solid #f44336;border-radius:2px;margin-bottom:6px;font-size:11px;';
    statusBar.innerHTML =
        `<b>${enemy.name}</b> &nbsp;<span style="color:#999;font-size:10px;">HP ${enemy.hp}/${enemy.maxHp}</span>` +
        `<div style="height:6px;background:#eee;border-radius:3px;margin:3px 0;overflow:hidden;"><div style="width:${hpPct}%;height:100%;background:${hpColor};transition:width 0.3s;"></div></div>` +
        `<div style="margin-top:2px;">` +
        (weakBadges   ? `약점 ${weakBadges} &nbsp;` : '') +
        (resistBadges ? `저항 ${resistBadges} &nbsp;` : '') +
        (effBadges    ? `상태 ${effBadges}` : '') +
        `</div>`;
    panel.appendChild(statusBar);

    // 마법 공격 (최근 6개)
    player.learnedSpells.slice(-6).forEach(s => {
        const ok = player.mana >= s.manaCost;
        const isWeak    = enemy.weak?.includes(s.attr);
        const isResist  = enemy.resist?.includes(s.attr);
        const badge = isWeak ? ' <b style="color:#4caf50">[약점]</b>' : isResist ? ' <span style="color:#f44336">[저항]</span>' : '';
        const masteryPct = s.mastery || 0;
        const masteryBonus = masteryPct >= 100 ? 0.10 : masteryPct >= 50 ? 0.05 : 0;
        const dispPwr = Math.floor((s.power + getAtkBonus()) * (1 + masteryBonus));

        const b = document.createElement('button');
        b.className = 'excel-btn';
        if (!ok) b.style.opacity = '0.5';
        b.innerHTML = `${s.name}${badge} <small>(MP ${s.manaCost} / 위력 ${dispPwr}${masteryBonus > 0 ? ` +${Math.floor(masteryBonus*100)}%숙` : ''})</small>`;
        b.onclick = () => {
            if (player.mana < s.manaCost) { addLog("경고", "마나 부족!"); return; }
            player.mana -= s.manaCost;
            s.mastery = Math.min(100, (s.mastery || 0) + 2);
            const mb = (s.mastery >= 100 ? 0.10 : s.mastery >= 50 ? 0.05 : 0);
            // d20 공격 판정 (DC 8 = 65% 명중)
            const atkRoll = d20Check(8);
            const atkLabel = atkRoll.crit ? '★ 크리티컬!' : atkRoll.fumble ? '★ 대실패!' : atkRoll.success ? '명중' : '빗나감';
            addLog("공격 판정", `🎲 d20 = [${atkRoll.roll}] — ${atkLabel}`, "log-sys");
            if (atkRoll.fumble) {
                const backlash = Math.max(1, Math.floor(player.maxHp * 0.05));
                player.hp = Math.max(1, player.hp - backlash);
                addLog("마법 역류", `마법이 역류! 자신에게 ${backlash} 피해를 입었습니다. (대실패)`, "log-err");
                updateUI(); renderCombat(); return;
            }
            if (!atkRoll.success) {
                addLog("빗나감", `${enemy.name}이 공격을 회피했습니다!`, "log-sys");
                enemyAttack(); return;
            }
            let baseDmg = Math.floor((s.power + getAtkBonus()) * (1 + mb));
            if (atkRoll.crit) baseDmg = Math.floor(baseDmg * 2);
            let dmgMult = 1, note = '';
            if (enemy.weak?.includes(s.attr))        { dmgMult = 1.5; note = ' [약점 1.5x]'; }
            else if (enemy.resist?.includes(s.attr)) { dmgMult = 0.65; note = ' [저항 0.65x]'; }
            const dmg = Math.floor(baseDmg * dmgMult);
            const critNote = atkRoll.crit ? ' ★ 크리티컬!' : '';
            addLog("마법 공격", `[${s.name}]${note}${critNote} — ${enemy.name}에게 ${dmg} 데미지!`, "log-attain");
            applyStatusEffect(s.attr);
            trackQuest('spell', 1);
            enemyTakeDamage(dmg);
        };
        panel.appendChild(b);
    });

    // 합성 마법
    (player.synthesizedSpells || []).forEach(s => {
        const ok = player.mana >= s.manaCost;
        const b = document.createElement('button');
        b.className = 'excel-btn';
        b.style.borderColor = '#8e44ad';
        b.style.color = '#8e44ad';
        if (!ok) b.style.opacity = '0.5';
        const attrTags = s.attrs.map(a => `<span style="color:${attrColors[a]||'#8e44ad'}">${a}</span>`).join('+');
        b.innerHTML = `[합성] ${s.name} (${attrTags}) <small>(MP ${s.manaCost} / 위력 ${s.power + getAtkBonus()})</small>`;
        b.onclick = () => {
            if (player.mana < s.manaCost) { addLog("경고", "마나 부족!"); return; }
            player.mana -= s.manaCost;
            useSynthesisSpell(s);
        };
        panel.appendChild(b);
    });

    // 지팡이 타격 (d20 판정, DC 6 = 75% 명중)
    addBtn(panel, `지팡이 타격 (d20 판정, 위력 ${5 + getAtkBonus()}~${15 + getAtkBonus()})`, () => {
        const { roll, success, crit, fumble } = d20Check(6);
        addLog("물리 판정", `🎲 d20 = [${roll}] vs DC 6 — ${crit ? '★ 크리티컬!' : fumble ? '★ 대실패!' : success ? '명중' : '빗나감'}`, "log-sys");
        if (fumble) {
            addLog("대실패", "지팡이를 놓쳐버렸습니다! 다음 공격 기회를 잃었습니다.", "log-err");
            enemyAttack(); return;
        }
        if (!success) { addLog("빗나감", `${enemy.name}이 지팡이를 피했습니다!`, "log-sys"); enemyAttack(); return; }
        let dmg = rng(5 + getAtkBonus(), 15 + getAtkBonus());
        if (crit) dmg *= 2;
        addLog("물리 공격", `지팡이로 타격!${crit ? ' ★ 크리티컬!' : ''} ${enemy.name}에게 ${dmg} 데미지.`);
        enemyTakeDamage(dmg);
    });

    // 신화 스킬
    const weapon = getEquippedWeapon();
    if (weapon?.mythicSkill) {
        const skillNames = { chain_magic: "연쇄 마법", gravity_collapse: "중력 붕괴", soul_drain: "영혼 흡수" };
        addBtn(panel, `★ ${skillNames[weapon.mythicSkill] || weapon.mythicSkill} [신화 스킬]`, () => useMythicSkill(weapon.mythicSkill), "border-color:#ff8c00;color:#ff8c00;");
    }

    // 포션
    const potion = player.inventory.find(i => i.id === "c_hp_potion" || i.id === "c_elixir");
    if (potion) {
        addBtn(panel, `포션 사용: ${potion.name}`, () => {
            const idx = player.inventory.indexOf(potion);
            player.inventory.splice(idx, 1);
            const result = potion.effect(player);
            addLog("아이템", result || `${potion.name} 사용!`, "log-attain");
            updateUI(); renderCombat();
        });
    }

    // 도망 (DC 8 = 65% 성공, 1=대실패, 20=대성공)
    addBtn(panel, "도망치기 (DC 8, d20 판정)", () => {
        const { roll, success, crit, fumble } = d20Check(8);
        addLog("도주 판정", `🎲 d20 = [${roll}] vs DC 8 — ${crit ? '완벽한 도주!' : success ? '성공' : fumble ? '★ 대실패!' : '실패'}`, "log-sys");
        if (fumble) {
            addLog("대실패", "도주 시도가 역효과! 적이 기회를 놓치지 않습니다.", "log-err");
            enemyAttack(); enemyAttack(); return;
        }
        if (crit) {
            const bonus = rng(10, 30);
            player.gold += bonus;
            addLog("완벽한 도주", `순간이동하듯 사라지며 흘려진 금화를 주웠습니다! Gold +${bonus}`, "log-attain");
            player.inCombat = false;
            renderScene("Dungeon"); return;
        }
        if (success) {
            addLog("도망", "재빠르게 도망쳤습니다!", "log-sys");
            player.inCombat = false;
            renderScene("Dungeon");
        } else {
            addLog("도망 실패", "도망치지 못했습니다! 반격 받습니다.", "log-err");
            enemyAttack();
        }
    });
}

function useMythicSkill(skillId) {
    const enemy = combat.enemy;
    if (!enemy) return;
    let dmg = 0;
    if (skillId === "chain_magic")      { dmg = rng(200, 350); addLog("연쇄 마법", `모든 속성 연쇄 폭발! ${enemy.name}에게 ${dmg} 데미지!`, "log-attain"); }
    else if (skillId === "gravity_collapse") { dmg = Math.floor(enemy.maxHp * 0.4); addLog("중력 붕괴", `공간 붕괴! 최대 HP의 40% 데미지!`, "log-attain"); }
    else if (skillId === "soul_drain")  { dmg = rng(150, 250); const h = Math.floor(dmg * 0.3); player.hp = Math.min(player.hp + h, player.maxHp); addLog("영혼 흡수", `${dmg} 데미지 + HP ${h} 흡수!`, "log-attain"); }
    enemyTakeDamage(dmg);
}

function enemyTakeDamage(dmg) {
    combat.enemy.hp -= dmg;
    if (combat.enemy.hp <= 0) combatVictory();
    else enemyAttack();
}

function applyStatusEffect(attr) {
    const def = STATUS_MAP[attr];
    if (!def || !combat.enemy) return;
    const { roll, success, crit, fumble } = d20Check(def.dc);
    const label = crit ? '대성공!' : success ? '성공' : fumble ? '대실패' : '실패';
    addLog("상태이상 판정", `🎲 d20 = [${roll}] vs DC ${def.dc} — ${label}`, "log-sys");
    if (fumble) { addLog("역효과", `마법이 안정되지 못해 상태이상이 발동하지 않았습니다.`, "log-sys"); return; }
    if (success) {
        const turns = crit ? def.turns * 2 : def.turns;
        const prev = combat.statusEffects[def.id] || 0;
        combat.statusEffects[def.id] = Math.max(prev, turns);
        addLog("상태이상", `[${combat.enemy.name}]에게 [${def.name}] 부여!${crit ? ' (대성공 — 2배 지속!)' : ''} (${turns}턴)`, "log-attain");
    }
}

function processStatusEffects() {
    const eff = combat.statusEffects;
    if (!combat.enemy) return;
    let totalTick = 0;
    const expired = [];
    for (const [id, turns] of Object.entries(eff)) {
        const def = Object.values(STATUS_MAP).find(s => s.id === id);
        if (def?.tick) totalTick += def.tick;
        if (turns <= 1) expired.push(id);
        else eff[id] = turns - 1;
    }
    expired.forEach(k => delete eff[k]);
    if (totalTick > 0) {
        combat.enemy.hp -= totalTick;
        addLog("상태이상 피해", `${combat.enemy.name}이 상태이상으로 ${totalTick} 피해! (HP ${Math.max(0, combat.enemy.hp)}/${combat.enemy.maxHp})`, "log-sys");
    }
}

function enemyAttack() {
    const enemy = combat.enemy;
    if (!enemy) return;

    // 상태이상 틱 먼저 처리
    processStatusEffects();
    if (enemy.hp <= 0) { combatVictory(); return; }

    // 빙결: d20 행동 불가 판정
    if (combat.statusEffects["freeze"]) {
        const freezeCheck = d20Check(STATUS_MAP["물"].skipDC);
        addLog("빙결 판정", `🎲 d20 = [${freezeCheck.roll}] vs DC ${STATUS_MAP["물"].skipDC} — ${freezeCheck.success ? '행동 불가!' : '행동 가능'}`, "log-sys");
        if (freezeCheck.success) {
            addLog("빙결", `[${enemy.name}]이 빙결로 행동하지 못합니다!`, "log-sys");
            updateUI(); renderCombat(); return;
        }
    }

    // 적 공격 d20 판정 (DC 8 = 65% 명중)
    const atkRoll = d20Check(8);
    const atkLabel = atkRoll.crit ? '★ 크리티컬!' : atkRoll.fumble ? '★ 대실패!' : atkRoll.success ? '명중' : '빗나감';
    addLog("적 공격 판정", `🎲 [${enemy.name}] d20 = [${atkRoll.roll}] — ${atkLabel}`, "log-sys");

    if (atkRoll.fumble) {
        const selfDmg = Math.max(1, Math.floor(enemy.maxHp * 0.05));
        combat.enemy.hp = Math.max(1, combat.enemy.hp - selfDmg);
        addLog(enemy.name, `공격을 실수하여 자신에게 ${selfDmg} 피해를 입었습니다! (대실패)`, "log-sys");
        if (combat.enemy.hp <= 0) { combatVictory(); return; }
        updateUI(); renderCombat(); return;
    }
    if (!atkRoll.success) {
        addLog(enemy.name, `공격이 빗나갔습니다!`, "log-sys");
        updateUI(); renderCombat(); return;
    }

    let rawDmg = rng(Math.floor(enemy.pwr * 0.7), enemy.pwr);
    if (atkRoll.crit) rawDmg = Math.floor(rawDmg * 2);
    // 감전/공포: 적 공격력 감소
    if (combat.statusEffects["stun"])  rawDmg = Math.floor(rawDmg * (STATUS_MAP["번개"].atkMult || 1));
    if (combat.statusEffects["fear"])  rawDmg = Math.floor(rawDmg * (STATUS_MAP["어둠"].atkMult || 1));

    let myDef = getDefBonus();
    // 압쇄: 방어력 감소
    if (combat.statusEffects["crush"]) myDef = Math.floor(myDef * (STATUS_MAP["중력"].defMult || 1));

    const dmg = Math.max(1, rawDmg - myDef);
    const critNote = atkRoll.crit ? ' ★ 크리티컬 — 2배 데미지!' : '';
    addLog(enemy.name, `"${enemy.atk}"${critNote} — 당신에게 ${dmg} 데미지! (방어 -${myDef})`, "log-err");
    player.hp -= dmg;

    // 불사조 로브 부활
    const armor = getEquippedArmor();
    if (player.hp <= 0 && armor?.id === "a_phoenix_robe" && !combat.playerRevived) {
        combat.playerRevived = true;
        player.hp = Math.floor(player.maxHp * 0.3);
        addLog("불사조 부활", "불사조 로브가 당신을 살려냈습니다! HP 30% 회복!", "log-attain");
    }

    if (player.hp <= 0) {
        player.hp = 0;
        updateUI();
        showGameOver(enemy);
        return;
    }
    updateUI();
    renderCombat();
}

function combatVictory() {
    const enemy = combat.enemy;
    const stage = combat.stage;
    const isBoss = combat.isBoss;
    player.inCombat = false;
    player.exp += enemy.exp;
    player.gold += enemy.gold;
    addLog("전투 승리", `[${enemy.name}] 처치! EXP +${enemy.exp}, Gold +${enemy.gold}G`, "log-attain");
    trackQuest('kill', 1);
    trackQuest('earn_gold', enemy.gold);
    if (combat.stage) trackQuest('dungeon', 1);

    if (Math.random() < (enemy.drop || 0.2)) {
        const item = getRandomItem();
        player.inventory.push(item);
        addLog("드롭!", `[${item.rarity}] ${item.name} 획득!`, "log-attain");
    }

    checkLevelUp();

    if (isBoss && stage) {
        clearStage(stage);
    } else if (stage) {
        renderDungeonStageActions(stage);
    } else {
        renderScene(player.location);
    }
}

// ---- 사망 처리 ----

function showGameOver(enemy) {
    player.inCombat = false;

    const deathMessages = [
        `[${enemy?.name || "적"}]의 마지막 일격이 당신의 심장을 관통합니다.`,
        `모든 마력이 소진되었습니다. 눈앞이 어두워집니다.`,
        `당신은 끝까지 싸웠습니다. 하지만 이것이 마지막이었습니다.`,
        `에드먼드의 목소리가 아득히 들려옵니다. '…미안하네, 제자.'`,
        `강해지고 싶었습니다. 하지만 세상은 냉정합니다.`
    ];
    const epitaphs = [
        `Lv.${player.level} ${player.circle}서클 마법사는 이렇게 잠들었습니다.`,
        `${player.day}일 동안의 여정이 여기서 막을 내렸습니다.`,
        `${player.learnedSpells.length}종의 마법을 알았지만, 그것으로는 부족했습니다.`,
        `그가/그녀가 익힌 ${player.learnedSpells.length}개의 마법이 바람에 흩어집니다.`
    ];

    const msg = deathMessages[rng(0, deathMessages.length - 1)];
    const epitaph = epitaphs[rng(0, epitaphs.length - 1)];

    addLog("— 사망 —", `${msg} <br><br><em>${epitaph}</em>`, "log-err");

    // 게임 오버 오버레이 표시
    const overlay = document.getElementById('gameover-overlay');
    if (overlay) {
        document.getElementById('go-death-msg').innerHTML = msg;
        document.getElementById('go-epitaph').innerHTML = epitaph;
        document.getElementById('go-stats').innerHTML =
            `생존일: ${player.day}일 | 레벨: ${player.level} | 서클: ${player.circle} | 마법: ${player.learnedSpells.length}종 | 골드: ${player.gold}G`;
        overlay.style.display = 'flex';
    }

    // 세이브 삭제
    localStorage.removeItem('mage_save_v4');
}

function restartGame() {
    location.reload();
}

// ---- 기연 이벤트 ----

// isDungeon: 탑 내부 여부 (true면 기연 + HP/MP 완전회복)
function triggerFortuneEvent(isDungeon) {
    const events = window.FORTUNE_EVENTS || [];
    if (!events.length) return;
    const ev = events[rng(0, events.length - 1)];
    addLog(`✦ 기연: ${ev.name}`, ev.text, "log-attain");

    if (ev.expGain)          { player.exp += ev.expGain; }
    if (ev.manaGain)         player.mana = Math.min(player.mana + ev.manaGain, player.maxMana);
    if (ev.hpGain)           player.hp = Math.min(player.hp + ev.hpGain, player.maxHp);
    if (ev.staminaGain)      player.stamina = Math.min(player.stamina + ev.staminaGain, player.maxStamina);
    if (ev.goldGain)         player.gold += ev.goldGain;
    if (ev.researchGain)     player.researchPoints += ev.researchGain;
    if (ev.maxStaminaGain)   { player.maxStamina += ev.maxStaminaGain; player.stamina = Math.min(player.stamina + ev.maxStaminaGain, player.maxStamina); }
    if (ev.itemGain === "random") {
        const item = getRandomItem();
        player.inventory.push(item);
        addLog("기연 아이템", `[${item.rarity}] ${item.name} 획득!`, "log-attain");
    }

    // 탑 내부 기연은 HP/MP 완전 회복 추가 보너스
    if (isDungeon) {
        player.hp = player.maxHp;
        player.mana = player.maxMana;
        addLog("기연 추가 효과", "탑 안의 신비로운 기운이 HP와 MP를 완전히 회복시킵니다!", "log-attain");
    }

    checkLevelUp();
}

// ---- NPC 조우 ----

function triggerNPCEncounter() {
    const db = window.NPCS_DB || [];
    const pool = db.filter(n => n.id !== "edmond" && player.circle >= (n.minCircle || 0));
    if (!pool.length) { addLog("마을", "오늘은 특별한 사람을 만나지 못했습니다.", "log-sys"); return; }
    const npc = pool[rng(0, pool.length - 1)];
    trackQuest('npc', 1);
    renderNPCScene(npc);
}

function renderNPCScene(npc) {
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';

    // 분위기 + 대화 로그
    addLog(`[NPC 조우] ${npc.name}`, npc.atmosphere, "log-sys");
    const diag = npc.dialogues[rng(0, npc.dialogues.length - 1)];
    addLog(npc.name, npc.greeting, "log-attain");
    addLog(npc.name, `'${diag}'`, "log-attain");

    // 액션 버튼
    (npc.actions || []).forEach(action => {
        if (action.type === "leave") {
            addBtn(panel, "자리를 피하다", () => renderScene("Town"), "color:#888;border-color:#ccc;");
            return;
        }
        const b = document.createElement('button');
        b.className = 'excel-btn';
        b.innerHTML = `${action.label}${action.desc ? ` <small style="color:#888">— ${action.desc}</small>` : ''}`;
        b.onclick = () => executeNPCAction(action, npc);
        panel.appendChild(b);
    });
}

function executeNPCAction(action, npc) {
    switch (action.type) {
        case "reward_exp":
            player.exp += action.expGain || 0;
            if (action.rpGain) player.researchPoints += action.rpGain;
            addLog(npc.name, action.log || `EXP +${action.expGain}`, "log-attain");
            checkLevelUp();
            break;

        case "reward_gold":
            player.gold += action.goldGain || 0;
            addLog(npc.name, action.log || `Gold +${action.goldGain}G`, "log-attain");
            break;

        case "reward_item":
            const itemPool = [...(window.ITEMS_DB?.weapon || []), ...(window.ITEMS_DB?.armor || []), ...(window.ITEMS_DB?.consumable || [])];
            let grantItem;
            if (action.itemId === "random" || action.itemId === "unique_pool") {
                // unique_pool: 유니크 이상 아이템
                const rarityFilter = action.itemId === "unique_pool" ? ["유니크", "신화"] : null;
                const filtered = rarityFilter ? itemPool.filter(i => rarityFilter.includes(i.rarity)) : itemPool;
                grantItem = { ...(filtered[rng(0, filtered.length - 1)]) };
            } else {
                grantItem = { ...(itemPool.find(i => i.id === action.itemId) || itemPool[0]) };
            }
            player.inventory.push(grantItem);
            addLog(npc.name, `${action.log || '아이템을 받았습니다.'} [${grantItem.rarity}] ${grantItem.name}`, "log-attain");
            break;

        case "reward_stat":
            player[action.statKey] = (player[action.statKey] || 0) + (action.amount || 0);
            // HP/ST 현재값도 같이 올려줌
            if (action.statKey === "maxHp") player.hp = Math.min(player.hp + action.amount, player.maxHp);
            if (action.statKey === "maxStamina") player.stamina = Math.min(player.stamina + action.amount, player.maxStamina);
            if (action.statKey === "maxMana") player.mana = Math.min(player.mana + action.amount, player.maxMana);
            addLog(npc.name, action.log || `${action.statKey} +${action.amount}`, "log-attain");
            break;

        case "reward_mana":
            player.mana = Math.min(player.mana + (action.manaGain || 0), player.maxMana);
            addLog(npc.name, action.log || `MP +${action.manaGain}`, "log-attain");
            break;

        case "reward_research":
            player.researchPoints += action.rpGain || 0;
            if (action.expGain) { player.exp += action.expGain; checkLevelUp(); }
            addLog(npc.name, action.log || `연구P +${action.rpGain}`, "log-attain");
            break;

        case "combat":
            addLog(npc.name, action.log || "전투가 시작됩니다!", "log-err");
            const db = window.ENEMIES_DB || [];
            const enemyBase = db.find(e => e.id === action.enemyId);
            if (enemyBase) {
                const scale = 1 + (player.circle - 1) * 0.25;
                const enemy = { ...enemyBase, hp: Math.floor(enemyBase.maxHp * scale), maxHp: Math.floor(enemyBase.maxHp * scale), pwr: Math.floor(enemyBase.pwr * scale) };
                combat = { enemy, playerRevived: false, stage: null, statusEffects: {} };
                player.inCombat = true;
                renderCombat();
            }
            return;

        case "gamble":
            if (Math.random() < 0.5) {
                player.gold += action.winGold || 0;
                addLog(npc.name, action.log_win || `Gold +${action.winGold}G`, "log-attain");
            } else {
                const loss = Math.min(action.loseGold || 0, player.gold);
                player.gold -= loss;
                addLog(npc.name, action.log_lose || `Gold -${loss}G`, "log-err");
            }
            break;

        case "persuade":
            if (Math.random() < 0.6) {
                player.exp += action.successExpGain || 0;
                addLog(npc.name, action.successLog || "설득 성공! EXP 획득.", "log-attain");
                checkLevelUp();
            } else {
                addLog(npc.name, action.failLog || "설득 실패! 전투 발생!", "log-err");
                const failDb = window.ENEMIES_DB || [];
                const failEnemy = failDb.find(e => e.id === action.failEnemyId);
                if (failEnemy) {
                    const sc = 1 + (player.circle - 1) * 0.25;
                    combat = { enemy: { ...failEnemy, hp: Math.floor(failEnemy.maxHp * sc), maxHp: Math.floor(failEnemy.maxHp * sc), pwr: Math.floor(failEnemy.pwr * sc) }, playerRevived: false, stage: null, statusEffects: {} };
                    player.inCombat = true;
                    renderCombat(); return;
                }
            }
            break;

        case "buy_item":
            if (player.gold < (action.cost || 0)) { addLog("상점", "골드가 부족합니다."); return; }
            player.gold -= action.cost;
            const bItem = getRandomItem();
            player.inventory.push(bItem);
            addLog(npc.name, `${action.log || '구매!'} [${bItem.rarity}] ${bItem.name} 획득 (−${action.cost}G)`, "log-attain");
            break;

        case "buy_research":
            if (player.gold < (action.cost || 0)) { addLog("상점", "골드가 부족합니다."); return; }
            player.gold -= action.cost;
            player.researchPoints += action.rpGain || 0;
            addLog(npc.name, `${action.log || `연구P +${action.rpGain}`} (−${action.cost}G)`, "log-attain");
            break;

        case "sell_item":
            player.gold += action.goldGain || 0;
            addLog(npc.name, action.log || `Gold +${action.goldGain}G`, "log-attain");
            break;

        case "donate_gold":
            if (player.gold < (action.cost || 0)) { addLog("경고", "골드가 부족합니다."); return; }
            player.gold -= action.cost;
            if (action.expGain) { player.exp += action.expGain; checkLevelUp(); }
            addLog(npc.name, action.log || `Gold -${action.cost}G, EXP +${action.expGain}`, "log-attain");
            break;

        case "dark_knowledge":
            const hpCost = action.hpCost || 0;
            if (player.hp <= hpCost) { addLog("경고", "체력이 너무 낮습니다. 감당할 수 없습니다."); return; }
            player.hp -= hpCost;
            player.exp += action.expGain || 0;
            addLog(npc.name, action.log || `EXP +${action.expGain}, HP -${hpCost}`, "log-attain");
            checkLevelUp();
            break;
    }

    updateUI();
    // 행동 후 마을로 복귀 버튼 남김
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    addBtn(panel, "← 마을로 돌아가기", () => renderScene("Town"));
}

// ---- 아이템 ----

function getRandomItem() {
    const db = window.ITEMS_DB || {};
    const styles = window.RARITY_STYLE || {};
    const roll = Math.random();
    let rarity = "일반"; let cum = 0;
    for (const [r, data] of Object.entries(styles)) {
        cum += data.chance;
        if (roll < cum) { rarity = r; break; }
    }
    const pool = [...(db.weapon || []), ...(db.armor || []), ...(db.consumable || [])].filter(i => i.rarity === rarity);
    if (!pool.length) return { id: "c_hp_potion", name: "HP 포션", slot: "소비", rarity: "일반", desc: "HP +40", effect: p => { p.hp = Math.min(p.hp + 40, p.maxHp); return "HP +40 회복"; } };
    return { ...(pool[rng(0, pool.length - 1)]) };
}

function openShop() {
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    addLog("상점", `상인이 물건을 펼칩니다. 보유 Gold: ${player.gold}G`, "log-sys");

    const shopItems = [
        { item: { id: "c_hp_potion",    name: "HP 포션",       slot: "소비", rarity: "일반", desc: "HP +40", effect: p => { p.hp = Math.min(p.hp + 40, p.maxHp); return "HP +40 회복"; } }, price: 30 },
        { item: { id: "c_mp_potion",    name: "MP 포션",       slot: "소비", rarity: "일반", desc: "MP +30", effect: p => { p.mana = Math.min(p.mana + 30, p.maxMana); return "MP +30 회복"; } }, price: 25 },
        { item: { id: "c_research_gem", name: "연구 보석",      slot: "소비", rarity: "매직", desc: "연구P +20", effect: p => { p.researchPoints += 20; return "연구P +20"; } }, price: 80 },
        { item: { id: "c_exp_scroll",   name: "경험 두루마리", slot: "소비", rarity: "매직", desc: "EXP +200", effect: p => { p.exp += 200; return "EXP +200"; } }, price: 100 },
        { item: { id: "c_elixir",       name: "엘릭서",         slot: "소비", rarity: "유니크", desc: "HP/MP 완전 회복", effect: p => { p.hp = p.maxHp; p.mana = p.maxMana; return "HP/MP 완전 회복!"; } }, price: 250 }
    ];

    shopItems.forEach(({ item, price }) => {
        const b = document.createElement('button');
        b.className = 'excel-btn';
        b.style.opacity = player.gold >= price ? '1' : '0.5';
        b.innerHTML = `${item.name} — <b>${price}G</b> (${item.desc})`;
        b.onclick = () => {
            if (player.gold < price) { addLog("상점", "골드 부족!"); return; }
            player.gold -= price;
            player.inventory.push({ ...item });
            addLog("구매", `[${item.name}] 구매! (−${price}G)`, "log-attain");
            updateUI();
        };
        panel.appendChild(b);
    });

    addBtn(panel, "← 마을로", () => renderScene("Town"));
}

// ---- 인벤토리: 목록 (마을 버튼에서 접근) ----

function openInventoryUse() {
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';

    const w = player.equipped["무기"];
    const a = player.equipped["방어구"];

    if (!w && !a && player.inventory.length === 0) {
        addLog("가방", "소지 중인 아이템이 없습니다.", "log-sys");
        addBtn(panel, "← 마을로", () => renderScene("Town"));
        return;
    }

    const styles = window.RARITY_STYLE || {};
    const makeRow = (item, idx, isEquipped) => {
        const b = document.createElement('button');
        b.className = 'excel-btn';
        const col = styles[item.rarity]?.color || "#333";
        const tag = isEquipped ? '<b>[장착중]</b> ' : '';
        b.innerHTML =
            `<span style="color:${col}">${tag}[${item.rarity}]</span> ${item.name}` +
            `<span style="float:right;font-size:10px;color:#aaa;">${item.slot}</span>`;
        b.onclick = () => showItemDetail(item, idx, isEquipped, openInventoryUse);
        panel.appendChild(b);
    };

    if (w) makeRow(w, -1, true);
    if (a) makeRow(a, -1, true);
    player.inventory.forEach((item, idx) => makeRow(item, idx, false));
    addBtn(panel, "← 마을로", () => renderScene("Town"), "margin-top:4px;color:#666;border-color:#ccc;");
}

// ---- 인벤토리: 상세 보기 + 액션
// backFn: 뒤로가기 시 호출할 함수
//   사이드바 탭에서 열면 → () => renderScene(player.location)
//   마을 목록에서 열면  → openInventoryUse
// ----

function showItemDetail(item, inventoryIdx, isEquipped, backFn) {
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    const styles = window.RARITY_STYLE || {};
    const col = styles[item.rarity]?.color || "#333";

    // 상세 정보 로그
    let infoHtml =
        `<span style="color:${col};font-weight:bold;">[${item.rarity}] ${item.name}</span><br>` +
        `<span style="color:#888;font-size:11px;">슬롯: ${item.slot}</span><br><br>` +
        `${item.desc || ''}`;

    if (item.opts && item.opts.length > 0) {
        infoHtml += `<br><br><b>옵션</b><br>` + item.opts.map(o => `&nbsp;• ${o}`).join('<br>');
    }
    if (item.atkBonus) infoHtml += `<br><br>공격력 보너스: <b>+${item.atkBonus}</b>`;
    if (item.defBonus) infoHtml += `<br><br>방어력 보너스: <b>+${item.defBonus}</b>`;
    if (item.mythicSkill) {
        const skillNames = { chain_magic: "연쇄 마법", gravity_collapse: "중력 붕괴", soul_drain: "영혼 흡수" };
        infoHtml += `<br><span style="color:#ff8c00;font-weight:bold;">★ 신화 스킬: ${skillNames[item.mythicSkill] || item.mythicSkill}</span>`;
    }

    addLog("아이템 정보", infoHtml, "log-sys");

    // ── 액션 버튼 ──
    const done = () => { updateUI(); if (backFn) backFn(); };

    if (isEquipped) {
        addBtn(panel, `✕ 장착 해제 — ${item.name}`, () => {
            player.inventory.push(item);
            player.equipped[item.slot] = null;
            addLog("장착 해제", `[${item.name}] 해제. 가방으로 이동했습니다.`, "log-sys");
            done();
        }, "border-color:#d32f2f;color:#d32f2f;");

    } else if (item.slot === "무기" || item.slot === "방어구") {
        const current = player.equipped[item.slot];
        if (current) {
            addLog("현재 장착", `[${current.name}] 장착 중 → 교체 시 가방으로 이동합니다.`, "log-sys");
        }
        addBtn(panel, `▶ 장착하기 — ${item.name}`, () => {
            const prev = player.equipped[item.slot];
            player.equipped[item.slot] = item;
            player.inventory.splice(inventoryIdx, 1);
            if (prev) player.inventory.push(prev);
            addLog("장착", `[${item.name}] 장착 완료!${prev ? ` (이전: ${prev.name} → 가방)` : ''}`, "log-attain");
            done();
        }, "border-color:#217346;color:#217346;font-weight:bold;");

    } else if (item.slot === "소비") {
        addBtn(panel, `▶ 사용하기 — ${item.name}`, () => {
            if (!item.effect) { addLog("오류", "사용할 수 없는 아이템입니다.", "log-err"); return; }
            const result = item.effect(player);
            player.inventory.splice(inventoryIdx, 1);
            addLog("아이템 사용", result || `${item.name} 사용!`, "log-attain");
            checkLevelUp();
            done();
        }, "border-color:#217346;color:#217346;font-weight:bold;");
    }

    addBtn(panel, "← 뒤로가기", () => { if (backFn) backFn(); }, "color:#555;");
}

// ---- 휴식 ----

function restAction() {
    player.day++;
    player.stamina = player.maxStamina;
    player.mana = player.maxMana;
    player.hp = Math.min(player.hp + 30, player.maxHp);
    player.townExploreCount = 0;
    generateDailyQuests();
    addLog("휴식", `Day ${player.day}. 기력을 완전히 회복했습니다. HP+30 회복.`, "log-sys");
    renderScene("Home");
}

// ---- UI 업데이트 ----

function updateUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    const setW = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + "%"; };

    set('ui-circle', player.circle);
    set('ui-level', player.level);
    const karmaTitle = player.karma >= 50 ? '의로운' : player.karma <= -50 ? '냉혹한' : '중립';
    set('ui-res-day', `${player.researchPoints}P / ${player.day}일 / ${karmaTitle}`);
    set('ui-exp-gold', `${player.exp}/${player.maxExp} EXP / ${player.gold}G`);

    const w = player.equipped["무기"];
    const a = player.equipped["방어구"];
    set('ui-gear', `${w ? w.name : '없음'} / ${a ? a.name : '없음'}`);

    setW('st-fill',  player.stamina / player.maxStamina * 100);
    setW('hp-fill',  player.hp / player.maxHp * 100);
    setW('mana-fill',player.mana / player.maxMana * 100);
    setW('exp-fill', player.exp / player.maxExp * 100);

    set('st-val',   `${player.stamina}/${player.maxStamina}`);
    set('hp-val',   `${player.hp}/${player.maxHp}`);
    set('mana-val', `${player.mana}/${player.maxMana}`);

    renderTab();
    ['spells','inventory','mastery'].forEach(t => {
        const btn = document.getElementById(`btn-${t}`);
        if (btn) btn.classList.toggle('active', player.currentTab === t);
    });
}

function renderTab() {
    const content = document.getElementById('tab-content');
    if (!content) return;
    const attrColors = { "불": "#e74c3c", "번개": "#f39c12", "바람": "#27ae60", "중력": "#8e44ad", "물": "#2980b9", "독": "#16a085", "어둠": "#2c3e50" };
    const styles = window.RARITY_STYLE || {};

    if (player.currentTab === 'spells') {
        content.innerHTML = player.learnedSpells.length
            ? player.learnedSpells.slice().reverse().map(s =>
                `<div class="spell-item"><span><span style="color:${attrColors[s.attr]||'#333'};font-size:9px;">[${s.attr}]</span> ${s.name}</span><span class="mastery-badge">${s.mastery||0}%</span></div>`
              ).join('')
            : '<div style="padding:10px;text-align:center;color:#999;">학습된 마법 없음</div>';
    } else if (player.currentTab === 'inventory') {
        const w = player.equipped["무기"], a = player.equipped["방어구"];
        const backFn = () => renderScene(player.location);

        content.innerHTML = '';

        const makeItemBtn = (item, idx, isEquipped) => {
            const b = document.createElement('button');
            b.className = 'item-row item-btn';
            const col = styles[item.rarity]?.color || '#333';
            const tag = isEquipped ? '<b>[장착]</b> ' : '';
            b.innerHTML =
                `<span style="color:${col}">${tag}${item.name}</span>` +
                `<span style="font-size:10px;color:#aaa;">${item.slot}</span>`;
            b.onclick = () => showItemDetail(item, idx, isEquipped, backFn);
            content.appendChild(b);
        };

        if (!w && !a && player.inventory.length === 0) {
            content.innerHTML = '<div style="padding:10px;text-align:center;color:#999;">가방이 비어있습니다.</div>';
        } else {
            if (w) makeItemBtn(w, -1, true);
            if (a) makeItemBtn(a, -1, true);
            player.inventory.forEach((item, idx) => makeItemBtn(item, idx, false));
        }
    } else if (player.currentTab === 'mastery') {
        const attrs = window.ATTRIBUTES || [];
        content.innerHTML = attrs.map(a => {
            const inCircle = getLearnedCountInCircle(a, player.circle);
            const total = player.learnedSpells.filter(s => s.attr === a).length;
            return `<div class="item-row"><span style="color:${attrColors[a]||'#333'}">${a} 속성</span><span>${inCircle}/10 (전체 ${total})</span></div>`;
        }).join('');
    }
}

function switchTab(t) { player.currentTab = t; updateUI(); }

// ---- 저장/불러오기 ----

function saveGame() {
    const saveData = { ...player, inventory: player.inventory.map(i => ({ ...i, effect: undefined })) };
    localStorage.setItem('mage_save_v4', JSON.stringify(saveData));
    addLog("시스템", "저장 완료.", "log-sys");
}

function loadGame() {
    const raw = localStorage.getItem('mage_save_v4');
    if (!raw) return;
    const loaded = JSON.parse(raw);
    const allC = window.ITEMS_DB?.consumable || [];
    loaded.inventory = (loaded.inventory || []).map(item =>
        item.slot === "소비" ? { ...(allC.find(c => c.id === item.id) || item) } : item
    );
    if (!loaded.clearedStages) loaded.clearedStages = [];
    if (!loaded.currentStage) loaded.currentStage = null;
    if (!loaded.townExploreCount) loaded.townExploreCount = 0;
    if (!loaded.dailyQuests) loaded.dailyQuests = [];
    if (loaded.questsDay === undefined) loaded.questsDay = -1;
    if (!loaded.questProgress) loaded.questProgress = { kill: 0, research: 0, explore: 0, spell: 0, dungeon: 0, earn_gold: 0, npc: 0 };
    if (!loaded.synthesizedSpells) loaded.synthesizedSpells = [];
    if (loaded.karma === undefined) loaded.karma = 0;
    player = loaded;
    document.getElementById('start-overlay').style.display = 'none';
    addLog("시스템", "저장 데이터를 불러왔습니다.", "log-sys");
    renderScene(player.location || "Home");
}

function resetGame() {
    if (confirm("정말로 초기화하시겠습니까? 모든 진행 상황이 삭제됩니다.")) {
        localStorage.removeItem('mage_save_v4');
        location.reload();
    }
}

// ---- 마법 합성 ----

function openSynthesisScene() {
    if (player.researchPoints < 25) { addLog("경고", "연구P 부족 (필요: 25)."); return; }
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';

    const recipes = window.SYNTHESIS_RECIPES || [];
    const learnedAttrs = new Set(player.learnedSpells.map(s => s.attr));
    const attrC = { "불":"#e74c3c","번개":"#f39c12","바람":"#27ae60","중력":"#8e44ad","물":"#2980b9","독":"#16a085","어둠":"#2c3e50" };
    const effName = id => Object.values(STATUS_MAP).find(s => s.id === id)?.name || id;

    addLog("마법 합성 연구소", "두 속성 마법을 결합해 새로운 합성 마법을 만듭니다. 비용: 연구P 25.", "log-sys");

    recipes.forEach(recipe => {
        const canCraft = recipe.attrs.every(a => learnedAttrs.has(a));
        const alreadyHas = (player.synthesizedSpells || []).some(s => s.id === recipe.id);

        const b = document.createElement('button');
        b.className = 'excel-btn';
        const attrSpans = recipe.attrs.map(a => `<span style="color:${attrC[a]||'#8e44ad'}">${a}</span>`).join(' + ');
        b.innerHTML =
            `<b style="color:#8e44ad;">${recipe.name}</b> (${attrSpans})<br>` +
            `<small style="color:#888;">${recipe.desc}</small><br>` +
            `<small style="color:#555;">위력 ${recipe.power} / MP ${recipe.manaCost} / 상태이상: ${recipe.effects.map(effName).join(', ')}</small>`;

        if (alreadyHas) {
            b.innerHTML += ' <b style="color:#217346;">[습득 완료]</b>';
            b.style.opacity = '0.6';
        } else if (!canCraft) {
            const missing = recipe.attrs.filter(a => !learnedAttrs.has(a));
            b.innerHTML += `<br><small style="color:#aaa;">미보유 속성: ${missing.join(', ')}</small>`;
            b.style.opacity = '0.5';
        } else {
            b.style.borderColor = '#8e44ad';
            b.onclick = () => {
                player.researchPoints -= 25;
                if (!player.synthesizedSpells) player.synthesizedSpells = [];
                player.synthesizedSpells.push({ ...recipe });
                addLog("합성 성공!", `[${recipe.name}] 창조 완료! 전투 중 합성 마법으로 사용하세요.`, "log-attain");
                updateUI();
                openSynthesisScene();
                return;
            };
        }
        panel.appendChild(b);
    });

    addBtn(panel, "← 연구실로", () => renderScene("Lab"), "color:#666;border-color:#ccc;margin-top:4px;");
}

function useSynthesisSpell(recipe) {
    const enemy = combat.enemy;
    if (!enemy) return;

    // d20 합성 마법 판정 (DC 8)
    const synthRoll = d20Check(8);
    const synthLabel = synthRoll.crit ? '★ 크리티컬!' : synthRoll.fumble ? '★ 대실패!' : synthRoll.success ? '명중' : '빗나감';
    addLog("합성 마법 판정", `🎲 d20 = [${synthRoll.roll}] — ${synthLabel}`, "log-sys");

    if (synthRoll.fumble) {
        const backlash = Math.max(1, Math.floor(player.maxHp * 0.08));
        player.hp = Math.max(1, player.hp - backlash);
        addLog("합성 역류", `두 속성이 충돌하여 폭발! 자신에게 ${backlash} 피해. (대실패)`, "log-err");
        updateUI(); renderCombat(); return;
    }
    if (!synthRoll.success) {
        addLog("합성 실패", `${enemy.name}이 혼돈의 마법을 비켜갔습니다!`, "log-sys");
        enemyAttack(); return;
    }

    let dmg = Math.floor(recipe.power + getAtkBonus());
    if (synthRoll.crit) dmg = Math.floor(dmg * 2);
    let note = '';
    if (recipe.attrs.some(a  => enemy.weak?.includes(a)))    { dmg = Math.floor(dmg * 1.3); note = ' [부분 약점 1.3x]'; }
    else if (recipe.attrs.every(a => enemy.resist?.includes(a))) { dmg = Math.floor(dmg * 0.7); note = ' [양방 저항 0.7x]'; }

    const attrStr = recipe.attrs.join('+');
    const critNote = synthRoll.crit ? ' ★ 크리티컬!' : '';
    addLog(`합성 마법 — ${recipe.name}`, `[${attrStr}] 결합 발동!${note}${critNote} ${enemy.name}에게 ${dmg} 데미지!`, "log-attain");

    recipe.effects.forEach(effId => {
        // 합성 상태이상도 d20 판정 (DC 10 고정)
        const effRoll = d20Check(10);
        if (effRoll.success) {
            const turns = effRoll.crit ? 4 : 2;
            const prev = combat.statusEffects[effId] || 0;
            combat.statusEffects[effId] = Math.max(prev, turns);
            const def = Object.values(STATUS_MAP).find(s => s.id === effId);
            addLog("복합 상태이상", `[${def?.name||effId}] 부여! (${turns}턴) 🎲[${effRoll.roll}]`, "log-attain");
        }
    });

    trackQuest('spell', 1);
    enemyTakeDamage(dmg);
}

// ---- TRPG 분기 탐험 이벤트 ----

function triggerBranchEvent(stage) {
    const events = window.BRANCH_EVENTS || [];
    if (!events.length) return;
    const event = events[rng(0, events.length - 1)];

    addLog(`[탐험 이벤트] ${event.title}`, event.desc, "log-attain");

    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';

    event.choices.forEach(choice => {
        const b = document.createElement('button');
        b.className = 'excel-btn';
        b.innerHTML = `${choice.label}${choice.desc ? ` <small style="color:#888;">— ${choice.desc}</small>` : ''}`;

        // 비용 충족 여부 확인
        let blocked = false;
        const c = choice.cost || {};
        if (c.mana    && player.mana    < c.mana)    blocked = true;
        if (c.hp      && player.hp      <= c.hp + 5)  blocked = true;
        if (c.stamina && player.stamina < c.stamina) blocked = true;
        if (c.gold    && player.gold    < c.gold)    blocked = true;
        if (c.rp      && player.researchPoints < c.rp) blocked = true;

        if (blocked) {
            b.style.opacity = '0.4';
            b.onclick = () => addLog("불가", "조건을 충족하지 못합니다.");
        } else {
            b.onclick = () => resolveBranchChoice(event, choice, stage);
        }
        panel.appendChild(b);
    });
}

function resolveBranchChoice(event, choice, stage) {
    // 카르마 변동
    if (choice.karma) player.karma = Math.max(-100, Math.min(100, player.karma + choice.karma));

    // 비용 차감
    const c = choice.cost || {};
    if (c.mana)    player.mana    = Math.max(0, player.mana    - c.mana);
    if (c.hp)      player.hp      = Math.max(1, player.hp      - c.hp);
    if (c.stamina) player.stamina = Math.max(0, player.stamina - c.stamina);
    if (c.gold)    player.gold    = Math.max(0, player.gold    - c.gold);
    if (c.rp)      player.researchPoints = Math.max(0, player.researchPoints - c.rp);

    switch (choice.type) {
        case "pass":
            addLog("선택", "그냥 지나쳤습니다.", "log-sys");
            break;
        case "risky_loot": {
            const dc = Math.round(21 - (choice.successRate || 0.5) * 20);
            const { roll, success, crit, fumble } = d20Check(dc);
            addLog("판정", `🎲 d20 = [${roll}] vs DC ${dc} — ${crit ? '대성공!' : success ? '성공' : fumble ? '대실패!' : '실패'}`, "log-sys");
            if (success || crit) {
                const item = getRandomItem(); player.inventory.push(item);
                const extra = crit ? ` (대성공 — 추가 Gold +50!)` : '';
                if (crit) player.gold += 50;
                addLog("성공!", `[${item.rarity}] ${item.name} 발견!${extra}`, "log-attain");
            } else {
                const dmg = fumble ? rng(20, 40) : rng(10, 25);
                player.hp = Math.max(1, player.hp - dmg);
                addLog(fumble ? "대실패!" : "함정!", `함정에 걸렸습니다. HP -${dmg}${fumble ? ' (대실패 — 추가 피해!)' : ''}`, "log-err");
            }
            break; }
        case "safe_loot":
            { const item = getRandomItem(); player.inventory.push(item);
              addLog("발견!", `[${item.rarity}] ${item.name} 획득!`, "log-attain"); }
            break;
        case "kill_wounded":
            player.exp += choice.expGain||0; player.gold += choice.goldGain||0;
            addLog("처치", `EXP+${choice.expGain||0}, Gold+${choice.goldGain||0}G`, "log-sys");
            checkLevelUp(); break;
        case "heal_enemy":
            player.exp += choice.expGain||0;
            addLog("치료", `마물이 고마워하는 눈빛을 보냅니다. EXP+${choice.expGain||0}`, "log-attain");
            checkLevelUp(); break;
        case "blood_offer":
            player.exp += choice.expGain||0;
            addLog("제물", `제단에서 강렬한 에너지가 쏟아집니다. EXP+${choice.expGain||0}`, "log-attain");
            checkLevelUp(); break;
        case "gold_offer":
            if (choice.rpGain)   player.researchPoints += choice.rpGain;
            if (choice.manaGain) player.mana = Math.min(player.mana + choice.manaGain, player.maxMana);
            addLog("봉헌", `제단에서 빛이 쏟아집니다. 연구P+${choice.rpGain||0}, MP+${choice.manaGain||0}`, "log-attain");
            break;
        case "safe_path":
            player.exp += choice.expGain||0; player.gold += choice.goldGain||0;
            addLog("안전 경로", `EXP+${choice.expGain||0}, Gold+${choice.goldGain||0}G`, "log-sys");
            checkLevelUp(); break;
        case "risky_path": {
            const dc = Math.round(21 - (choice.successRate||0.5) * 20);
            const { roll, success, crit, fumble } = d20Check(dc);
            addLog("판정", `🎲 d20 = [${roll}] vs DC ${dc} — ${crit ? '대성공!' : success ? '성공' : fumble ? '대실패!' : '실패'}`, "log-sys");
            if (success || crit) {
                const expGain = crit ? Math.floor((choice.expGain||0) * 2) : (choice.expGain||0);
                const goldGain = crit ? Math.floor((choice.goldGain||0) * 2) : (choice.goldGain||0);
                player.exp += expGain; player.gold += goldGain;
                addLog("성공!", `어둠 속에서 귀한 것을 발견했습니다. EXP+${expGain}, Gold+${goldGain}G${crit ? ' (대성공 — 2배 보상!)' : ''}`, "log-attain");
                checkLevelUp();
            } else {
                const dmg = fumble ? rng(25, 45) : rng(15, 30);
                player.hp = Math.max(1, player.hp - dmg);
                addLog(fumble ? "대실패!" : "기습!", `어둠에서 기습을 당했습니다! HP -${dmg}${fumble ? ' (대실패 — 치명적 피해!)' : ''}`, "log-err");
            }
            break; }
        case "rescue":
            player.exp += choice.expGain||0;
            if (choice.rpGain) player.researchPoints += choice.rpGain;
            addLog("구출", `마법사를 해방했습니다. EXP+${choice.expGain||0}, 연구P+${choice.rpGain||0}`, "log-attain");
            checkLevelUp(); break;
        case "drain_mage":
            if (choice.manaGain) player.mana = Math.min(player.mana + choice.manaGain, player.maxMana);
            addLog("흡수", `마력을 흡수했습니다. MP+${choice.manaGain||0}`, "log-sys"); break;
        case "disarm_trap":
            player.exp += choice.expGain||0;
            addLog("함정 해제", `완벽하게 해제했습니다. EXP+${choice.expGain||0}`, "log-attain");
            checkLevelUp(); break;
        case "barrier_pass":
            { const d = rng(choice.hpLoss?.[0]||5, choice.hpLoss?.[1]||15);
              player.hp = Math.max(1, player.hp - d);
              addLog("통과", `방어막이 일부 막았습니다. HP -${d}`, "log-sys"); }
            break;
        case "dash_through": {
            const dc = Math.round(21 - (choice.successRate||0.5) * 20);
            const { roll, success, crit, fumble } = d20Check(dc);
            addLog("판정", `🎲 d20 = [${roll}] vs DC ${dc} — ${crit ? '대성공!' : success ? '성공' : fumble ? '대실패!' : '실패'}`, "log-sys");
            if (success || crit) {
                const rpBonus = crit ? 15 : 0;
                if (crit) player.researchPoints += rpBonus;
                addLog("회피", `재빠르게 함정을 피했습니다!${crit ? ` (대성공 — 함정 구조를 분석했습니다. 연구P +${rpBonus})` : ''}`, "log-attain");
            } else {
                const d = fumble ? Math.floor((choice.hpLoss?.[1]||30) * 1.5) : rng(choice.hpLoss?.[0]||10, choice.hpLoss?.[1]||30);
                player.hp = Math.max(1, player.hp - d);
                addLog(fumble ? "대실패!" : "피격!", `함정에 걸렸습니다! HP -${d}${fumble ? ' (대실패 — 완전히 당했습니다!)' : ''}`, "log-err");
            }
            break; }
        case "eat_herb": {
            const dc = Math.round(21 - (choice.successRate||0.5) * 20);
            const { roll, success, crit, fumble } = d20Check(dc);
            addLog("판정", `🎲 d20 = [${roll}] vs DC ${dc} — ${crit ? '대성공!' : success ? '성공' : fumble ? '대실패!' : '실패'}`, "log-sys");
            if (success || crit) {
                const hp = crit ? Math.floor((choice.hpGain||0) * 2) : (choice.hpGain||0);
                const mp = crit ? Math.floor((choice.manaGain||0) * 2) : (choice.manaGain||0);
                if (hp)   player.hp   = Math.min(player.hp + hp, player.maxHp);
                if (mp)   player.mana = Math.min(player.mana + mp, player.maxMana);
                addLog("효험!", `특효약이었습니다! HP+${hp}, MP+${mp}${crit ? ' (대성공 — 2배 효과!)' : ''}`, "log-attain");
            } else {
                const d = fumble ? Math.floor((choice.hpFailLoss||15) * 2) : (choice.hpFailLoss||15);
                player.hp = Math.max(1, player.hp - d);
                addLog(fumble ? "맹독!" : "독초!", `독초였습니다! HP -${d}${fumble ? ' (대실패 — 맹독!)' : ''}`, "log-err");
            }
            break; }
        case "take_herb":
            { const cons = window.ITEMS_DB?.consumable || [];
              const h = { ...(cons[rng(0, cons.length-1)]) }; player.inventory.push(h);
              addLog("채취", `[${h.name}] 획득`, "log-sys"); }
            break;
        case "heal_knight":
            player.exp += choice.expGain||0;
            addLog("치료", `'은혜를 잊지 않겠습니다.' EXP+${choice.expGain||0}`, "log-attain");
            checkLevelUp(); break;
        case "borrow_weapon":
            { const wDb = window.ITEMS_DB?.weapon || [];
              const w = { ...(wDb.find(x => x.id === 'w_iron_rod') || wDb[0]) };
              player.inventory.push(w);
              addLog("무기 획득", `[${w.name}] 획득`, "log-attain"); }
            break;
    }

    updateUI();
    if (player.hp <= 0) { showGameOver(null); return; }

    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    addBtn(panel, "← 계속하기", () => {
        if (stage) renderDungeonStageActions(stage);
        else renderScene("Town");
    });
}

// ---- 퀘스트 시스템 ----

function generateDailyQuests() {
    if (player.questsDay === player.day) return;
    const templates = window.QUEST_TEMPLATES || [];
    if (!templates.length) return;
    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    player.dailyQuests = shuffled.slice(0, 3).map(t => ({ ...t, progress: 0, done: false, claimed: false }));
    player.questsDay = player.day;
    player.questProgress = { kill: 0, research: 0, explore: 0, spell: 0, dungeon: 0, earn_gold: 0, npc: 0 };
    addLog("의뢰판 갱신", `Day ${player.day} — 새 의뢰 3개가 등록되었습니다. 마을 의뢰 보드를 확인하세요.`, "log-sys");
}

function trackQuest(type, amount) {
    if (!player.dailyQuests?.length) return;
    player.questProgress = player.questProgress || {};
    player.questProgress[type] = (player.questProgress[type] || 0) + amount;
    player.dailyQuests.forEach(q => {
        if (q.done || q.type !== type) return;
        q.progress = Math.min(q.goal, (q.progress || 0) + amount);
        if (q.progress >= q.goal) {
            q.done = true;
            addLog("의뢰 완료!", `[${q.title}] 완료! 마을 의뢰 보드에서 보상을 수령하세요.`, "log-attain");
        }
    });
}

function buildGuildScene(panel) {
    if (!player.dailyQuests?.length || player.questsDay !== player.day) generateDailyQuests();
    panel.innerHTML = '';

    const fmt = r => [r.exp ? `EXP+${r.exp}` : '', r.gold ? `Gold+${r.gold}G` : '', r.rp ? `연구P+${r.rp}` : ''].filter(Boolean).join(', ');

    addLog("의뢰 보드", `Day ${player.day}의 의뢰 목록입니다. 완료된 의뢰는 보상을 수령하세요.`, "log-sys");

    (player.dailyQuests || []).forEach(q => {
        const b = document.createElement('button');
        b.className = 'excel-btn';
        const pct = Math.floor((q.progress || 0) / q.goal * 100);
        const bar = `<div style="width:${pct}%;height:3px;background:#217346;margin-top:3px;"></div>`;
        const col = q.claimed ? '#aaa' : q.done ? '#217346' : '#555';
        const tag = q.claimed ? '[수령완료]' : q.done ? '[완료 — 보상 수령하기]' : `[진행 ${q.progress||0}/${q.goal}]`;
        b.innerHTML =
            `<span style="color:${col};font-weight:bold;">${tag}</span> ${q.title}<br>` +
            `<small style="color:#888;">${q.desc}</small><br>` +
            `<small style="color:#0078d4;">보상: ${fmt(q.reward)}</small>` +
            (q.claimed ? '' : bar);

        if (q.done && !q.claimed) {
            b.style.borderColor = '#217346';
            b.onclick = () => {
                q.claimed = true;
                if (q.reward.exp)  { player.exp += q.reward.exp; checkLevelUp(); }
                if (q.reward.gold) player.gold += q.reward.gold;
                if (q.reward.rp)   player.researchPoints += q.reward.rp;
                addLog("보상 수령", `[${q.title}] 보상: ${fmt(q.reward)}`, "log-attain");
                updateUI();
                buildGuildScene(panel);
            };
        } else {
            b.style.opacity = q.claimed ? '0.5' : '1';
            b.style.cursor = q.claimed ? 'default' : 'pointer';
            if (!q.done) b.onclick = () => {};
        }
        panel.appendChild(b);
    });

    addBtn(panel, "← 마을로", () => renderScene("Town"), "color:#666;border-color:#ccc;margin-top:4px;");
}
