import {createMinigame} from './common.js';
import {t,tf,addTranslations} from '../core/i18n.js';
import {pressurePhase,PRESSURE_LOW,PRESSURE_HIGH} from '../game/workshop17_core.js';
const rows=[['Production calibration','Üretim ayarı','Настройка производства'],['Valve pressure','Valf basıncı','Давление клапана'],['Signal terminals','Sinyal uçları','Сигнальные клеммы'],['Tap the valve in the green band, once per cycle. Three successful pulses.','Valfe yeşil aralıkta, tur başına bir kez bas. Üç başarılı darbe.','Нажми клапан в зелёной зоне, один раз за цикл. Три успешных импульса.'],['Connect the numbered terminals in the shown order.','Numaralı uçları gösterilen sırayla bağla.','Соедини пронумерованные клеммы в указанном порядке.'],['Space / click valve · Esc cancel · gamepad X','Boşluk / valfe tıkla · Esc iptal · gamepad X','Пробел / нажми клапан · Esc отмена · геймпад X'],['1 / 2 / 3 or click · arrows + Enter · Esc cancel · gamepad D-pad + X','1 / 2 / 3 veya tıkla · oklar + Enter · Esc iptal · gamepad yönler + X','1 / 2 / 3 или щелчок · стрелки + Enter · Esc отмена · геймпад стрелки + X'],['Waiting for broker confirmation','Tüccar onayı bekleniyor','Ожидание подтверждения брокера'],['Calibration verified. Parcel ready.','Ayar doğrulandı. Paket hazır.','Настройка подтверждена. Посылка готова.'],['Calibration missed. Batch retained; try the bay again.','Ayar kaçtı. Parti duruyor; bölmede tekrar dene.','Ошибка настройки. Партия сохранена; попробуй снова.'],['Calibration stopped. Batch retained.','Ayar durdu. Parti korunuyor.','Настройка остановлена. Партия сохранена.'],['Step {n}/3','Adım {n}/3','Шаг {n}/3'],['VALVE','VALF','КЛАПАН']];
for(const[i,lang]of[[1,'tr'],[2,'ru']])addTranslations(Object.fromEntries(rows.map(r=>[r[0],r[i]])),lang);
export function createWorkshop17(opts){
 const mg=createMinigame(opts,{kind:'workshop17',title:'Production calibration',tag:'WORKSHOP',width:320,height:170});
 let selected=1,padPrev=[],sent=false,lastStep=-1,lastState=null,ending=false;
 const state=()=>opts.getState();
 const act=terminal=>{const s=state();if(!s||sent||ending||s.complete||s.failed)return;sent=true;opts.action({token:s.token,id:s.id,step:s.step,terminal});};
 mg.onKeyDown=e=>{if(e.repeat)return false;const s=state();if(!s)return false;if(e.code==='ArrowLeft'||e.code==='ArrowRight'){selected=e.code==='ArrowRight'?(selected===3?1:selected+1):(selected===1?3:selected-1);return true;}const n=/^(Digit|Numpad)([123])$/.exec(e.code);if(s.mode==='signal'&&n){selected=+n[2];act(selected);return true;}if(['Space','Enter','NumpadEnter'].includes(e.code)){act(selected);return true;}return false;};
 mg.onPointerDown=p=>{if(p.x>284&&p.y<30){mg.finish({success:false,cancelled:true});return;}if(p.y>105&&p.y<149){const s=state();if(s?.mode==='signal')selected=Math.min(3,Math.max(1,Math.floor((p.x-20)/96)+1));act(selected);}};
 mg.onFrame=dt=>{const s=state(),ctx=mg.ctx;ctx.fillStyle='#101b20';ctx.fillRect(0,0,320,170);if(!s){mg.setStatus(t('Waiting for broker confirmation'));return;}
 if(!s.mode){mg.setStatus(t('Calibration stopped. Batch retained.'));if(!ending){ending=true;mg.finishAfter({success:false,cancelled:false},1.4,.5);}return;}
 if(s!==lastState){sent=false;lastState=s;}
 if(s.step!==lastStep){if(lastStep>=0)mg.sfx('ui_confirm');lastStep=s.step;sent=false;}
 const pressure=s.mode==='pressure';mg.setHelp(t(pressure?'Tap the valve in the green band, once per cycle. Three successful pulses.':'Connect the numbered terminals in the shown order.')+' · '+t(pressure?'Space / click valve · Esc cancel · gamepad X':'1 / 2 / 3 or click · arrows + Enter · Esc cancel · gamepad D-pad + X'));
 const text=(tx,x,y,color='#e2e9dd',size=13)=>{ctx.fillStyle=color;ctx.font=`${size}px monospace`;ctx.textAlign='center';ctx.fillText(tx,x,y);};
 text('×',304,22,'#d9c4aa',20);
 text(t(pressure?'Valve pressure':'Signal terminals'),160,24,'#c9d8db',16);
 text(tf('Step {n}/3',{n:Math.min(3,s.step+1)}),160,43,'#a4b3b8',13);
 if(pressure){const elapsed=s.elapsed+Math.max(0,opts.clock()-s.received);const phase=pressurePhase(elapsed);ctx.fillStyle='#31444a';ctx.fillRect(24,62,272,24);ctx.fillStyle='#69b883';ctx.fillRect(24+272*PRESSURE_LOW,62,272*(PRESSURE_HIGH-PRESSURE_LOW),24);ctx.fillStyle='#f6d286';ctx.fillRect(24+phase*272-2,58,4,32);ctx.fillStyle=sent?'#304549':'#687b7b';ctx.fillRect(90,109,140,36);text(t('VALVE'),160,132);}
 else {text(s.sequence.map((n,i)=>i<s.step?'✓':String(n)).join(' → '),160,80,'#f6d286',24);for(let n=1;n<=3;n++){ctx.fillStyle=n===selected?'#608875':'#30454e';ctx.fillRect(20+(n-1)*96,109,88,36);text(String(n),64+(n-1)*96,134,'#e2e9dd',24);}}
 mg.setStatus(t(s.complete?'Calibration verified. Parcel ready.':s.failed?(s.reason==='miss'?'Calibration missed. Batch retained; try the bay again.':'Calibration stopped. Batch retained.'):sent?'Waiting for broker confirmation':tf('Step {n}/3',{n:Math.min(3,s.step+1)})));
 if(!ending&&(s.complete||s.failed)){ending=true;mg.finishAfter({success:!!s.complete,cancelled:false},1.4,.5);}
 try{const pad=[...(navigator.getGamepads?.()||[])].find(Boolean);if(pad){const buttons=pad.buttons.map(b=>b.pressed);if(buttons[14]&&!padPrev[14])selected=selected===1?3:selected-1;if(buttons[15]&&!padPrev[15])selected=selected===3?1:selected+1;if(buttons[2]&&!padPrev[2])act(selected);if(buttons[1]&&!padPrev[1])mg.finish({success:false,cancelled:true});padPrev=buttons;}}catch{/* pad optional */}
 };
 mg.api.workshop17=true;return mg.api;
}
