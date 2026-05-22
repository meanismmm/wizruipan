// ---------------------------------------------------------
// ENGINE LOGIC - ULTIMATE v3.8
// ---------------------------------------------------------

let player = {
    day: 1, stamina: 100, maxStamina: 100, hp: 60, maxHp: 60, mana: 30, maxMana: 30,
    level: 1, exp: 0, maxExp: 100, circle: 0, researchPoints: 10, gold: 200,
    learnedSpells: [], inventory: [], equipped: { "무기": null, "방어구": null },
    location: "Home", currentTab: 'spells', statuses: [], staminaMod: 1.0, expMod: 1.0, manaRegenMod: 0, inCombat: false
};

function safeExec(fn) {
    return function(...args) {
        try { if(fn) fn(...args); } 
        catch (e) { addLog("시스템 오류", e.message, "log-err"); }
    }
}

window.onload = () => {
    if(localStorage.getItem('mage_raising_save_v38')) document.getElementById('load-btn').style.display='block';
    switchTab('spells');
};

function startGame() {
    document.getElementById('start-overlay').style.display='none';
    addLog("프롤로그", "잿더미 속에서 구원받은 당신의 연대기가 시작됩니다.", "log-final");
    addLog("에드먼드", "'살아남았구나. 이제 어떤 마력을 선택해 운명을 개척하겠느냐?'", "log-attain");
    renderScene("Home");
}

function addLog(title, text, type = '') {
    const win = document.getElementById('log-area');
    if(!win) return;
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerHTML = `<span class="log-name">${title}</span>${text}`;
    win.appendChild(div);
    win.scrollTop = win.scrollHeight;
}

function updateUI() {
    if(player.hp <= 0 && !player.inCombat) { 
        alert("여정이 끝났습니다."); 
        localStorage.removeItem('mage_raising_save_v38'); 
        location.reload(); 
        return; 
    }
    
    document.getElementById('ui-circle').innerText = player.circle;
    document.getElementById('ui-level').innerText = player.level;
    document.getElementById('ui-day').innerText = `${player.day} Day`;
    document.getElementById('ui-res').innerText = player.researchPoints;
    document.getElementById('ui-gold').innerText = player.gold;
    
    document.getElementById('st-fill').style.width = `${(player.stamina/player.maxStamina)*100}%`;
    document.getElementById('hp-fill').style.width = `${(player.hp/player.maxHp)*100}%`;
    document.getElementById('mana-fill').style.width = `${(player.mana/player.maxMana)*100}%`;
    document.getElementById('exp-fill').style.width = `${(player.exp/player.maxExp)*100}%`;
    
    document.getElementById('eq-main').innerText = `${player.equipped["무기"]?player.equipped["무기"].name:"없음"} / ${player.equipped["방어구"]?player.equipped["방어구"].name:"없음"}`;

    const content = document.getElementById('tab-content');
    if(player.currentTab === 'spells') {
        content.innerHTML = player.learnedSpells.length ? player.learnedSpells.slice().reverse().map(s => `<div class="spell-item"><span>${s.name}</span><span class="mastery-badge">${s.mastery}%</span></div>`).join('') : '<div style="padding:20px;text-align:center;color:#999;">학습된 마법 없음</div>';
    } else if (player.currentTab === 'inventory') {
        content.innerHTML = player.inventory.length ? player.inventory.map((itm, idx) => `
            <div class="item-row">
                <span>${itm.name}</span>
                <div>
                    <button class="excel-btn" style="padding:2px 5px;font-size:9px;" onclick="equipOrUse(${idx})">액션</button>
                    <button class="excel-btn" style="padding:2px 5px;font-size:9px;" onclick="discard(${idx})">버림</button>
                </div>
            </div>`).join('') : '<div style="padding:20px;text-align:center;color:#999;">가방 비어있음</div>';
    } else {
        content.innerHTML = window.ATTRIBUTES.map(a => {
            const count = player.learnedSpells.filter(s => s.attr === a && s.circle === player.circle).length;
            return `<div class="item-row"><span>${a} 속성</span><span style="float:right;">${count}/10</span></div>`;
        }).join('');
    }
}

function useStamina(amt) {
    if(player.stamina < amt) { addLog("경고", "기력이 부족합니다. 휴식하십시오.", "log-err"); return false; }
    player.stamina -= amt;
    return true;
}

function researchAction() {
    if(player.mana < 15) { addLog("경고", "마나가 부족하여 정신을 집중할 수 없습니다.", "log-err"); return; }
    if(!useStamina(25)) return;
    
    player.mana -= 15;
    
    // 연구 확률: 1/20 (5%) + 자질 보너스 (연구포인트 * 0.05%)
    const chance = 0.05 + (player.researchPoints * 0.0005);
    const roll = Math.random();
    
    if(roll < chance) {
        const attr = window.ATTRIBUTES[Math.floor(Math.random()*7)];
        const learnedInCircle = player.learnedSpells.filter(s => s.attr === attr && s.circle === player.circle).length;
        
        if(learnedInCircle < 10) {
            const spell = window.SPELLS_DB[attr][player.circle][learnedInCircle];
            player.learnedSpells.push({...spell, mastery: 0});
            addLog("연구성공", `진리를 깨달았습니다! [${spell.name}] 습득! (확률: ${Math.floor(chance*100)}%)`, "log-attain");
            player.exp += 50;
        } else addLog("연구", "이미 이 서클의 해당 속성은 통달했습니다.");
    } else {
        addLog("연구실패", `지식의 파편을 놓쳤습니다... (확률: ${Math.floor(chance*100)}%)`, "log-sys");
        player.researchPoints += 1;
    }
    updateUI();
}

function renderScene(key) {
    player.location = key;
    const panel = document.getElementById('action-grid');
    panel.innerHTML = '';
    addLog("이동", `[${key}] 도착.`, "log-sys");

    if(key === "Home") {
        if(player.circle === 0) {
            window.ATTRIBUTES.forEach(attr => {
                const btn = document.createElement('button');
                btn.className = 'excel-btn'; btn.innerText = `[${attr}] 입문`;
                btn.onclick = () => {
                    player.circle = 1; player.maxMana = 80; player.mana = 80;
                    const s = window.SPELLS_DB[attr][1][0];
                    player.learnedSpells.push({...s, mastery: 10});
                    addLog("입문", `[${attr}]의 길을 선택했습니다. 기초 마법 [${s.name}]을 습득했습니다.`, "log-attain");
                    renderScene("Home");
                };
                panel.appendChild(btn);
            });
        } else {
            const acts = [
                { t: "휴식하기 (다음 날)", a: () => { player.day++; player.stamina=player.maxStamina; player.mana=player.maxMana; player.hp=Math.min(player.hp+30, player.maxHp); addLog("휴식", "기력을 모두 회복했습니다."); renderScene("Home"); }},
                { t: "연구실로 이동", a: () => renderScene("Lab") },
                { t: "마을 탐색", a: () => { if(useStamina(20)) { player.exp += 30; addLog("마을", "경험을 쌓았습니다."); updateUI(); } } },
                { t: "마법사의 탑", a: () => { if(useStamina(30)) { addLog("전투", "그림자 괴수와 마주쳤습니다!"); player.inCombat=true; renderCombat(); } } }
            ];
            acts.forEach(o => { const b=document.createElement('button'); b.className='excel-btn'; b.innerText=o.t; b.onclick=safeExec(o.a); panel.appendChild(b); });
        }
    } else if (key === "Lab") {
        const acts = [
            { t: "마법 연구 (St-25, MP-15)", a: researchAction },
            { t: "오두막으로", a: () => renderScene("Home") }
        ];
        acts.forEach(o => { const b=document.createElement('button'); b.className='excel-btn'; b.innerText=o.t; b.onclick=safeExec(o.a); panel.appendChild(b); });
    }
    updateUI();
}

function renderCombat() {
    const panel = document.getElementById('action-grid'); panel.innerHTML = '';
    player.learnedSpells.slice(-3).forEach(s => {
        const b = document.createElement('button'); b.className = 'excel-btn'; b.innerText = `${s.name}`;
        b.onclick = safeExec(() => {
            if(player.mana < s.manaCost) { addLog("경고", "마력 부족!"); return; }
            player.mana -= s.manaCost;
            addLog("공격", `${s.name} 시전! 적을 물리쳤습니다.`, "log-attain");
            player.inCombat = false; player.exp += 100; renderScene(player.location);
        });
        panel.appendChild(b);
    });
    const run = document.createElement('button'); run.className='excel-btn'; run.innerText="도망치기";
    run.onclick = () => { player.inCombat=false; renderScene(player.location); };
    panel.appendChild(run);
}

function switchTab(t) {
    player.currentTab = t;
    ['spells', 'inventory', 'mastery'].forEach(id => {
        const el = document.getElementById(`btn-${id}`);
        if(el) el.classList.toggle('active', id === t);
    });
    updateUI();
}

function saveGame() { localStorage.setItem('mage_raising_save_v38', JSON.stringify(player)); addLog("시스템", "저장 완료."); }
function equipOrUse(idx) { player.equipped["무기"] = player.inventory.splice(idx, 1)[0]; updateUI(); }
function discard(idx) { player.inventory.splice(idx, 1); updateUI(); }
function loadGame() { player = JSON.parse(localStorage.getItem('mage_raising_save_v38')); document.getElementById('start-overlay').style.display='none'; renderScene(player.location); }
