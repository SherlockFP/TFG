import assert from 'node:assert/strict';
import * as THREE from 'three';
import { C13 } from '../../src/game/wardrobe13_data.js';
import { C13_SUITS, C13_BACKS } from '../../src/models/wardrobe13_models.js';
import { createAvatar } from '../../src/models/avatar.js';
import { installCosmetics, entry } from '../../src/game/cosmetics.js';
import { owns5, buyOffer, ensureC5Profile, offersFor } from '../../src/game/cosm5.js';
import { encodeLook, decodeLook } from '../../src/game/cosm5_data.js';
import { applySkin, clearSkin, skinOf } from '../../src/render/weaponskins.js';
import { curateWardrobe } from '../../src/game/wardrobe13_core.js';
import { defaultProfile, saveProfile, loadProfile } from '../../src/core/save.js';
import { hasTranslation } from '../../src/core/i18n.js';
import { claimable, unlockAt } from '../../src/game/wallet.js';
const data=new Map(); globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
assert.equal(C13.filter(e=>e.slot!=='skin').length,12); assert.equal(C13.filter(e=>e.slot==='skin').length,4);
for(const e of C13) for(const lang of ['tr','ru']) for(const s of [e.name,e.desc,e.how]) assert.ok(hasTranslation(lang,s),`${lang}: ${s}`);
const p=defaultProfile(); const game={profile:p, mods:{on:()=>()=>{},emit:()=>{}},progress:{save:()=>saveProfile(p),canClaim:price=>claimable(p.coins,price)}};
const cos=installCosmetics(game);
for(const e of C13.filter(e=>e.slot!=='skin')) { assert.ok(entry(e.slot,e.id)); assert.equal(cos.owns(e.slot,e.id),false); assert.equal(cos.equip(e.slot,e.id),false); }
assert.equal(cos.buy('suit:dockrigger').ok,false); p.level=3;p.coins=unlockAt(180)-1; assert.equal(cos.buy('suit:dockrigger').ok,false);
p.coins++; assert.equal(cos.buy('suit:dockrigger').ok,true); assert.equal(cos.equip('suit','dockrigger'),true);assert.equal(p.coins,unlockAt(180));
assert.equal(loadProfile().suit,'dockrigger'); assert.ok(loadProfile().cosmetics.suits.includes('dockrigger'));
// Every actual avatar silhouette builds without a hidden builder exception; backs attach to existing frames.
let warnings=0;const oldWarn=console.warn;console.warn=()=>warnings++;
for(const e of C13.filter(e=>e.slot!=='skin')) { const avatar=createAvatar();avatar.setLook({suit:e.slot==='suit'?e.id:'orange',back:e.slot==='back'?e.id:'none'});assert.equal(avatar.getLook()[e.slot],e.id);let added=0;avatar.root.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position?.count)added++;});assert.ok(added>10);avatar.dispose?.(); }
console.warn=oldWarn;assert.equal(warnings,0);
assert.equal(Object.keys(C13_SUITS).length,8);assert.equal(Object.keys(C13_BACKS).length,4);
for(const e of C13.filter(e=>e.slot==='skin')) {
 const q=ensureC5Profile(defaultProfile());assert.equal(owns5(q,e),false);
 let day=0;while(day<1000&&!offersFor(q,day).offers.some(o=>o.key==='skin:'+e.id))day++;assert.ok(day<1000);
 assert.equal(buyOffer(q,'skin:'+e.id,{day}).ok,false);q.level=e.minLevel;q.coins=unlockAt(e.price);assert.equal(buyOffer(q,'skin:'+e.id,{day}).ok,true);assert.equal(owns5(q,e),true);
 q.cosm5.skin=e.id;saveProfile(q);assert.equal(loadProfile().cosm5.skin,e.id);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial({color:0x888888}));const orig=mesh.material;
 assert.equal(applySkin(mesh,e.id),1);assert.equal(skinOf(mesh),e.id);const sh={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};mesh.material.onBeforeCompile(sh);assert.ok(sh.fragmentShader.includes('C5P'));assert.equal(clearSkin(mesh),1);assert.equal(mesh.material,orig);
 const look={suit:'dockrigger',hat:'none',back:'spoolpack13',skin:e.id};assert.equal(decodeLook(encodeLook(look)).skin,e.id);
}
const entries=C13.filter(e=>e.slot==='suit');assert.equal(curateWardrobe(entries,p,()=>false).length,4);assert.equal(curateWardrobe(entries,p,()=>false,undefined,'all').length,8);
cos.dispose();console.log('wardrobe13: gated claim/equip/save, 12 silhouettes, 4 material finishes, translations, sync and compact catalogue passed');
