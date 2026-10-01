// Signature salvage stays in the native item/economy/fragility pipeline.
export const SALVAGE27_ITEMS = Object.freeze([
  {id:'replydrum27',name:'Reply Drum',kind:'scrap',value:[150,220],weight:48,hands:2,fragile:.5,bulky:true,
    tip:'Loose reels chatter when you rush or shake it. Walk quietly, ask a friend to help carry, or load the trolley.'},
  {id:'indexedglass27',name:'Indexed Glass',kind:'big',value:[145,205],weight:38,hands:0,fragile:.8,mass:12,
    tip:'An archive pane suspended in a steel frame. Carry it with the grab beam; brake before tight turns.'},
  {id:'archivesorter27',name:'Archive Sorter',kind:'scrap',value:[85,135],weight:14,hands:1,
    tip:'A sturdy sorter for undelivered posts. Easy to carry; no extra noise or upkeep.'},
]);
// Ordinary medium/higher facilities only. Counts still belong to stock placement.
// Beginner factory/mineshaft and liminal floor pools remain unchanged.
export const SALVAGE27_SCRAP = Object.freeze({
  office:[['replydrum27',1],['archivesorter27',2]],
  serverfarm:[['replydrum27',1],['archivesorter27',2]],
  hospital:[['replydrum27',.6],['archivesorter27',1]],
  mansion:[['replydrum27',.6],['archivesorter27',1]],
});
export const SALVAGE27_BIG = Object.freeze({
  office:[['indexedglass27',1]],serverfarm:[['indexedglass27',1]],
  hospital:[['indexedglass27',.6]],mansion:[['indexedglass27',1]],
});
export const SALVAGE27_SOUND = Object.freeze({
  sample:.1,itemGap:1.8,globalGap:.35,maxTracked:64,
  fast:3.25,sprintMoving:1.4,looseSpeed:2.8,looseSpin:3.5,maxPoseStep:2.5,loud:.72,
});
